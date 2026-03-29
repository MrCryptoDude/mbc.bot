import { TwitterApi } from "twitter-api-v2";
import { config } from "../config";
import { MentionEvent, TopComment } from "../types";
import { logger } from "../utils/logger";
import fs from "fs";

const client = new TwitterApi({
  appKey: config.twitter.apiKey,
  appSecret: config.twitter.apiSecret,
  accessToken: config.twitter.accessToken,
  accessSecret: config.twitter.accessSecret,
});

const readOnlyClient = new TwitterApi(config.twitter.bearerToken);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postTweet(text: string, mediaPath?: string, replyToTweetId?: string): Promise<string | null> {
  try {
    let mediaId: string | undefined;

    if (mediaPath && fs.existsSync(mediaPath)) {
      logger.info(`Uploading media: ${mediaPath} (${(fs.statSync(mediaPath).size / 1024).toFixed(1)} KB)`);
      mediaId = await uploadMedia(mediaPath);
      if (mediaId) {
        logger.info(`Media uploaded successfully: ${mediaId}`);
      } else {
        logger.error("Media upload returned undefined — tweet will post without image");
      }
    } else if (mediaPath) {
      logger.error(`Media file not found: ${mediaPath}`);
    }

    const payload: any = { text };
    if (mediaId) {
      payload.media = { media_ids: [mediaId] as [string] };
    }
    if (replyToTweetId) {
      payload.reply = { in_reply_to_tweet_id: replyToTweetId };
    }

    const result = await client.v2.tweet(payload);
    logger.info(`Tweet posted: ${result.data.id}`, { chars: text.length, hasMedia: !!mediaId });
    return result.data.id;
  } catch (err) {
    logger.error("Failed to post tweet", { error: String(err) });
    return null;
  }
}

// ─── Post a single manga episode tweet (image + title + description + vote options) ───

export async function postEpisodeTweet(
  title: string,
  description: string,
  choices: [string, string, string],
  mediaPath?: string,
  replyToTweetId?: string
): Promise<string | null> {
  // Build single tweet: title + short description + vote options
  const optionLabels = ["🅰️", "🅱️", "🅲️"];
  const optionLines = choices
    .filter(o => o && o.trim().length > 0)
    .map((opt, i) => `${optionLabels[i]} ${opt}`)
    .join("\n");

  let text = `${title}\n\n${description}`;

  // Add vote options if we have room
  const voteBlock = `\n\n${optionLines}\n\n💬 Vote in replies!`;
  if (text.length + voteBlock.length <= 280) {
    text += voteBlock;
  } else {
    // Shorten description to fit vote options
    const maxDescLen = 280 - title.length - voteBlock.length - 4; // 4 for \n\n
    if (maxDescLen > 30) {
      text = `${title}\n\n${description.slice(0, maxDescLen).trim()}...${voteBlock}`;
    } else {
      // Just title + options
      text = `${title}${voteBlock}`;
    }
  }

  if (text.length > 280) {
    text = text.slice(0, 277) + "...";
  }

  logger.info(`Posting episode tweet: ${text.length} chars, hasMedia: ${!!mediaPath}`);
  return postTweet(text, mediaPath, replyToTweetId);
}

// ─── Post poll as reply (kept for backward compat but we prefer inline voting now) ───

export async function postEpisodePoll(parentTweetId: string, options: [string, string, string]): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await client.v2.tweet({
        text: "Vote for the next page path:",
        reply: { in_reply_to_tweet_id: parentTweetId },
        poll: {
          options: options.map((o) => o.slice(0, 25)),
          duration_minutes: Math.max(5, config.bot.voteWindowMinutes),
        },
      });
      return result.data.id;
    } catch (err) {
      const errorText = String(err);
      const isRateLimit = errorText.includes("429");
      if (isRateLimit && attempt < 3) {
        const backoffMs = 2000 * attempt;
        logger.warn("Poll post rate-limited; retrying", { attempt, backoffMs, parentTweetId });
        await sleep(backoffMs);
        continue;
      }
      logger.error("Failed to post poll", { error: errorText, parentTweetId });
      return null;
    }
  }
  return null;
}

export async function getPollWinner(
  pollTweetId: string
): Promise<{ winningOptionText: string | null; winningIndex: number | null }> {
  try {
    const result = await readOnlyClient.v2.singleTweet(pollTweetId, {
      expansions: ["attachments.poll_ids"],
      "poll.fields": ["id", "options", "voting_status"],
    });

    const polls = (result as any)?.includes?.polls as Array<{ options: Array<{ position: number; label: string; votes: number }> }> | undefined;
    const poll = polls?.[0];
    if (!poll || !poll.options || poll.options.length === 0) {
      return { winningOptionText: null, winningIndex: null };
    }

    const winner = [...poll.options].sort((a, b) => (b.votes || 0) - (a.votes || 0))[0];
    return {
      winningOptionText: winner?.label || null,
      winningIndex: winner ? winner.position - 1 : null,
    };
  } catch (err) {
    logger.error("Failed to fetch poll winner", { error: String(err), pollTweetId });
    return { winningOptionText: null, winningIndex: null };
  }
}

export async function getTopComments(tweetId: string, limit: number = 5): Promise<TopComment[]> {
  try {
    const query = `conversation_id:${tweetId} is:reply -from:${config.bot.username}`;
    const result = await readOnlyClient.v2.search(query, {
      "tweet.fields": ["public_metrics", "author_id", "created_at"],
      "user.fields": ["username"],
      expansions: ["author_id"],
      max_results: 50,
    });

    const tweets = result.data?.data || [];
    const users = result.data?.includes?.users || [];
    const userMap = new Map<string, string>();
    for (const user of users) {
      userMap.set(user.id, user.username);
    }

    return tweets
      .map((tweet) => ({
        text: tweet.text,
        authorHandle: userMap.get(tweet.author_id || "") || "unknown",
        authorId: tweet.author_id || "",
        likeCount: tweet.public_metrics?.like_count || 0,
        tweetId: tweet.id,
      }))
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, limit);
  } catch (err) {
    logger.error("Failed to get comments", { error: String(err), tweetId });
    return [];
  }
}

export async function getMentions(sinceId?: string | null): Promise<MentionEvent[]> {
  try {
    const me = await client.v2.me();
    const result = await client.v2.userMentionTimeline(me.data.id, {
      since_id: sinceId || undefined,
      expansions: ["author_id", "referenced_tweets.id"],
      "tweet.fields": ["author_id", "public_metrics", "referenced_tweets"],
      "user.fields": ["username"],
      max_results: 50,
    });

    const tweets = result.data?.data || [];
    const users = result.data?.includes?.users || [];
    const userMap = new Map<string, string>();
    for (const user of users) {
      userMap.set(user.id, user.username);
    }

    return tweets
      .map((tweet) => {
        const replyRef = tweet.referenced_tweets?.find((r) => r.type === "replied_to");
        return {
          tweetId: tweet.id,
          text: tweet.text,
          authorId: tweet.author_id || "",
          authorHandle: userMap.get(tweet.author_id || "") || "unknown",
          inReplyToTweetId: replyRef?.id || null,
          likeCount: tweet.public_metrics?.like_count || 0,
        } as MentionEvent;
      })
      .sort((a, b) => Number(a.tweetId) - Number(b.tweetId));
  } catch (err) {
    logger.error("Failed to get mentions", { error: String(err) });
    return [];
  }
}

async function uploadMedia(filePath: string): Promise<string | undefined> {
  try {
    return await client.v1.uploadMedia(filePath, {
      mimeType: filePath.endsWith(".png") ? "image/png" : "image/jpeg",
    });
  } catch (err) {
    logger.error("Media upload failed", { error: String(err), filePath });
    return undefined;
  }
}

export async function getBotUserId(): Promise<string | null> {
  try {
    const me = await client.v2.me();
    return me.data.id;
  } catch (err) {
    logger.error("Failed to get bot user ID", { error: String(err) });
    return null;
  }
}

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

export async function postTweet(text: string, mediaPath?: string, replyToTweetId?: string): Promise<string | null> {
  try {
    let mediaId: string | undefined;

    if (mediaPath && fs.existsSync(mediaPath)) {
      mediaId = await uploadMedia(mediaPath);
    }

    const payload: any = { text };
    if (mediaId) {
      payload.media = { media_ids: [mediaId] as [string] };
    }
    if (replyToTweetId) {
      payload.reply = { in_reply_to_tweet_id: replyToTweetId };
    }

    const result = await client.v2.tweet(payload);
    return result.data.id;
  } catch (err) {
    logger.error("Failed to post tweet", { error: String(err) });
    return null;
  }
}

export async function postEpisodeTweet(
  title: string,
  description: string,
  choices: [string, string, string],
  mediaPath?: string,
  replyToTweetId?: string
): Promise<string | null> {
  const shortDescription = description.slice(0, 160);
  let text = `${title}\n\n${shortDescription}`;
  const choicesText = `\n\nA) ${choices[0]}\nB) ${choices[1]}\nC) ${choices[2]}`;
  if ((text + choicesText).length <= 280) {
    text = `${text}${choicesText}`;
  } else if (text.length > 280) {
    text = `${title}\n\n${description.slice(0, Math.max(0, 280 - title.length - 6))}...`;
  }
  return postTweet(text, mediaPath, replyToTweetId);
}

export async function postEpisodePoll(parentTweetId: string, options: [string, string, string]): Promise<string | null> {
  try {
    const result = await client.v2.tweet({
      text: "Vote for the next episode path:",
      reply: { in_reply_to_tweet_id: parentTweetId },
      poll: {
        options: options.map((o) => o.slice(0, 25)),
        duration_minutes: Math.max(5, config.bot.voteWindowMinutes),
      },
    });
    return result.data.id;
  } catch (err) {
    logger.error("Failed to post poll", { error: String(err), parentTweetId });
    return null;
  }
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

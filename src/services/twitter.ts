import { TwitterApi } from "twitter-api-v2";
import { config } from "../config";
import { TopComment } from "../types";
import { logger } from "../utils/logger";
import fs from "fs";

// ─── Initialize Twitter client ───

const client = new TwitterApi({
  appKey: config.twitter.apiKey,
  appSecret: config.twitter.apiSecret,
  accessToken: config.twitter.accessToken,
  accessSecret: config.twitter.accessSecret,
});

const readOnlyClient = new TwitterApi(config.twitter.bearerToken);

// ─── Post a tweet with optional media ───

export async function postTweet(text: string, mediaPath?: string): Promise<string | null> {
  try {
    let mediaId: string | undefined;

    if (mediaPath && fs.existsSync(mediaPath)) {
      logger.info(`Uploading media: ${mediaPath}`);
      mediaId = await uploadMedia(mediaPath);
    }

    let result;
    if (mediaId) {
      result = await client.v2.tweet({
        text,
        media: { media_ids: [mediaId] as [string] },
      });
    } else {
      result = await client.v2.tweet(text);
    }
    const tweetId = result.data.id;
    logger.info(`Posted tweet: ${tweetId}`, { chars: text.length, hasMedia: !!mediaId });
    return tweetId;
  } catch (err) {
    logger.error("Failed to post tweet", { error: String(err) });
    return null;
  }
}

// ─── Reply to a tweet ───

export async function replyToTweet(text: string, replyToId: string): Promise<string | null> {
  try {
    const result = await client.v2.tweet({
      text,
      reply: { in_reply_to_tweet_id: replyToId },
    });
    const tweetId = result.data.id;
    logger.info(`Posted reply: ${tweetId}`, { replyTo: replyToId });
    return tweetId;
  } catch (err) {
    logger.error("Failed to reply to tweet", { error: String(err), replyTo: replyToId });
    return null;
  }
}

// ─── Post a thread (lore + CTA as reply) ───

export async function postLoreThread(
  loreText: string,
  callToAction: string,
  mediaPath?: string
): Promise<{ loreTweetId: string | null; ctaTweetId: string | null }> {
  // Post main lore tweet with media
  const loreTweetId = await postTweet(loreText, mediaPath);
  if (!loreTweetId) {
    return { loreTweetId: null, ctaTweetId: null };
  }

  // Post CTA as a reply
  const ctaTweetId = await replyToTweet(callToAction, loreTweetId);

  return { loreTweetId, ctaTweetId };
}

// ─── Get top comments on a tweet (by like count) ───

export async function getTopComments(tweetId: string, limit: number = 5): Promise<TopComment[]> {
  try {
    // Search for replies to our tweet
    const query = `conversation_id:${tweetId} is:reply -from:${config.bot.username}`;

    const result = await readOnlyClient.v2.search(query, {
      "tweet.fields": ["public_metrics", "author_id", "created_at"],
      "user.fields": ["username"],
      expansions: ["author_id"],
      max_results: 50,
    });

    const tweets = result.data?.data || [];
    const users = result.data?.includes?.users || [];

    // Build user lookup
    const userMap = new Map<string, string>();
    for (const user of users) {
      userMap.set(user.id, user.username);
    }

    // Sort by likes and return top results
    const comments: TopComment[] = tweets
      .map((tweet) => ({
        text: tweet.text,
        authorHandle: userMap.get(tweet.author_id || "") || "unknown",
        likeCount: tweet.public_metrics?.like_count || 0,
        tweetId: tweet.id,
      }))
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, limit);

    logger.info(`Retrieved ${comments.length} comments for tweet ${tweetId}`, {
      topLikes: comments[0]?.likeCount || 0,
    });

    return comments;
  } catch (err) {
    logger.error("Failed to get comments", { error: String(err), tweetId });
    return [];
  }
}

// ─── Upload media (image or video) ───

async function uploadMedia(filePath: string): Promise<string | undefined> {
  try {
    const isVideo = filePath.endsWith(".mp4") || filePath.endsWith(".mov");

    if (isVideo) {
      // Video uses chunked upload
      const mediaId = await client.v1.uploadMedia(filePath, {
        mimeType: "video/mp4",
        target: "tweet",
        longVideo: false,
      });
      logger.info(`Video uploaded: ${mediaId}`);
      return mediaId;
    } else {
      // Image upload
      const mediaId = await client.v1.uploadMedia(filePath, {
        mimeType: filePath.endsWith(".png") ? "image/png" : "image/jpeg",
      });
      logger.info(`Image uploaded: ${mediaId}`);
      return mediaId;
    }
  } catch (err) {
    logger.error("Media upload failed", { error: String(err), filePath });
    return undefined;
  }
}

// ─── Get own user ID (for filtering) ───

export async function getBotUserId(): Promise<string | null> {
  try {
    const me = await client.v2.me();
    return me.data.id;
  } catch (err) {
    logger.error("Failed to get bot user ID", { error: String(err) });
    return null;
  }
}

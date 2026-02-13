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

// ─── Split text into thread-sized chunks (max 280 chars each) ───

function splitIntoThread(text: string): string[] {
  const MAX_CHARS = 275; // Leave room for thread numbering
  const chunks: string[] = [];

  // First try splitting on double newlines (paragraph breaks)
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If a single paragraph fits in remaining space, add it
    if ((currentChunk + "\n\n" + paragraph).trim().length <= MAX_CHARS) {
      currentChunk = currentChunk ? currentChunk + "\n\n" + paragraph : paragraph;
    }
    // If the paragraph itself is too long, split by sentences
    else if (paragraph.length > MAX_CHARS) {
      // Save current chunk first
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      // Split long paragraph by sentences
      const sentences = paragraph.match(/[^.!?]+[.!?]+[\s]*/g) || [paragraph];
      for (const sentence of sentences) {
        if ((currentChunk + " " + sentence).trim().length <= MAX_CHARS) {
          currentChunk = currentChunk ? currentChunk + " " + sentence.trim() : sentence.trim();
        } else {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          // If a single sentence is still too long, hard split
          if (sentence.trim().length > MAX_CHARS) {
            const words = sentence.trim().split(/\s+/);
            currentChunk = "";
            for (const word of words) {
              if ((currentChunk + " " + word).length <= MAX_CHARS) {
                currentChunk = currentChunk ? currentChunk + " " + word : word;
              } else {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = word;
              }
            }
          } else {
            currentChunk = sentence.trim();
          }
        }
      }
    }
    // Paragraph doesn't fit but is normal size — start new chunk
    else {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // If we somehow got nothing, return the original text split hard
  if (chunks.length === 0) {
    chunks.push(text.slice(0, MAX_CHARS));
  }

  return chunks;
}

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

// ─── Post a full lore thread (multiple tweets + CTA) ───

export async function postLoreThread(
  loreText: string,
  callToAction: string,
  mediaPath?: string
): Promise<{ loreTweetId: string | null; ctaTweetId: string | null }> {
  // Split lore into thread chunks
  const chunks = splitIntoThread(loreText);
  logger.info(`Splitting lore into ${chunks.length}-tweet thread`);

  let firstTweetId: string | null = null;
  let lastTweetId: string | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const isFirst = i === 0;
    const chunk = chunks[i]!;

    if (isFirst) {
      // First tweet gets the media (video/image)
      firstTweetId = await postTweet(chunk, mediaPath);
      if (!firstTweetId) {
        return { loreTweetId: null, ctaTweetId: null };
      }
      lastTweetId = firstTweetId;
    } else {
      // Subsequent tweets are replies in the thread
      const replyId = await replyToTweet(chunk, lastTweetId!);
      if (!replyId) {
        logger.warn(`Thread broken at tweet ${i + 1}/${chunks.length}`);
        break;
      }
      lastTweetId = replyId;
    }

    // Small delay between tweets to avoid rate limits
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Post CTA as final reply
  let ctaTweetId: string | null = null;
  if (lastTweetId && callToAction) {
    await new Promise((r) => setTimeout(r, 1500));
    ctaTweetId = await replyToTweet(`\u{1F5F3}\uFE0F ${callToAction}`, lastTweetId);
  }

  logger.info(`Thread posted: ${chunks.length} tweets + CTA`, { firstTweetId });
  return { loreTweetId: firstTweetId, ctaTweetId };
}

// ─── Get top comments on a tweet (by like count) ───

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
      const mediaId = await client.v1.uploadMedia(filePath, {
        mimeType: "video/mp4",
        target: "tweet",
        longVideo: false,
      });
      logger.info(`Video uploaded: ${mediaId}`);
      return mediaId;
    } else {
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

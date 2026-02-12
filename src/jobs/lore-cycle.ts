import { db } from "../services/database";
import { generateLorePost, generateChapterSummary } from "../services/dungeon-master";
import { generateMedia } from "../services/media-generator";
import { postLoreThread, getTopComments } from "../services/twitter";
import { StoryContext, LorePost } from "../types";
import { logger } from "../utils/logger";
import { config } from "../config";

// ─── Main lore cycle ───

export async function runLoreCycle(): Promise<void> {
  logger.info("═══ Starting lore cycle ═══");

  try {
    // Step 1: Resolve previous post's community vote (if any)
    await resolvePreviousVote();

    // Step 2: Build story context
    const context = buildStoryContext();

    // Step 3: Generate next lore post via AI
    const aiResponse = await generateLorePost(context);
    logger.info("AI generated lore", {
      chars: aiResponse.loreText.length,
      hasVideoPrompt: !!aiResponse.videoPrompt,
    });

    // Step 4: Generate media (video or fallback image)
    const media = await generateMedia(aiResponse.videoPrompt);

    // Step 5: Post to Twitter
    const { loreTweetId, ctaTweetId } = await postLoreThread(
      aiResponse.loreText,
      `🗳️ ${aiResponse.callToAction}`,
      media?.localPath
    );

    if (!loreTweetId) {
      logger.error("Failed to post lore tweet — aborting cycle");
      return;
    }

    // Step 6: Save to database
    const post = db.addPost({
      content: aiResponse.loreText,
      videoPrompt: aiResponse.videoPrompt,
      mediaUrl: media?.localPath || null,
      mediaType: media?.type || "image",
      tweetId: loreTweetId,
      chapterNumber: db.getNextChapterNumber(),
      votingMode: "comment",
      winningComment: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    });

    // Step 7: Update chapter summary every 10 posts
    if (post.chapterNumber % 10 === 0) {
      await updateChapterSummary();
    }

    logger.info(`═══ Lore cycle complete — Chapter ${post.chapterNumber} posted ═══`, {
      tweetId: loreTweetId,
      mediaType: media?.type || "none",
    });
  } catch (err) {
    logger.error("Lore cycle failed", { error: String(err), stack: (err as Error).stack });
  }
}

// ─── Resolve the previous post's community vote ───

async function resolvePreviousVote(): Promise<void> {
  const lastPost = db.getLastPost();
  if (!lastPost || !lastPost.tweetId || lastPost.resolvedAt) {
    return; // No previous post, or already resolved
  }

  logger.info(`Resolving vote for post #${lastPost.id}...`, { tweetId: lastPost.tweetId });

  const comments = await getTopComments(lastPost.tweetId, 1);

  if (comments.length > 0 && comments[0]) {
    const winner = comments[0];
    logger.info(`Top comment by @${winner.authorHandle} (${winner.likeCount} likes): "${winner.text}"`);

    db.updatePost(lastPost.id, {
      winningComment: winner.text,
      resolvedAt: new Date().toISOString(),
    });
  } else {
    logger.info("No comments found — AI will decide story direction autonomously");
    db.updatePost(lastPost.id, {
      winningComment: null,
      resolvedAt: new Date().toISOString(),
    });
  }
}

// ─── Build the story context for the AI ───

function buildStoryContext(): StoryContext {
  const recentPosts = db.getRecentPosts(5);
  const worldState = db.getWorldState();
  const chapterSummary = db.getChapterSummary();
  const lastPost = db.getLastPost();

  return {
    recentPosts,
    worldState,
    chapterSummary,
    lastDecision: lastPost?.winningComment || null,
  };
}

// ─── Update chapter summary ───

async function updateChapterSummary(): Promise<void> {
  const recentPosts = db.getRecentPosts(10);
  const postsForSummary = recentPosts.map((p) => ({
    content: p.content,
    winningComment: p.winningComment,
  }));

  const summary = await generateChapterSummary(postsForSummary);
  const existingSummary = db.getChapterSummary();

  // Append to existing summary rather than replace
  const newSummary = existingSummary ? `${existingSummary}\n\n${summary}` : summary;
  db.updateChapterSummary(newSummary);

  logger.info("Chapter summary updated", { totalLength: newSummary.length });
}

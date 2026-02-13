import { db } from "../services/database";
import { generateChapterSummary, generateLorePost } from "../services/dungeon-master";
import { generateMedia } from "../services/media-generator";
import { getPollWinner, postEpisodePoll, postEpisodeTweet } from "../services/twitter";
import { StoryContext } from "../types";
import { logger } from "../utils/logger";

export interface StoryModeDeps {
  resolvePollWinner: (pollTweetId: string) => Promise<{ winningOptionText: string | null }>;
  generateEpisode: typeof generateLorePost;
  generateSummary: typeof generateChapterSummary;
  generateImage: (prompt: string) => Promise<{ localPath: string; type: "image" } | null>;
  postEpisode: (
    title: string,
    description: string,
    choices: [string, string, string],
    mediaPath?: string
  ) => Promise<string | null>;
  postPoll: (parentTweetId: string, options: [string, string, string]) => Promise<string | null>;
}

const defaultDeps: StoryModeDeps = {
  resolvePollWinner: getPollWinner,
  generateEpisode: generateLorePost,
  generateSummary: generateChapterSummary,
  generateImage: generateMedia,
  postEpisode: postEpisodeTweet,
  postPoll: postEpisodePoll,
};

export function createStoryModeRunner(deps: StoryModeDeps = defaultDeps) {
  return async function runStoryModeCycle(): Promise<void> {
    logger.info("Starting Story Mode cycle");

    try {
      await resolvePreviousPoll(deps);

      const context = buildStoryContext();
      const aiResponse = await deps.generateEpisode(context);
      const choices: [string, string, string] = [
        aiResponse.pollOptions[0] || "Option A",
        aiResponse.pollOptions[1] || "Option B",
        aiResponse.pollOptions[2] || "Option C",
      ];

      const media = await deps.generateImage(aiResponse.mangaPrompt);
      const tweetId = await deps.postEpisode(aiResponse.tweetTitle, aiResponse.loreText, choices, media?.localPath);
      if (!tweetId) {
        logger.error("Failed to post Story Mode episode");
        return;
      }

      const pollTweetId = await deps.postPoll(tweetId, choices);
      const chapterNumber = db.getNextChapterNumber();
      const post = db.addPost({
        content: aiResponse.loreText,
        mangaPrompt: aiResponse.mangaPrompt,
        mediaUrl: media?.localPath || null,
        mediaType: "image",
        tweetId,
        pollTweetId,
        pollOptions: choices,
        winningOption: null,
        chapterNumber,
        votingMode: "comment",
        winningComment: null,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      });

      if (post.chapterNumber % 10 === 0) {
        await updateChapterSummary(deps);
      }
    } catch (err) {
      logger.error("Story Mode cycle failed", { error: String(err) });
    }
  };
}

export const runLoreCycle = createStoryModeRunner();

async function resolvePreviousPoll(deps: StoryModeDeps): Promise<void> {
  const lastPost = db.getLastPost();
  if (!lastPost || !lastPost.pollTweetId || lastPost.resolvedAt) {
    return;
  }

  const winner = await deps.resolvePollWinner(lastPost.pollTweetId);
  db.updatePost(lastPost.id, {
    winningComment: winner.winningOptionText,
    winningOption: winner.winningOptionText,
    resolvedAt: new Date().toISOString(),
  });
}

function buildStoryContext(): StoryContext {
  const recentPosts = db.getRecentPosts(5);
  const worldState = db.getWorldState();
  const chapterSummary = db.getChapterSummary();
  const lastPost = db.getLastPost();

  return {
    recentPosts,
    worldState,
    chapterSummary,
    lastDecision: lastPost?.winningOption || lastPost?.winningComment || null,
  };
}

async function updateChapterSummary(deps: StoryModeDeps): Promise<void> {
  const recentPosts = db.getRecentPosts(10);
  const postsForSummary = recentPosts.map((p) => ({
    content: p.content,
    winningComment: p.winningOption || p.winningComment,
  }));
  const summary = await deps.generateSummary(postsForSummary);
  const existing = db.getChapterSummary();
  db.updateChapterSummary(existing ? `${existing}\n\n${summary}` : summary);
}

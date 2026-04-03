import { db } from "../services/database";
import { decideArcLengths, generateChapterSummary, generateLorePost } from "../services/dungeon-master";
import { generateMedia } from "../services/media-generator";
import { fetchCryptoNews, formatNewsForPrompt } from "../services/news-fetcher";
import { getPollWinner, postEpisodePoll, postEpisodeTweet } from "../services/twitter";
import { StoryContext, StoryProgression } from "../types";
import { logger } from "../utils/logger";

export interface StoryModeDeps {
  resolvePollWinner: (pollTweetId: string) => Promise<{ winningOptionText: string | null }>;
  generateEpisode: typeof generateLorePost;
  decideArcLengths: typeof decideArcLengths;
  generateSummary: typeof generateChapterSummary;
  generateImage: (prompt: string) => Promise<{ localPath: string; type: "image" } | null>;
  postEpisode: (
    title: string,
    description: string,
    choices: [string, string, string],
    mediaPath?: string
  ) => Promise<string | null>;
  postPoll: (parentTweetId: string, options: [string, string, string]) => Promise<string | null>;
  fetchNews: () => Promise<string>;
}

const defaultDeps: StoryModeDeps = {
  resolvePollWinner: getPollWinner,
  generateEpisode: generateLorePost,
  decideArcLengths,
  generateSummary: generateChapterSummary,
  generateImage: generateMedia,
  postEpisode: postEpisodeTweet,
  postPoll: postEpisodePoll,
  fetchNews: async () => {
    const news = await fetchCryptoNews();
    return formatNewsForPrompt(news);
  },
};

export function createStoryModeRunner(deps: StoryModeDeps = defaultDeps) {
  return async function runStoryModeCycle(): Promise<void> {
    logger.info("═══ Starting Story Mode cycle ═══");

    try {
      // Step 1: Resolve previous poll
      await resolvePreviousPoll(deps);

      // Step 2: Fetch real crypto news
      const newsContext = await deps.fetchNews();
      if (newsContext) {
        logger.info("Crypto news fetched for story context");
      }

      // Step 3: Get/update progression
      let progression = db.getStoryProgression();
      progression = await refreshArcTargetsIfNeeded(deps, progression);
      db.updateStoryProgression(progression);

      // Step 4: Build context with news
      const context = buildStoryContext(progression, newsContext);

      // Step 5: Generate story page
      const aiResponse = await deps.generateEpisode(context);
      const choices: [string, string, string] = [
        aiResponse.pollOptions[0] || "Option A",
        aiResponse.pollOptions[1] || "Option B",
        aiResponse.pollOptions[2] || "Option C",
      ];

      // Step 6: Generate manga image
      const media = await deps.generateImage(aiResponse.mangaPrompt);
      if (!media?.localPath) {
        logger.error("Skipping post — image generation failed");
        return;
      }

      // Step 7: Post tweet with image + vote options
      const tweetId = await deps.postEpisode(aiResponse.tweetTitle, aiResponse.loreText, choices, media.localPath);
      if (!tweetId) {
        logger.error("Failed to post episode tweet");
        return;
      }

      // Step 8: Post poll as reply
      const pollTweetId = await deps.postPoll(tweetId, choices);

      // Step 9: Save to database
      db.addPost({
        content: aiResponse.loreText,
        mangaPrompt: aiResponse.mangaPrompt,
        mediaUrl: media.localPath,
        mediaType: "image",
        tweetId,
        pollTweetId,
        pollOptions: choices,
        winningOption: null,
        newsContext: newsContext || null,
        pageNumber: progression.pageNumber,
        episodeNumber: progression.episodeNumber,
        pageInEpisode: progression.pageInEpisode,
        episodeInChapter: progression.episodeInChapter,
        chapterNumber: progression.chapterNumber,
        votingMode: "poll",
        winningComment: null,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      });

      // Step 10: Advance progression
      const nextProgression = getNextProgression(progression);
      db.updateStoryProgression(nextProgression);

      // Step 11: Chapter summary on chapter transition
      if (nextProgression.chapterNumber !== progression.chapterNumber) {
        await updateChapterSummary(deps, progression.chapterNumber);
      }

      logger.info(`═══ Story Mode complete — Ch${progression.chapterNumber} Ep${progression.episodeNumber} Pg${progression.pageNumber} ═══`, {
        tweetId, hasNews: !!newsContext,
      });
    } catch (err) {
      logger.error("Story Mode cycle failed", { error: String(err) });
    }
  };
}

export const runLoreCycle = createStoryModeRunner();

// ─── Resolve previous poll ───

async function resolvePreviousPoll(deps: StoryModeDeps): Promise<void> {
  const lastPost = db.getLastPost();
  if (!lastPost || !lastPost.pollTweetId || lastPost.resolvedAt) return;

  const winner = await deps.resolvePollWinner(lastPost.pollTweetId);
  db.updatePost(lastPost.id, {
    winningComment: winner.winningOptionText,
    winningOption: winner.winningOptionText,
    resolvedAt: new Date().toISOString(),
  });
}

// ─── Build story context with news ───

function buildStoryContext(progression: StoryProgression, newsContext: string): StoryContext {
  const recentPosts = db.getRecentPosts(5);
  const worldState = db.getWorldState();
  const chapterSummary = db.getChapterSummary();
  const lastPost = db.getLastPost();

  return {
    recentPosts,
    worldState,
    chapterSummary,
    lastDecision: lastPost?.winningOption || lastPost?.winningComment || null,
    progression,
    newsContext,
  };
}

// ─── Chapter summary ───

async function updateChapterSummary(deps: StoryModeDeps, chapterNumber: number): Promise<void> {
  const chapterPosts = db.getPosts().filter((p) => p.chapterNumber === chapterNumber);
  const postsForSummary = chapterPosts.map((p) => ({
    content: p.content,
    winningComment: p.winningOption || p.winningComment,
  }));
  if (postsForSummary.length === 0) return;

  const summary = await deps.generateSummary(postsForSummary);
  const existing = db.getChapterSummary();
  db.updateChapterSummary(existing ? `${existing}\n\n${summary}` : summary);
}

// ─── Progression logic ───

function getNextProgression(current: StoryProgression): StoryProgression {
  const next: StoryProgression = {
    ...current,
    pageNumber: current.pageNumber + 1,
    pageInEpisode: current.pageInEpisode + 1,
  };

  if (current.pageInEpisode >= current.targetPagesInEpisode) {
    next.episodeNumber = current.episodeNumber + 1;
    next.episodeInChapter = current.episodeInChapter + 1;
    next.pageInEpisode = 1;
  }

  if (next.episodeInChapter > current.targetEpisodesInChapter) {
    next.chapterNumber = current.chapterNumber + 1;
    next.episodeInChapter = 1;
  }

  return next;
}

async function refreshArcTargetsIfNeeded(deps: StoryModeDeps, progression: StoryProgression): Promise<StoryProgression> {
  const needsEpisodeTarget = progression.pageInEpisode === 1;
  const needsChapterTarget = progression.pageInEpisode === 1 && progression.episodeInChapter === 1;
  if (!needsEpisodeTarget && !needsChapterTarget) return progression;

  const recentPages = db.getRecentPosts(8).map((p) => `Pg${p.pageNumber}: ${p.content.slice(0, 180)}`);
  const decided = await deps.decideArcLengths({
    chapterNumber: progression.chapterNumber,
    episodeNumber: progression.episodeNumber,
    recentPageSummaries: recentPages,
    chapterSummary: db.getChapterSummary(),
  });

  return {
    ...progression,
    targetPagesInEpisode: decided.targetPagesInEpisode,
    targetEpisodesInChapter: needsChapterTarget ? decided.targetEpisodesInChapter : progression.targetEpisodesInChapter,
  };
}

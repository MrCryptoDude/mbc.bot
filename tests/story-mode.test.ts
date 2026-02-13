import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

function setBaseEnv(dataDir: string): void {
  process.env.TWITTER_API_KEY = "x";
  process.env.TWITTER_API_SECRET = "x";
  process.env.TWITTER_ACCESS_TOKEN = "x";
  process.env.TWITTER_ACCESS_SECRET = "x";
  process.env.TWITTER_BEARER_TOKEN = "x";
  process.env.OPENAI_API_KEY = "x";
  process.env.DATA_DIR = dataDir;
  process.env.POST_INTERVAL_HOURS = "3";
  process.env.VOTE_WINDOW_MINUTES = "30";
}

function cleanup(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("Story Mode posts episode and creates poll metadata", async () => {
  const dataDir = path.resolve("data/test-story-post");
  cleanup(dataDir);
  setBaseEnv(dataDir);

  const { db } = await import("../src/services/database");
  const { createStoryModeRunner } = await import("../src/jobs/lore-cycle");

  db.reset();
  const run = createStoryModeRunner({
    resolvePollWinner: async () => ({ winningOptionText: null }),
    generateEpisode: async () => ({
      loreText: "Episode description",
      tweetTitle: "Episode 1",
      mangaPrompt: "anime prompt",
      callToAction: "",
      pollOptions: ["A1", "B1", "C1"],
      internalNotes: "",
    }),
    generateSummary: async () => "",
    generateImage: async () => null,
    postEpisode: async () => "tweet-1",
    postPoll: async () => "poll-1",
  });

  await run();
  const posts = db.getPosts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.tweetId, "tweet-1");
  assert.equal(posts[0]?.pollTweetId, "poll-1");
  assert.deepEqual(posts[0]?.pollOptions, ["A1", "B1", "C1"]);
});

test("Story Mode resolves previous poll and passes winner into next context", async () => {
  const dataDir = path.resolve("data/test-story-poll");
  cleanup(dataDir);
  setBaseEnv(dataDir);

  const { db } = await import("../src/services/database");
  const { createStoryModeRunner } = await import("../src/jobs/lore-cycle");

  db.reset();
  db.addPost({
    content: "Old chapter",
    mangaPrompt: "old prompt",
    mediaUrl: null,
    mediaType: "image",
    tweetId: "old-tweet",
    pollTweetId: "old-poll",
    pollOptions: ["Left", "Right", "Wait"],
    winningOption: null,
    chapterNumber: 1,
    votingMode: "comment",
    winningComment: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  });

  let seenDecision: string | null = null;
  const run = createStoryModeRunner({
    resolvePollWinner: async () => ({ winningOptionText: "Right" }),
    generateEpisode: async (ctx) => {
      seenDecision = ctx.lastDecision;
      return {
        loreText: "New chapter",
        tweetTitle: "Episode 2",
        mangaPrompt: "new prompt",
        callToAction: "",
        pollOptions: ["A2", "B2", "C2"],
        internalNotes: "",
      };
    },
    generateSummary: async () => "",
    generateImage: async () => null,
    postEpisode: async () => "tweet-2",
    postPoll: async () => "poll-2",
  });

  await run();
  const posts = db.getPosts();
  assert.equal(posts[0]?.winningOption, "Right");
  assert.equal(seenDecision, "Right");
  assert.equal(posts[1]?.chapterNumber, 2);
});

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
}

function cleanup(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("DnD Mode creates session and only requester can continue in solo mode", async () => {
  const dataDir = path.resolve("data/test-dnd-solo");
  cleanup(dataDir);
  setBaseEnv(dataDir);

  const { createDnDModeRunner } = await import("../src/jobs/dnd-cycle");
  const { sessionState } = await import("../src/services/session-state");

  const generatedInputs: Array<string | null> = [];
  let call = 0;
  let postCall = 0;
  const run = createDnDModeRunner({
    fetchMentions: async () => [
      {
        tweetId: "10",
        text: "@MEMEBACKEDCURR haunted castle run",
        authorId: "user-1",
        authorHandle: "u1",
        inReplyToTweetId: null,
        likeCount: 0,
      },
      {
        tweetId: "11",
        text: "continue from outsider",
        authorId: "user-2",
        authorHandle: "u2",
        inReplyToTweetId: "bot-1",
        likeCount: 3,
      },
      {
        tweetId: "12",
        text: "continue from requester",
        authorId: "user-1",
        authorHandle: "u1",
        inReplyToTweetId: "bot-1",
        likeCount: 1,
      },
    ],
    fetchTopComments: async () => [],
    generateEpisode: async (_premise, _history, selectedInput) => {
      generatedInputs.push(selectedInput);
      return {
        loreText: `desc-${call++}`,
        tweetTitle: `title-${call}`,
        mangaPrompt: "img",
        callToAction: "",
        pollOptions: ["A", "B", "C"],
        internalNotes: "",
      };
    },
    generateImage: async () => null,
    postEpisode: async () => {
      postCall += 1;
      return postCall === 1 ? "bot-1" : "bot-2";
    },
  });

  await run();
  const session = sessionState.getByRootTweetId("10");
  assert.ok(session);
  assert.equal(session?.mode, "solo");
  assert.equal(session?.episodeCount, 2);
  assert.equal(generatedInputs[1], "continue from requester");
});

test("DnD Mode community continuation uses highest-liked reply", async () => {
  const dataDir = path.resolve("data/test-dnd-community");
  cleanup(dataDir);
  setBaseEnv(dataDir);

  const { createDnDModeRunner } = await import("../src/jobs/dnd-cycle");

  const generatedInputs: Array<string | null> = [];
  let call = 0;
  let postCall = 0;
  const run = createDnDModeRunner({
    fetchMentions: async () => [
      {
        tweetId: "20",
        text: "@MEMEBACKEDCURR COMMUNITY cyber samurai wasteland",
        authorId: "user-9",
        authorHandle: "u9",
        inReplyToTweetId: null,
        likeCount: 0,
      },
      {
        tweetId: "21",
        text: "some reply",
        authorId: "user-2",
        authorHandle: "u2",
        inReplyToTweetId: "bot-c1",
        likeCount: 1,
      },
    ],
    fetchTopComments: async () => [{ tweetId: "winner-tweet", text: "top community choice", authorId: "user-4", likeCount: 99 }],
    generateEpisode: async (_premise, _history, selectedInput) => {
      generatedInputs.push(selectedInput);
      return {
        loreText: `desc-${call++}`,
        tweetTitle: `title-${call}`,
        mangaPrompt: "img",
        callToAction: "",
        pollOptions: ["A", "B", "C"],
        internalNotes: "",
      };
    },
    generateImage: async () => null,
    postEpisode: async () => {
      postCall += 1;
      return postCall === 1 ? "bot-c1" : "bot-c2";
    },
  });

  await run();
  assert.equal(generatedInputs[1], "top community choice");
});

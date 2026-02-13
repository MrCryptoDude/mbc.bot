import { generateDnDEpisode } from "../services/dungeon-master";
import { generateMedia } from "../services/media-generator";
import { sessionState } from "../services/session-state";
import { getMentions, getTopComments, postEpisodeTweet } from "../services/twitter";
import { DndSession, MentionEvent } from "../types";
import { logger } from "../utils/logger";

const BOT_HANDLE = "MEMEBACKEDCURR";

export interface DndModeDeps {
  fetchMentions: (sinceId?: string | null) => Promise<MentionEvent[]>;
  fetchTopComments: (tweetId: string, limit?: number) => Promise<Array<{ tweetId: string; text: string; authorId?: string; likeCount: number }>>;
  generateEpisode: typeof generateDnDEpisode;
  generateImage: (prompt: string) => Promise<{ localPath: string; type: "image" } | null>;
  postEpisode: (
    title: string,
    description: string,
    choices: [string, string, string],
    mediaPath: string | undefined,
    replyToTweetId?: string
  ) => Promise<string | null>;
}

const defaultDeps: DndModeDeps = {
  fetchMentions: getMentions,
  fetchTopComments: getTopComments,
  generateEpisode: generateDnDEpisode,
  generateImage: generateMedia,
  postEpisode: postEpisodeTweet,
};

export function shouldAcceptContinuation(session: DndSession, mention: MentionEvent): boolean {
  if (mention.inReplyToTweetId !== session.awaitingReplyToTweetId) {
    return false;
  }
  if (session.mode === "community") {
    return true;
  }
  return mention.authorId === session.requesterId;
}

function parsePremise(text: string): { premise: string; mode: "solo" | "community" } | null {
  const cleaned = text.replace(new RegExp(`@${BOT_HANDLE}`, "ig"), " ").trim();
  if (!cleaned) {
    return null;
  }
  const mode = cleaned.toUpperCase().includes("COMMUNITY") ? "community" : "solo";
  const premise = cleaned.replace(/COMMUNITY/ig, "").trim();
  if (!premise) {
    return null;
  }
  return { premise, mode };
}

export function createDnDModeRunner(deps: DndModeDeps = defaultDeps) {
  return async function runDnDModeCycle(): Promise<void> {
    const meta = sessionState.getMeta();
    const mentions = await deps.fetchMentions(meta.lastMentionId);
    if (mentions.length === 0) {
      return;
    }

    for (const mention of mentions) {
      const lastMentionId = mention.tweetId;
      await processMention(mention, deps);
      sessionState.updateMeta({ lastMentionId });
    }
  };
}

export const runDnDModeCycle = createDnDModeRunner();

async function processMention(mention: MentionEvent, deps: DndModeDeps): Promise<void> {
  if (!mention.inReplyToTweetId) {
    await maybeCreateSession(mention, deps);
    return;
  }

  const session = sessionState.getByAwaitingTweetId(mention.inReplyToTweetId);
  if (!session) {
    return;
  }
  if (!shouldAcceptContinuation(session, mention)) {
    return;
  }

  if (session.mode === "community") {
    const top = await deps.fetchTopComments(session.awaitingReplyToTweetId, 1);
    if (!top[0]) {
      return;
    }
    await continueSession(session, top[0].text, top[0].tweetId, top[0].authorId || mention.authorId, deps);
    return;
  }

  await continueSession(session, mention.text, mention.tweetId, mention.authorId, deps);
}

async function maybeCreateSession(mention: MentionEvent, deps: DndModeDeps): Promise<void> {
  if (!mention.text.toUpperCase().includes(`@${BOT_HANDLE}`)) {
    return;
  }
  if (sessionState.getByRootTweetId(mention.tweetId)) {
    return;
  }

  const parsed = parsePremise(mention.text);
  if (!parsed) {
    return;
  }

  const ai = await deps.generateEpisode(parsed.premise, [], null);
  const choices: [string, string, string] = [
    ai.pollOptions[0] || "Option A",
    ai.pollOptions[1] || "Option B",
    ai.pollOptions[2] || "Option C",
  ];
  const media = await deps.generateImage(ai.mangaPrompt);
  const botTweetId = await deps.postEpisode(ai.tweetTitle, ai.loreText, choices, media?.localPath, mention.tweetId);
  if (!botTweetId) {
    logger.error("Failed to create DnD session tweet", { mentionId: mention.tweetId });
    return;
  }

  const now = new Date().toISOString();
  sessionState.upsert({
    rootTweetId: mention.tweetId,
    requesterId: mention.authorId,
    requesterHandle: mention.authorHandle,
    premise: parsed.premise,
    mode: parsed.mode,
    createdAt: now,
    updatedAt: now,
    episodeCount: 1,
    awaitingReplyToTweetId: botTweetId,
    turns: [
      {
        sourceTweetId: mention.tweetId,
        sourceAuthorId: mention.authorId,
        sourceText: mention.text,
        generatedTweetId: botTweetId,
        generatedAt: now,
      },
    ],
  });
}

async function continueSession(
  session: DndSession,
  sourceText: string,
  sourceTweetId: string,
  sourceAuthorId: string,
  deps: DndModeDeps
): Promise<void> {
  const history = session.turns.map((turn) => turn.sourceText);
  const ai = await deps.generateEpisode(session.premise, history, sourceText);
  const choices: [string, string, string] = [
    ai.pollOptions[0] || "Option A",
    ai.pollOptions[1] || "Option B",
    ai.pollOptions[2] || "Option C",
  ];
  const media = await deps.generateImage(ai.mangaPrompt);
  const botTweetId = await deps.postEpisode(
    ai.tweetTitle,
    ai.loreText,
    choices,
    media?.localPath,
    session.awaitingReplyToTweetId
  );
  if (!botTweetId) {
    return;
  }

  const now = new Date().toISOString();
  session.turns.push({
    sourceTweetId,
    sourceAuthorId,
    sourceText,
    generatedTweetId: botTweetId,
    generatedAt: now,
  });
  session.awaitingReplyToTweetId = botTweetId;
  session.updatedAt = now;
  session.episodeCount += 1;
  sessionState.upsert(session);
}

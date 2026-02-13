import OpenAI from "openai";
import { config } from "../config";
import { AILoreResponse, StoryContext } from "../types";
import { logger } from "../utils/logger";
import { parseAndValidateEpisode } from "./episode-format";

const client = new OpenAI({ apiKey: config.openai.apiKey });

const BASE_SYSTEM_PROMPT = `You are the narrator for a serialized fantasy anime story in a crypto-themed world.
Keep continuity with prior episodes and user choices.
Return output in this exact schema:

TITLE:
[episode title]
DESCRIPTION:
[very short episode description, 1-2 short paragraphs, max 220 chars total]
CHOICE_A:
[choice A, <=25 chars]
CHOICE_B:
[choice B, <=25 chars]
CHOICE_C:
[choice C, <=25 chars]
IMAGE_PROMPT:
[anime image prompt for one scene composition; explicitly include 2-3 speech bubble lines to render]
`;

function buildStoryModePrompt(context: StoryContext): string {
  const lastChapter = context.recentPosts[context.recentPosts.length - 1];
  const nextChapter = lastChapter ? lastChapter.chapterNumber + 1 : 1;
  const recent = context.recentPosts
    .slice(-5)
    .map((post) => `Chapter ${post.chapterNumber}: ${post.content.slice(0, 400)}`)
    .join("\n");

  return [
    `Generate chapter ${nextChapter} for the main timeline.`,
    context.chapterSummary ? `Story summary:\n${context.chapterSummary}` : "No story summary yet.",
    recent ? `Recent chapters:\n${recent}` : "No previous chapters yet.",
    context.lastDecision ? `Last winning community decision: ${context.lastDecision}` : "No prior decision.",
    `Requirements: keep stakes high, concise but vivid, and provide choices that branch the story.`,
    `DESCRIPTION must stay very short (max 220 chars).`,
    `IMAGE_PROMPT must specify readable speech bubbles with exact short dialogue text.`,
  ].join("\n\n");
}

function buildDnDModePrompt(premise: string, history: string[], decision: string | null): string {
  const recent = history.length > 0 ? history.slice(-5).join("\n") : "No previous turns yet.";
  return [
    `Generate the next episode for a custom user-driven DnD thread.`,
    `Premise: ${premise}`,
    `Thread history:\n${recent}`,
    decision ? `Selected continuation input: ${decision}` : "No selected continuation yet.",
    `Keep it coherent and leave a clear branching point.`,
    `DESCRIPTION must stay very short (max 220 chars).`,
    `IMAGE_PROMPT must specify readable speech bubbles with exact short dialogue text.`,
  ].join("\n\n");
}

async function generateStructuredEpisode(userPrompt: string): Promise<AILoreResponse> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1500,
    temperature: 0.9,
    messages: [
      { role: "system", content: BASE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content || "";
  const parsed = parseAndValidateEpisode(raw);

  return {
    loreText: parsed.description,
    tweetTitle: parsed.title,
    mangaPrompt: parsed.imagePrompt,
    callToAction: "What should happen next?",
    pollOptions: [parsed.choiceA, parsed.choiceB, parsed.choiceC],
    internalNotes: "",
  };
}

export async function generateLorePost(context: StoryContext): Promise<AILoreResponse> {
  logger.info("Generating Story Mode episode", { chapter: context.recentPosts.length + 1 });
  return generateStructuredEpisode(buildStoryModePrompt(context));
}

export async function generateDnDEpisode(
  premise: string,
  history: string[],
  selectedInput: string | null
): Promise<AILoreResponse> {
  logger.info("Generating DnD Mode episode", { historyCount: history.length });
  return generateStructuredEpisode(buildDnDModePrompt(premise, history, selectedInput));
}

export async function generateChapterSummary(posts: { content: string; winningComment: string | null }[]): Promise<string> {
  logger.info("Generating chapter summary...", { postCount: posts.length });

  const postsText = posts
    .map((p, i) => `Post ${i + 1}: ${p.content}${p.winningComment ? ` [Choice: ${p.winningComment}]` : ""}`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content:
          `Summarize these posts into one continuity summary (max 500 words). Include plot state, character state, and unresolved threads.\n\n${postsText}`,
      },
    ],
  });

  return response.choices[0]?.message?.content || "";
}

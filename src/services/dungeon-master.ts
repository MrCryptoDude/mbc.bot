import OpenAI from "openai";
import { config } from "../config";
import { AILoreResponse, StoryContext } from "../types";
import { logger } from "../utils/logger";

const client = new OpenAI({ apiKey: config.openai.apiKey });

// ─── System prompt for the Dungeon Master ───

const DM_SYSTEM_PROMPT = `You are MEME•BACKED•CURRENCY, an AI Dungeon Master who narrates an epic dark fantasy saga on Twitter. Your world blends medieval fantasy with the concept of currency having magical power.

VOICE & STYLE:
- Write in a dramatic, literary style with a dark sense of humor
- Use vivid, cinematic descriptions — every post should feel like a scene from a film
- Keep language accessible but evocative (no purple prose)
- Occasionally break the fourth wall with subtle humor about currency, memes, or economics
- Use medieval vocabulary sparingly for flavor (e.g., "fortnight" not "two weeks")
- The tone is Game of Thrones meets Terry Pratchett

TWITTER CONSTRAINTS:
- Each lore post must be EXACTLY 1 tweet: max 270 characters (leave room for emoji)
- Start posts with a relevant emoji that sets the scene
- Every post must advance the plot — no filler
- End posts in a way that creates tension, curiosity, or a cliffhanger
- Write so each post is compelling standalone but richer in context

NARRATIVE RULES:
- Honor community decisions — if they voted for something, it happens
- Maintain internal consistency with established lore
- Characters should have clear motivations and flaws
- Build toward larger narrative arcs while keeping individual posts exciting
- Deaths and consequences should feel earned, never random
- Surprise the audience but never cheat them

CALL TO ACTION:
- After the lore text, generate a separate call-to-action that asks the audience what should happen next
- Make it open-ended to encourage creative replies
- Reference specific story elements to guide responses
- Example: "What should Tally do with the cursed coin? Reply below — the most liked response shapes the story."`;

// ─── Generate the next lore post ───

export async function generateLorePost(context: StoryContext): Promise<AILoreResponse> {
  const contextPrompt = buildContextPrompt(context);

  logger.info("Generating lore post via GPT-4o-mini...", { chapter: context.recentPosts.length + 1 });

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    temperature: 0.9,
    messages: [
      { role: "system", content: DM_SYSTEM_PROMPT },
      { role: "user", content: contextPrompt },
    ],
  });

  const text = response.choices[0]?.message?.content || "";

  const parsed = parseLoreResponse(text);
  logger.info("Lore generated", { chars: parsed.loreText.length });
  return parsed;
}

// ─── Generate a chapter summary (every 10 posts) ───

export async function generateChapterSummary(posts: { content: string; winningComment: string | null }[]): Promise<string> {
  logger.info("Generating chapter summary...", { postCount: posts.length });

  const postsText = posts
    .map((p, i) => `Post ${i + 1}: ${p.content}${p.winningComment ? ` [Community chose: ${p.winningComment}]` : ""}`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Summarize these story posts into a concise narrative summary (max 300 words) that captures all major plot points, character developments, faction changes, and unresolved threads. This summary will be used to maintain story continuity.\n\n${postsText}`,
      },
    ],
  });

  return response.choices[0]?.message?.content || "";
}

// ─── Build context prompt from story state ───

function buildContextPrompt(context: StoryContext): string {
  const { recentPosts, worldState, chapterSummary, lastDecision } = context;

  let prompt = "Generate the next lore post for the MEME\u2022BACKED\u2022CURRENCY saga.\n\n";

  // World state
  prompt += "CURRENT WORLD STATE:\n";
  prompt += `Era: ${worldState.era}\n`;
  prompt += `Tone: ${worldState.tone}\n`;
  prompt += `Factions: ${worldState.factions.map((f) => `${f.name} (${f.status})`).join(", ")}\n`;
  prompt += `Key Locations: ${worldState.locations.map((l) => `${l.name} (${l.status})`).join(", ")}\n`;
  prompt += `Active Characters: ${worldState.characters.filter((c) => c.status === "alive").map((c) => `${c.name} \u2014 ${c.role}`).join(", ")}\n`;
  prompt += `Active Events: ${worldState.activeEvents.join("; ")}\n\n`;

  // Chapter summary
  if (chapterSummary) {
    prompt += `STORY SO FAR:\n${chapterSummary}\n\n`;
  }

  // Recent posts
  if (recentPosts.length > 0) {
    prompt += "RECENT POSTS (most recent last):\n";
    for (const post of recentPosts) {
      prompt += `[Chapter ${post.chapterNumber}]: ${post.content}\n`;
      if (post.winningComment) {
        prompt += `  \u2192 Community decided: "${post.winningComment}"\n`;
      }
    }
    prompt += "\n";
  }

  // Last community decision
  if (lastDecision) {
    prompt += `IMPORTANT \u2014 The community's most recent decision: "${lastDecision}"\nYou MUST honor this decision and incorporate it into the next post.\n\n`;
  }

  // First post handling
  if (recentPosts.length === 0) {
    prompt += "This is the FIRST POST of the saga. Introduce the world with a hook that makes people want to follow the story. Set the stage \u2014 establish the setting, hint at conflict, introduce intrigue.\n\n";
  }

  prompt += `Respond in EXACTLY this format:

LORE:
[Your lore post text \u2014 max 270 characters, including an opening emoji]

VIDEO_PROMPT:
[A detailed visual description for AI video generation: camera angle, setting, characters, actions, lighting, mood. Style: dark medieval fantasy, cinematic, 4K. Max 200 words.]

CALL_TO_ACTION:
[A question or prompt for the audience about what should happen next \u2014 max 200 characters]

NOTES:
[Brief internal notes about where the story is heading, what seeds you're planting, etc. This is not posted.]`;

  return prompt;
}

// ─── Parse AI response into structured format ───

function parseLoreResponse(text: string): AILoreResponse {
  const sections: Record<string, string> = {};
  const sectionNames = ["LORE", "VIDEO_PROMPT", "CALL_TO_ACTION", "NOTES"];

  let currentSection = "";
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const sectionMatch = sectionNames.find((s) => trimmed.startsWith(`${s}:`));
    if (sectionMatch) {
      currentSection = sectionMatch;
      const afterColon = trimmed.slice(sectionMatch.length + 1).trim();
      sections[currentSection] = afterColon;
    } else if (currentSection) {
      sections[currentSection] = (sections[currentSection] || "") + (sections[currentSection] ? "\n" : "") + trimmed;
    }
  }

  const loreText = (sections["LORE"] || "").trim();
  if (loreText.length > 280) {
    logger.warn(`Lore text exceeds 280 chars (${loreText.length}), will be truncated`);
  }

  return {
    loreText: loreText.slice(0, 280),
    videoPrompt: (sections["VIDEO_PROMPT"] || "").trim(),
    callToAction: (sections["CALL_TO_ACTION"] || "").trim().slice(0, 200),
    internalNotes: (sections["NOTES"] || "").trim(),
  };
}

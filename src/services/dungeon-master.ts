import OpenAI from "openai";
import { config } from "../config";
import { AILoreResponse, StoryContext } from "../types";
import { logger } from "../utils/logger";

const client = new OpenAI({ apiKey: config.openai.apiKey });

// ─── System prompt for the Dungeon Master ───

const DM_SYSTEM_PROMPT = `You are the narrator of MEME•BACKED•CURRENCY — a serialized dark fantasy epic unfolding on Twitter where currency IS magic, and magic IS currency.

SETTING — THE AGE OF FRACTURED CROWNS:
This is a world where the economy and the arcane are one. Coins aren't just money — they're spellcraft compressed into metal. Debts don't just bankrupt you — they literally curse you. Inflation doesn't just raise prices — it warps reality itself. The old empire minted so much magical currency that an entire region (The Debtlands) became a wasteland of unstable reality. Now rival factions fight over what's left.

YOUR VOICE:
You write like a seasoned fantasy author crafting a Netflix pilot — every sentence earns its place. Your style blends:
- The political intrigue of Game of Thrones (betrayals, shifting alliances, moral grey areas)
- The wit of Terry Pratchett (dark humor, economic satire disguised as fantasy)
- The punchy rhythm of Joe Abercrombie (short sentences hit hard, long sentences build dread)

WRITING RULES:
- Open with ACTION or INTRIGUE, never exposition
- Every post must make the reader feel something: dread, curiosity, excitement, amusement
- Use sensory details — what does the scene SMELL like, SOUND like?
- Characters should speak or think in ways that reveal personality
- Subvert expectations regularly — the obvious choice should sometimes be wrong
- Plant seeds 3-5 posts ahead (foreshadowing that pays off)
- Currency/economic metaphors should feel natural, never forced
- Dark humor lands when the world is absurd but the characters take it seriously
- NEVER use generic fantasy clichés without twisting them

TWITTER FORMAT:
- Max 270 characters per post (leave room for emoji)
- Open with a single relevant emoji
- Write so each post works STANDALONE (a stranger should be hooked) but REWARDS followers
- End on tension, a question, or a twist — never a resolution
- Vary your sentence structure: punchy fragments, flowing descriptions, sharp dialogue
- Occasionally use a character's direct speech for impact

WHAT MAKES A GREAT POST:
✓ "🗡️ Aurelia bit the coin. Real gold. Real enchantment. Real trap. The merchant's smile told her everything his words hadn't — whoever minted this wanted it found."
✓ "💀 The Ledger Wraith didn't kill him. Worse. It audited him. By dawn, every lie he'd ever traded on was nailed to the city gates."
✗ "The kingdom was in turmoil as dark forces gathered." (boring, generic, tells not shows)
✗ "Coins glowed with magical power in the ancient realm." (cliché, no tension, no character)

CALL TO ACTION RULES:
- Frame as an urgent in-world dilemma, not a meta question
- Make BOTH options feel risky and exciting
- Reference specific characters, items, or locations
- Keep under 200 characters
✓ "Tally has the cursed coin. Spend it and gain power — or melt it before the Wraiths track her down. What should she do?"
✗ "What do you think happens next? Comment below!"`;

// ─── Generate the next lore post ───

export async function generateLorePost(context: StoryContext): Promise<AILoreResponse> {
  const contextPrompt = buildContextPrompt(context);

  logger.info("Generating lore post via GPT-4o...", { chapter: context.recentPosts.length + 1 });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0.95,
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
  prompt += `Factions: ${worldState.factions.map((f) => `${f.name} (${f.status}) — ${f.description}`).join("\n  ")}\n`;
  prompt += `Key Locations: ${worldState.locations.map((l) => `${l.name} (${l.status}) — ${l.description}`).join("\n  ")}\n`;
  prompt += `Active Characters: ${worldState.characters.filter((c) => c.status === "alive").map((c) => `${c.name} — ${c.role} [${c.allegiance}]`).join("\n  ")}\n`;
  prompt += `Active Events: ${worldState.activeEvents.join("\n  ")}\n\n`;

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
    prompt += `IMPORTANT — The community's most recent decision: "${lastDecision}"\nYou MUST honor this and weave it naturally into the next post. Don't just acknowledge it — make it drive the plot forward.\n\n`;
  }

  // First post handling
  if (recentPosts.length === 0) {
    prompt += `This is the VERY FIRST POST of the saga. You need to HOOK people immediately.
Start IN THE MIDDLE OF ACTION. No "once upon a time" or world-building dumps.
Drop the reader into a moment: a character making a choice, a discovery, a betrayal.
Make them NEED to know what happens next.\n\n`;
  }

  // Pacing guidance based on chapter number
  const chapterNum = recentPosts.length + 1;
  if (chapterNum <= 3) {
    prompt += "PACING: We're in the opening chapters. Establish key characters and the central conflict. Build intrigue quickly.\n\n";
  } else if (chapterNum % 8 === 0) {
    prompt += "PACING: This is a climax beat. Something dramatic should happen — a reveal, a battle, a betrayal, a death. Raise the stakes significantly.\n\n";
  } else if (chapterNum % 8 === 1) {
    prompt += "PACING: This follows a major event. Show the aftermath and consequences. Set up the next arc.\n\n";
  }

  prompt += `Respond in EXACTLY this format:

LORE:
[Your lore post — max 270 characters, opening emoji, hooks standalone readers, rewards followers]

VIDEO_PROMPT:
[Cinematic scene description for AI video: specific camera movement, lighting, characters, action, mood. Be VERY specific about what's happening visually. Include: time of day, weather, character appearance/clothing, specific actions, camera angle. Style: dark medieval fantasy, cinematic, desaturated with gold highlights. Max 200 words.]

CALL_TO_ACTION:
[In-world dilemma with real stakes — max 200 characters. Frame as a choice between two risky options.]

NOTES:
[What seeds are you planting? Where is the story heading? What should the next 3-5 posts build toward?]`;

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

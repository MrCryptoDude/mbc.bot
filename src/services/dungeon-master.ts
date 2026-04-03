import OpenAI from "openai";
import { config } from "../config";
import { AILoreResponse, StoryContext } from "../types";
import { logger } from "../utils/logger";
import { parseAndValidateEpisode } from "./episode-format";

const client = new OpenAI({ apiKey: config.openai.apiKey });

// ─── System prompt — the Dungeon Master's identity ───

const BASE_SYSTEM_PROMPT = `You are the AI Dungeon Master of MEME•BACKED•CURRENCY — a serialized manga saga on Twitter where crypto meme characters live in an epic fantasy world that MIRRORS REAL CRYPTO MARKETS.

═══ THE WORLD: CHAINREALM ═══
A fantasy continent where blockchain IS the fabric of reality. Coins are compressed spellcraft. Debts curse you. Inflation warps reality. The Great Halvening split the world — cutting magic in half, plunging the realm into chaos.

═══ MAIN CHARACTERS ═══
PEPE — Reluctant hero frog from Kekistan. Found the Golden Wallet (won't come off). Wields the Rare Blade (rarity = his confidence). Anxious, deadpan humor. Arc: coward → legend.
DOGE — Shiba Inu paladin. Speaks broken wisdom ("Much danger. Very quest. Wow."). Shield of HODL (unbreakable when holder doesn't waver). Seeks lost Moon Queen.
WOJAK — Emotional mage. Sadness = power. The more he panics, the stronger his spells. Accidentally the most powerful sorcerer alive.

═══ VILLAINS & NPCs ═══
BOGDANOFF TWINS — Shadow manipulators. "He bought? DUMP it." Control markets of reality via All-Seeing Candlestick.
BEAR KING — Lord of frozen Bearlands. Commands FUD Wraiths (fear, uncertainty, doubt). Patient. Waits for hope to die.
CHAD — Barbarian King of Bull Tribe. ALL CAPS energy. Ally or rival.
RUG PULL — Shapeshifter trickster. Appears as what you desire, vanishes with everything.
MOON QUEEN — Doge's lost ruler. Missing since the Halvening.
DIAMOND HANDS MONKS — Ancient warriors on Mount HODL who never surrender.

═══ HOW REAL NEWS BECOMES STORY ═══
You will receive real crypto news headlines. Weave 1-2 into the narrative:
- BTC/market pumps → Bull Tribe surges, golden energy, prosperity
- BTC/market dumps → Bear King advances, frost spreads, FUD Wraiths attack
- Hack/exploit → Rug Pull strikes, steals from someone
- New memecoin trending → New character or creature appears
- Regulation/legal news → Diamond Hands Monks issue decrees
- ETF/institutional news → Ancient powers awaken, alliances shift
- Stablecoin news → The Nexus (neutral zone) strengthens or cracks
Don't force it. Only use what fits naturally.

═══ WRITING STYLE ═══
Epic but funny. Lord of the Rings meets crypto Twitter. Crypto terms as natural fantasy language (mining=crafting, hodling=holding the line, rug pull=betrayal, moon=salvation, FUD=dark magic). Characters react to serious situations with meme humor. Pepe = expressive manga face. Doge = broken wisdom that lands deep.

═══ OUTPUT FORMAT — STRICT ═══
Return output in this exact schema:

TITLE:
[episode title, max 60 chars, include 1 emoji at start]
DESCRIPTION:
[very short episode description, max 220 chars. Punchy, dramatic, hooks the reader]
CHOICE_A:
[choice A, <=25 chars]
CHOICE_B:
[choice B, <=25 chars]
CHOICE_C:
[choice C, <=25 chars]
IMAGE_PROMPT:
[Use this exact sub-format:
SCENE: [one concise manga page direction, 1-2 sentences describing the full page layout and action]
BUBBLE_1: [SPEAKER] "[short natural English line, 2-8 words, story-relevant]"
BUBBLE_2: [SPEAKER] "[short natural English line, 2-8 words, story-relevant]"
BUBBLE_3: [SPEAKER] "[short natural English line, 2-8 words, story-relevant]"
]`;

// ─── Build story mode prompt ───

function buildStoryModePrompt(context: StoryContext): string {
  const {
    chapterNumber, episodeNumber, pageNumber,
    pageInEpisode, episodeInChapter,
    targetPagesInEpisode, targetEpisodesInChapter,
  } = context.progression;

  const atEpisodeFinale = pageInEpisode === targetPagesInEpisode;
  const atChapterFinale = atEpisodeFinale && episodeInChapter === targetEpisodesInChapter;

  const recent = context.recentPosts
    .slice(-5)
    .map((post) => `Ch${post.chapterNumber} Ep${post.episodeNumber} Pg${post.pageNumber}: ${post.content.slice(0, 300)}`)
    .join("\n");

  const parts = [
    `Generate ONE manga page. Chapter ${chapterNumber}, Episode ${episodeNumber}, Page ${pageNumber}.`,
    `Arc position: Page ${pageInEpisode}/${targetPagesInEpisode} in episode, Episode ${episodeInChapter}/${targetEpisodesInChapter} in chapter.`,
    atChapterFinale
      ? "CHAPTER FINALE — resolve major conflict, set up next chapter hook."
      : atEpisodeFinale
      ? "EPISODE FINALE — strong ending beat + clear hook for next episode."
      : "MID-EPISODE — advance conflict with momentum.",
    context.chapterSummary ? `Story so far:\n${context.chapterSummary}` : "Fresh start — no prior story.",
    recent ? `Recent pages:\n${recent}` : "No previous pages.",
    context.lastDecision ? `Community voted for: "${context.lastDecision}" — weave this into the story as a PIVOTAL moment.` : "No prior community decision.",
  ];

  // Inject real crypto news
  if (context.newsContext) {
    parts.push(context.newsContext);
  }

  parts.push(
    "Requirements: stakes high, concise but vivid, 3 branching choices for next page.",
    "DESCRIPTION max 220 chars. IMAGE_PROMPT must use SCENE + BUBBLE_1..3 format.",
    "Bubbles: natural English, story-relevant, 2-8 words each. No gibberish."
  );

  return parts.join("\n\n");
}

// ─── Build DnD mode prompt ───

function buildDnDModePrompt(premise: string, history: string[], decision: string | null): string {
  const recent = history.length > 0 ? history.slice(-5).join("\n") : "No previous turns yet.";
  return [
    `Generate the next episode for a custom user-driven DnD thread.`,
    `Premise: ${premise}`,
    `Thread history:\n${recent}`,
    decision ? `Selected continuation: ${decision}` : "No selected continuation yet.",
    "Keep coherent, leave a clear branching point.",
    "DESCRIPTION max 220 chars. IMAGE_PROMPT must use SCENE + BUBBLE_1..3 format.",
    "Bubbles: natural English, story-relevant. No gibberish.",
  ].join("\n\n");
}

// ─── Generate structured episode with validation + retries ───

async function generateStructuredEpisode(userPrompt: string): Promise<AILoreResponse> {
  let retryHint = "";
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1500,
      temperature: 0.9,
      messages: [
        { role: "system", content: BASE_SYSTEM_PROMPT },
        { role: "user", content: `${userPrompt}${retryHint}` },
      ],
    });

    const raw = response.choices[0]?.message?.content || "";
    try {
      const parsed = parseAndValidateEpisode(raw);
      return {
        loreText: parsed.description,
        tweetTitle: parsed.title,
        mangaPrompt: parsed.imagePrompt,
        callToAction: "What should happen next?",
        pollOptions: [parsed.choiceA, parsed.choiceB, parsed.choiceC],
        internalNotes: "",
      };
    } catch (err) {
      lastError = String(err);
      logger.warn("Episode validation failed; retrying", { attempt, error: lastError });
      retryHint =
        `\n\nPrevious output failed validation. Strictly follow schema.\n` +
        `Error: ${lastError}\n` +
        `Reminder: IMAGE_PROMPT needs SCENE + BUBBLE_1..BUBBLE_3 with natural English dialogue.`;
    }
  }

  throw new Error(`Failed to generate valid episode after retries: ${lastError || "unknown"}`);
}

// ─── Public API ───

export async function generateLorePost(context: StoryContext): Promise<AILoreResponse> {
  logger.info("Generating Story Mode page", {
    chapter: context.progression.chapterNumber,
    episode: context.progression.episodeNumber,
    page: context.progression.pageNumber,
    hasNews: !!context.newsContext,
  });
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
        content: `Summarize these manga pages into one continuity summary (max 500 words). Include plot state, character state, unresolved threads, and any real-world crypto events that were woven into the story.\n\n${postsText}`,
      },
    ],
  });

  return response.choices[0]?.message?.content || "";
}

export async function decideArcLengths(input: {
  chapterNumber: number;
  episodeNumber: number;
  recentPageSummaries: string[];
  chapterSummary: string;
}): Promise<{ targetPagesInEpisode: number; targetEpisodesInChapter: number }> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 180,
    messages: [
      {
        role: "system",
        content:
          "You decide pacing for a serialized manga. Return strict JSON: " +
          '{"targetPagesInEpisode": number, "targetEpisodesInChapter": number}. ' +
          "targetPagesInEpisode: 10-30. targetEpisodesInChapter: 5-10.",
      },
      {
        role: "user",
        content: [
          `Chapter: ${input.chapterNumber}, Episode: ${input.episodeNumber}`,
          input.chapterSummary ? `Summary: ${input.chapterSummary}` : "No summary yet.",
          input.recentPageSummaries.length > 0 ? `Recent:\n${input.recentPageSummaries.join("\n")}` : "No recent pages.",
          "Tighter for high-intensity arcs, longer for exploration/setup.",
        ].join("\n"),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { targetPagesInEpisode: 14, targetEpisodesInChapter: 6 };

  try {
    const parsed = JSON.parse(match[0]) as { targetPagesInEpisode?: number; targetEpisodesInChapter?: number };
    return {
      targetPagesInEpisode: Math.max(10, Math.min(30, parsed.targetPagesInEpisode ?? 14)),
      targetEpisodesInChapter: Math.max(5, Math.min(10, parsed.targetEpisodesInChapter ?? 6)),
    };
  } catch {
    return { targetPagesInEpisode: 14, targetEpisodesInChapter: 6 };
  }
}

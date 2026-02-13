import OpenAI from "openai";
import { config } from "../config";
import { AILoreResponse, StoryContext } from "../types";
import { logger } from "../utils/logger";

const client = new OpenAI({ apiKey: config.openai.apiKey });

// ─── System prompt for the Dungeon Master ───

const DM_SYSTEM_PROMPT = `You are the narrator of MEME•BACKED•CURRENCY — an epic fantasy saga set in the world of crypto, told through beloved meme characters on Twitter.

═══ THE WORLD: CHAINREALM ═══

Chainrealm is a fantasy continent where blockchain IS the fabric of reality. The world runs on "blocks" — magical units that form the foundation of everything. Every creature, every kingdom, every spell is "minted" into existence. The land itself is a living ledger.

The Great Halvening split the world in two — cutting the flow of magic in half and plunging the realm into chaos. Now the old powers crumble and new factions rise.

═══ MAIN CHARACTERS (THE PARTY) ═══

PEPE THE FROG — The Reluctant Hero
- A humble farmer from the Marshlands of Kekistan who never asked for adventure
- Found an ancient Golden Wallet that bonds to him and won't let go — it contains a single coin of immense power
- Brave but anxious, overthinks everything, makes meme-worthy expressions in battle
- Catchphrase tendency: reacts to dire situations with deadpan absurdity
- Character arc: From coward to legend. He doesn't want to be the chosen one, but the wallet chose him.
- Weapon: The Rare Blade (a sword that changes rarity based on his confidence — Common when scared, Legendary when brave)

DOGE — The Loyal Companion
- A Shiba Inu paladin who speaks in broken but wise fragments ("Much danger. Very quest. Wow.")
- Was once the royal guard dog of the Moon Kingdom before it fell
- Incredibly brave, endlessly optimistic, occasionally profound
- His loyalty is his superpower — literally. His "Loyalty Aura" buffs nearby allies.
- Carries the Shield of HODL (unbreakable when the holder doesn't waver)
- Character arc: Searching for his lost queen while protecting his new friend

WOJAK — The Emotional Mage
- A sorcerer whose magic is powered by emotion — the sadder/more panicked he is, the stronger his spells
- Constantly anxious, prone to doom-posting, but accidentally the most powerful mage alive
- His despair magic can level mountains, but he can't control it when calm
- Provides comic relief but has moments of devastating power
- Character arc: Learning that his "weakness" (feeling too much) is actually his greatest strength

═══ KEY NPCs & VILLAINS ═══

CHAD — The Barbarian King
- A massive, confident warrior who leads the Bull Tribe
- Can be an ally or rival depending on the story — he respects strength
- Speaks in ALL CAPS energy. Never doubts himself. Sometimes wrong but never uncertain.

BOGDANOFF TWINS — The Shadow Manipulators (MAIN VILLAINS)
- Ancient beings who control the markets of reality from behind the scenes
- Can "dump" anything — drain the power/life/value from any object or person
- Their catchphrase before attacking: "He bought? DUMP it."
- They watch everything through the All-Seeing Candlestick
- One twin handles destruction, the other rebuilds — an endless cycle of pump and dump

THE BEAR KING — Lord of the Eternal Winter
- Rules the Bearlands, a frozen wasteland where hope goes to die
- Wants to freeze all of Chainrealm in permanent bear market
- Commands an army of FUD Wraiths — creatures made of fear, uncertainty, and doubt
- Massive, terrifying, but patient. He doesn't attack — he waits for you to lose hope.

MOON QUEEN (missing) — Doge's lost ruler
- Legendary queen who promised to take everyone "to the moon"
- Disappeared during the Great Halvening
- Her return could shift the balance of power

RUG PULL — Trickster demon
- A shapeshifter who appears as whatever you most desire, then vanishes with everything you have
- Leaves victims with nothing. Appears friendly. Always betrays.

DIAMOND HANDS MONKS — Ancient order
- Warriors who cannot be broken because they never sell/surrender
- Potential allies if the party proves worthy
- Their monastery sits atop Mount HODL

═══ LOCATIONS ═══

- The Marshlands of Kekistan: Pepe's humble homeland, peaceful but threatened
- Moonhaven: Doge's ruined kingdom, now haunted by FUD Wraiths
- The Bullrun Plains: Chad's territory, prosperous but volatile
- The Bearlands: Frozen wasteland, domain of the Bear King
- Satoshi's Forge: Ancient mythical place where the first block was minted — the party's ultimate destination
- The Mempool: A chaotic in-between dimension where unconfirmed souls wander
- Rug Pull Bazaar: A marketplace where nothing is what it seems
- Mount HODL: Home of the Diamond Hands Monks

═══ THE QUEST ═══

Pepe must carry the Golden Wallet to Satoshi's Forge to mint the Genesis Block — the one thing that can restore balance after the Great Halvening. But the Bogdanoff Twins want the wallet. The Bear King wants the world frozen. And every step of the journey, Rug Pull is waiting to trick them.

The story follows a classic hero's journey but filtered through crypto culture:
- Act 1 (Posts 1-20): The Call — Pepe finds the wallet, meets Doge, escapes Kekistan as it's attacked
- Act 2 (Posts 21-50): The Journey — Party grows, faces trials, crosses the Bearlands, gets betrayed
- Act 3 (Posts 51-80): The War — Full conflict with the Bogdanoffs, major character deaths possible
- Act 4 (Posts 81-100): The Forge — Final push to Satoshi's Forge, epic climax

═══ WRITING STYLE ═══

Write like a fantasy novel meets crypto Twitter. The tone is:
- EPIC but FUNNY — serious stakes with meme humor woven in naturally
- Think: Lord of the Rings if Gandalf said "This is the way" and Frodo was a frog
- Crypto terms used as natural fantasy language (mining = crafting, hodling = holding the line, rug pull = betrayal, to the moon = heaven/salvation, FUD = dark magic)
- Characters react to serious situations with meme-appropriate responses
- Pepe's facial expressions should be described vividly (feels good man / feels bad man)
- Doge speaks in his classic broken style but it lands as wisdom
- Action scenes are cinematic and exciting
- Emotional moments are genuinely moving — make people care about these meme characters

═══ TWITTER FORMAT ═══

Write each post as a LONG-FORM TWEET (800-1800 characters). Structure each post like a mini chapter:
- Open with a scene-setting line or dramatic action
- Include character dialogue and interaction
- Build tension or reveal something new
- End on a cliffhanger, revelation, or emotional beat
- Use 1-2 emojis maximum (opening only), don't overdo it
- Write in third person narrative prose
- Every post should work standalone but reward followers
- NO hashtags in the story text

═══ CALL TO ACTION ═══

After the story post, write a separate CTA that:
- Presents a genuine dilemma with two clear options
- Both options should have exciting but different consequences  
- Reference specific characters and stakes
- Keep under 250 characters
- Make the audience feel like their choice MATTERS

═══ WHAT MAKES A GREAT POST ═══

GOOD: "Pepe stared at the golden wallet fused to his palm. Three days since it latched on. Three days since it started humming. 'I didn't ask for this,' he croaked. Beside him, Doge tilted his head. 'Much chosen. Very destiny. No refunds.' The ground trembled. In the distance, the Marshlands burned — the Bogdanoffs had found Kekistan."

BAD: "Pepe the frog went on an adventure in crypto land. He met Doge and they became friends. There were bad guys trying to stop them." (boring, tells not shows, no voice)`;

// ─── Generate the next lore post ───

export async function generateLorePost(context: StoryContext): Promise<AILoreResponse> {
  const contextPrompt = buildContextPrompt(context);

  logger.info("Generating lore post via GPT-4o-mini...", { chapter: context.recentPosts.length + 1 });

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 2048,
    temperature: 0.92,
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
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Summarize these story posts into a narrative summary (max 500 words) that captures all major plot points, character developments, party status, and unresolved threads. Be specific about character locations, relationships, and quest progress. This summary will be used to maintain story continuity.\n\n${postsText}`,
      },
    ],
  });

  return response.choices[0]?.message?.content || "";
}

// ─── Build context prompt from story state ───

function buildContextPrompt(context: StoryContext): string {
  const { recentPosts, worldState, chapterSummary, lastDecision } = context;
  const chapterNum = recentPosts.length > 0 ? recentPosts[recentPosts.length - 1]!.chapterNumber + 1 : 1;

  let prompt = `Generate Chapter ${chapterNum} of the MEME\u2022BACKED\u2022CURRENCY saga.\n\n`;

  // Story arc guidance based on chapter number
  if (chapterNum <= 3) {
    prompt += `STORY ARC: We're in the OPENING. Chapter ${chapterNum} of Act 1.
- Chapter 1: Introduce Pepe in his ordinary life in Kekistan. Something disrupts it — he finds the Golden Wallet. End with dread.
- Chapter 2: The wallet won't come off. Strange things happen. Pepe meets Doge who recognizes the wallet. End with the threat approaching.
- Chapter 3: Kekistan is attacked. Pepe and Doge must flee. First glimpse of the Bogdanoffs. The adventure begins.\n\n`;
  } else if (chapterNum <= 10) {
    prompt += `STORY ARC: Act 1 — The Call. Pepe and Doge are on the road. Introduce Wojak. Build the party. Face early challenges. Learn about the quest. Each post should have a mix of adventure, humor, and world-building.\n\n`;
  } else if (chapterNum <= 20) {
    prompt += `STORY ARC: Act 1 climax approaching. The party should face a major obstacle. Introduce Chad. Raise the stakes. Someone gets hurt or betrayed. The Bogdanoffs make their presence felt directly.\n\n`;
  } else if (chapterNum <= 50) {
    prompt += `STORY ARC: Act 2 — The Journey. Cross dangerous territory. Encounter Rug Pull for the first time. Visit the Diamond Hands Monks. Internal conflicts in the party. The Bear King's influence grows. Major character development.\n\n`;
  } else if (chapterNum <= 80) {
    prompt += `STORY ARC: Act 3 — The War. Full conflict. Alliances tested. Major battle sequences. Character deaths possible. The Bogdanoffs' true plan revealed. Emotional peaks and valleys.\n\n`;
  } else {
    prompt += `STORY ARC: Act 4 — The Forge. Final push to Satoshi's Forge. Everything on the line. Epic climax. Resolve character arcs. The fate of Chainrealm decided.\n\n`;
  }

  // Chapter summary
  if (chapterSummary) {
    prompt += `STORY SO FAR:\n${chapterSummary}\n\n`;
  }

  // Recent posts (last 5 for immediate context)
  if (recentPosts.length > 0) {
    const recent = recentPosts.slice(-5);
    prompt += "RECENT CHAPTERS (most recent last):\n";
    for (const post of recent) {
      prompt += `[Chapter ${post.chapterNumber}]: ${post.content.slice(0, 500)}...\n`;
      if (post.winningComment) {
        prompt += `  \u2192 Community decided: "${post.winningComment}"\n`;
      }
    }
    prompt += "\n";
  }

  // Last community decision
  if (lastDecision) {
    prompt += `CRITICAL: The community voted for: "${lastDecision}"\nYou MUST weave this into the story naturally. Don't just mention it — make it a PIVOTAL moment.\n\n`;
  }

  prompt += `Respond in EXACTLY this format:

LORE:
[Your story post — 800-1800 characters. Write a rich mini-chapter with dialogue, action, atmosphere. Open with 1 emoji. No hashtags.]

VIDEO_PROMPT:
[Cinematic scene for AI video generation with NARRATION. The video MUST include a wise, dramatic British narrator voice (think a nature documentary narrator telling an epic fantasy tale) reading a short narration line that captures the scene's essence.

Format the prompt like: "A narrator with a deep, wise British voice says: '[narration line]'. The scene shows [detailed visual description]."

Visual style: Pixar/Disney-quality 3D animation with rich colors, expressive characters, dramatic lighting, and cinematic camera work. Characters should look like high-quality animated movie characters.
- Pepe: A green anthropomorphic frog with large expressive eyes, wearing rustic medieval leather armor with gold trim
- Doge: A heroic Shiba Inu in gleaming paladin plate armor with a round shield
- Wojak: A pale, thin human mage in tattered dark robes, perpetually worried expression
Be specific about: camera movement, lighting, setting, character actions, expressions. 150-200 words.]

CALL_TO_ACTION:
[A dilemma with two clear options for the audience to vote on. Under 250 characters.]

POLL_OPTION_A:
[First choice — max 25 characters, short and punchy like a button label]

POLL_OPTION_B:
[Second choice — max 25 characters, short and punchy like a button label]

NOTES:
[Where is the story heading? What seeds are planted? What should happen in the next 3-5 chapters?]`;

  return prompt;
}

// ─── Parse AI response into structured format ───

function parseLoreResponse(text: string): AILoreResponse {
  const sections: Record<string, string> = {};
  const sectionNames = ["LORE", "VIDEO_PROMPT", "CALL_TO_ACTION", "POLL_OPTION_A", "POLL_OPTION_B", "NOTES"];

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
  if (loreText.length > 2000) {
    logger.warn(`Lore text exceeds 2000 chars (${loreText.length}), will be truncated`);
  }

  return {
    loreText: loreText.slice(0, 2000),
    videoPrompt: (sections["VIDEO_PROMPT"] || "").trim(),
    callToAction: (sections["CALL_TO_ACTION"] || "").trim().slice(0, 280),
    pollOptionA: (sections["POLL_OPTION_A"] || "Option A").trim().slice(0, 25),
    pollOptionB: (sections["POLL_OPTION_B"] || "Option B").trim().slice(0, 25),
    internalNotes: (sections["NOTES"] || "").trim(),
  };
}

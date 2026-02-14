import fs from "fs";
import path from "path";
import { config } from "../config";
import { LorePost, StoryProgression, WorldState } from "../types";
import { logger } from "../utils/logger";

const DATA_DIR = config.bot.dataDir;
const POSTS_FILE = path.join(DATA_DIR, "lore_posts.json");
const WORLD_FILE = path.join(DATA_DIR, "world_state.json");
const SUMMARY_FILE = path.join(DATA_DIR, "chapter_summary.json");
const STORY_PROGRESSION_FILE = path.join(DATA_DIR, "story_progression.json");
const DND_SESSIONS_FILE = path.join(DATA_DIR, "dnd_sessions.json");
const DND_META_FILE = path.join(DATA_DIR, "dnd_meta.json");

// ─── Initialize data directory and files ───

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    logger.info(`Created data directory: ${DATA_DIR}`);
  }
}

function readJSON<T>(filepath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    const raw = fs.readFileSync(filepath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.error(`Failed to read ${filepath}`, { error: String(err) });
    return fallback;
  }
}

function writeJSON<T>(filepath: string, data: T): void {
  ensureDataDir();
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}

function inferProgressionFromPosts(posts: LorePost[]): StoryProgression {
  const lastPost = posts[posts.length - 1];
  if (!lastPost) {
    return { ...DEFAULT_STORY_PROGRESSION };
  }

  const chapterNumber = lastPost.chapterNumber ?? 1;
  const episodeNumber = lastPost.episodeNumber ?? 1;
  const pageNumber = (lastPost.pageNumber ?? posts.length) + 1;
  const pageInEpisode = (lastPost.pageInEpisode ?? 1) + 1;
  const episodeInChapter = lastPost.episodeInChapter ?? 1;

  return {
    chapterNumber,
    episodeNumber,
    pageNumber,
    pageInEpisode,
    episodeInChapter,
    targetPagesInEpisode: 12,
    targetEpisodesInChapter: 6,
  };
}

// ─── Default world state ───

const DEFAULT_WORLD: WorldState = {
  era: "Post-Halvening — The Age of Broken Chains",
  tone: "epic fantasy adventure meets crypto meme culture — Lord of the Rings meets crypto Twitter, funny but with real stakes",
  factions: [
    { name: "The Bull Tribe", description: "Warrior nation led by Chad. They thrive in prosperity and charge headfirst into everything. Allies when the market is up.", status: "neutral" },
    { name: "The Bear Kingdom", description: "Frozen wasteland ruled by the Bear King. Commands FUD Wraiths. Wants to freeze Chainrealm in eternal bear market.", status: "hostile" },
    { name: "The Bogdanoff Network", description: "Shadow manipulators who pump and dump reality itself. The true puppet masters behind the chaos.", status: "hostile" },
    { name: "The Diamond Hands Monks", description: "Ancient warrior-monks on Mount HODL who never surrender. Potential allies if the party proves worthy.", status: "neutral" },
  ],
  locations: [
    { name: "Kekistan Marshlands", description: "Pepe's peaceful homeland. Simple frog folk farming rare crops. Now threatened.", status: "safe" },
    { name: "Moonhaven", description: "Doge's ruined kingdom. Once glorious, now haunted by FUD Wraiths since the Moon Queen vanished.", status: "dangerous" },
    { name: "The Bullrun Plains", description: "Chad's prosperous territory. Golden grasslands, endless energy, volatile weather.", status: "safe" },
    { name: "The Bearlands", description: "Frozen wasteland where hope dies. Domain of the Bear King.", status: "dangerous" },
    { name: "Rug Pull Bazaar", description: "A marketplace where nothing is real. Run by the shapeshifter Rug Pull.", status: "dangerous" },
    { name: "Mount HODL", description: "Sacred mountain. Home of the Diamond Hands Monks.", status: "unexplored" },
    { name: "Satoshi's Forge", description: "Mythical place where the first block was minted. The party's ultimate destination.", status: "unexplored" },
  ],
  characters: [
    { name: "Pepe", role: "Reluctant hero. Humble frog farmer bonded to the Golden Wallet. Wields the Rare Blade.", status: "alive", allegiance: "The Party" },
    { name: "Doge", role: "Loyal Shiba Inu paladin. Speaks in broken wisdom. Carries the Shield of HODL. Seeks his lost Moon Queen.", status: "alive", allegiance: "The Party" },
    { name: "Wojak", role: "Emotional mage. Sadness powers his magic. Accidentally the strongest sorcerer alive.", status: "alive", allegiance: "The Party" },
    { name: "Chad", role: "Barbarian King of the Bull Tribe. Speaks in ALL CAPS energy. Potential ally or rival.", status: "alive", allegiance: "Bull Tribe" },
    { name: "The Bogdanoff Twins", role: "Shadow villains. Can dump the value/life from anything. Watch through the All-Seeing Candlestick.", status: "alive", allegiance: "Bogdanoff Network" },
    { name: "The Bear King", role: "Lord of eternal winter. Patient, terrifying. Waits for hope to die.", status: "alive", allegiance: "Bear Kingdom" },
    { name: "Rug Pull", role: "Shapeshifting trickster demon. Appears as what you desire most, then vanishes with everything.", status: "alive", allegiance: "None" },
    { name: "Moon Queen", role: "Doge's lost ruler. Promised to take everyone to the moon. Disappeared during the Halvening.", status: "missing", allegiance: "Unknown" },
  ],
  activeEvents: [
    "The Great Halvening has split the flow of magic, plunging Chainrealm into chaos.",
    "A Golden Wallet has appeared in Kekistan — bonded to an unlikely hero.",
    "The Bogdanoff Twins are searching for the wallet. Their agents are everywhere.",
    "The Bear King's frozen frontier creeps southward each day.",
  ],
};

const DEFAULT_STORY_PROGRESSION: StoryProgression = {
  chapterNumber: 1,
  episodeNumber: 1,
  pageNumber: 1,
  pageInEpisode: 1,
  episodeInChapter: 1,
  targetPagesInEpisode: 12,
  targetEpisodesInChapter: 6,
};

// ─── Database operations ───

export const db = {
  // Lore posts
  getPosts(): LorePost[] {
    const posts = readJSON<LorePost[]>(POSTS_FILE, []);
    return posts.map((post, index) => ({
      ...post,
      pageNumber: post.pageNumber ?? index + 1,
      episodeNumber: post.episodeNumber ?? 1,
      pageInEpisode: post.pageInEpisode ?? 1,
      episodeInChapter: post.episodeInChapter ?? 1,
      votingMode: post.votingMode ?? "poll",
    }));
  },

  getRecentPosts(count: number = 5): LorePost[] {
    const posts = this.getPosts();
    return posts.slice(-count);
  },

  getLastPost(): LorePost | null {
    const posts = this.getPosts();
    return posts.length > 0 ? posts[posts.length - 1]! : null;
  },

  addPost(post: Omit<LorePost, "id">): LorePost {
    const posts = this.getPosts();
    const newPost: LorePost = {
      pollTweetId: null,
      pollOptions: null,
      winningOption: null,
      ...post,
      id: posts.length + 1,
    };
    posts.push(newPost);
    writeJSON(POSTS_FILE, posts);
    logger.info(`Saved lore post #${newPost.id}`, {
      chapter: newPost.chapterNumber,
      episode: newPost.episodeNumber,
      page: newPost.pageNumber,
    });
    return newPost;
  },

  updatePost(id: number, updates: Partial<LorePost>): void {
    const posts = this.getPosts();
    const idx = posts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Post #${id} not found`);
    posts[idx] = Object.assign({}, posts[idx], updates);
    writeJSON(POSTS_FILE, posts);
  },

  getNextChapterNumber(): number {
    const posts = this.getPosts();
    return posts.length > 0 ? posts[posts.length - 1]!.chapterNumber + 1 : 1;
  },

  getStoryProgression(): StoryProgression {
    if (fs.existsSync(STORY_PROGRESSION_FILE)) {
      return readJSON<StoryProgression>(STORY_PROGRESSION_FILE, DEFAULT_STORY_PROGRESSION);
    }
    const inferred = inferProgressionFromPosts(this.getPosts());
    this.updateStoryProgression(inferred);
    return inferred;
  },

  updateStoryProgression(progression: StoryProgression): void {
    writeJSON(STORY_PROGRESSION_FILE, progression);
  },

  // World state
  getWorldState(): WorldState {
    return readJSON<WorldState>(WORLD_FILE, DEFAULT_WORLD);
  },

  updateWorldState(updates: Partial<WorldState>): void {
    const current = this.getWorldState();
    writeJSON(WORLD_FILE, { ...current, ...updates });
  },

  // Chapter summary
  getChapterSummary(): string {
    const data = readJSON<{ summary: string }>(SUMMARY_FILE, { summary: "" });
    return data.summary;
  },

  updateChapterSummary(summary: string): void {
    writeJSON(SUMMARY_FILE, { summary });
  },

  // Reset (for testing)
  reset(): void {
    if (fs.existsSync(POSTS_FILE)) fs.unlinkSync(POSTS_FILE);
    if (fs.existsSync(WORLD_FILE)) fs.unlinkSync(WORLD_FILE);
    if (fs.existsSync(SUMMARY_FILE)) fs.unlinkSync(SUMMARY_FILE);
    if (fs.existsSync(STORY_PROGRESSION_FILE)) fs.unlinkSync(STORY_PROGRESSION_FILE);
    if (fs.existsSync(DND_SESSIONS_FILE)) fs.unlinkSync(DND_SESSIONS_FILE);
    if (fs.existsSync(DND_META_FILE)) fs.unlinkSync(DND_META_FILE);
    logger.info("Database reset");
  },
};

import fs from "fs";
import path from "path";
import { config } from "../config";
import { LorePost, WorldState } from "../types";
import { logger } from "../utils/logger";

const DATA_DIR = config.bot.dataDir;
const POSTS_FILE = path.join(DATA_DIR, "lore_posts.json");
const WORLD_FILE = path.join(DATA_DIR, "world_state.json");
const SUMMARY_FILE = path.join(DATA_DIR, "chapter_summary.json");

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

// ─── Default world state ───

const DEFAULT_WORLD: WorldState = {
  era: "The Age of Fractured Crowns",
  tone: "dark fantasy with moments of dark humor, medieval setting, gritty and grounded",
  factions: [
    { name: "The Gilded Mint", description: "A cabal of merchant-sorcerers who believe currency itself holds magical power. They mint coins imbued with binding enchantments.", status: "neutral" },
    { name: "The Hollow Crown", description: "Remnants of the old kingdom, now a decentralized resistance. They fight to restore the monarchy through guerrilla warfare and ancient pacts.", status: "neutral" },
    { name: "The Dross Collective", description: "A ragtag union of miners, smiths, and counterfeiters who reject all monetary systems. They trade only in favors and blood oaths.", status: "neutral" },
    { name: "The Ledger Wraiths", description: "Undead accountants from a fallen empire, cursed to eternally audit the living. They appear when debts go unpaid.", status: "hostile" },
  ],
  locations: [
    { name: "Coinspire", description: "A sprawling city built atop ancient vaults, where every transaction is a spell. The central marketplace is a maelstrom of enchanted commerce.", status: "safe" },
    { name: "The Debtlands", description: "A wasteland created when the old empire tried to mint infinite currency. Reality itself became inflated and unstable.", status: "dangerous" },
    { name: "Fort Dividend", description: "A fortress controlled by the Gilded Mint, where the most powerful enchanted coins are forged in volcanic foundries.", status: "unexplored" },
    { name: "The Underbarter", description: "A subterranean black market beneath Coinspire where the Dross Collective trades in secrets and forbidden artifacts.", status: "safe" },
  ],
  characters: [
    { name: "Aurelia Halfpenny", role: "Master Minter of the Gilded Mint", status: "alive", allegiance: "The Gilded Mint" },
    { name: "Ser Corroded", role: "A rusted knight who claims to be the last heir of the Hollow Crown", status: "alive", allegiance: "The Hollow Crown" },
    { name: "Tally", role: "A street urchin who can smell enchanted currency from a mile away", status: "alive", allegiance: "None" },
  ],
  activeEvents: [
    "A new type of coin has appeared in Coinspire that grants its holder persuasive powers — but at what cost?",
    "The Ledger Wraiths have been spotted moving toward the city in unusual numbers.",
  ],
};

// ─── Database operations ───

export const db = {
  // Lore posts
  getPosts(): LorePost[] {
    return readJSON<LorePost[]>(POSTS_FILE, []);
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
    const newPost: LorePost = { ...post, id: posts.length + 1 };
    posts.push(newPost);
    writeJSON(POSTS_FILE, posts);
    logger.info(`Saved lore post #${newPost.id}`, { chapter: newPost.chapterNumber });
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
    logger.info("Database reset");
  },
};

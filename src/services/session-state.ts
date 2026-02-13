import fs from "fs";
import path from "path";
import { config } from "../config";
import { DndSession } from "../types";

const DATA_DIR = config.bot.dataDir;
const SESSION_FILE = path.join(DATA_DIR, "dnd_sessions.json");
const META_FILE = path.join(DATA_DIR, "dnd_meta.json");

interface SessionMeta {
  lastMentionId: string | null;
}

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(file: string, value: T): void {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
}

export const sessionState = {
  getAll(): DndSession[] {
    return readJson<DndSession[]>(SESSION_FILE, []);
  },

  getByRootTweetId(rootTweetId: string): DndSession | null {
    return this.getAll().find((s) => s.rootTweetId === rootTweetId) || null;
  },

  getByAwaitingTweetId(tweetId: string): DndSession | null {
    return this.getAll().find((s) => s.awaitingReplyToTweetId === tweetId) || null;
  },

  upsert(session: DndSession): void {
    const sessions = this.getAll();
    const idx = sessions.findIndex((s) => s.rootTweetId === session.rootTweetId);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.push(session);
    }
    writeJson(SESSION_FILE, sessions);
  },

  getMeta(): SessionMeta {
    return readJson<SessionMeta>(META_FILE, { lastMentionId: null });
  },

  updateMeta(updates: Partial<SessionMeta>): void {
    const current = this.getMeta();
    writeJson(META_FILE, { ...current, ...updates });
  },
};

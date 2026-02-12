// ─── Core Types ───

export interface LorePost {
  id: number;
  content: string;
  videoPrompt: string;
  mediaUrl: string | null;
  mediaType: "video" | "image";
  tweetId: string | null;
  chapterNumber: number;
  votingMode: "comment";
  winningComment: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface WorldState {
  factions: Faction[];
  locations: Location[];
  characters: NPC[];
  activeEvents: string[];
  era: string;
  tone: string;
}

export interface Faction {
  name: string;
  description: string;
  status: "allied" | "neutral" | "hostile" | "destroyed";
}

export interface Location {
  name: string;
  description: string;
  status: "safe" | "dangerous" | "destroyed" | "unexplored";
}

export interface NPC {
  name: string;
  role: string;
  status: "alive" | "dead" | "missing";
  allegiance: string;
}

export interface StoryContext {
  recentPosts: LorePost[];
  worldState: WorldState;
  chapterSummary: string;
  lastDecision: string | null;
}

export interface AILoreResponse {
  loreText: string;
  videoPrompt: string;
  callToAction: string;
  internalNotes: string;
}

export interface TopComment {
  text: string;
  authorHandle: string;
  likeCount: number;
  tweetId: string;
}

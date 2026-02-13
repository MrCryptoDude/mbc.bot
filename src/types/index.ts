// ─── Core Types ───

export interface LorePost {
  id: number;
  content: string;
  mangaPrompt: string;
  mediaUrl: string | null;
  mediaType: "image";
  tweetId: string | null;
  pollTweetId?: string | null;
  pollOptions?: [string, string, string] | null;
  winningOption?: string | null;
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
  tweetTitle: string;
  mangaPrompt: string;
  callToAction: string;
  pollOptions: string[];
  internalNotes: string;
}

export interface TopComment {
  text: string;
  authorHandle: string;
  authorId?: string;
  likeCount: number;
  tweetId: string;
}

export interface EpisodeOutput {
  title: string;
  description: string;
  choices: [string, string, string];
  imagePrompt: string;
}

export interface MentionEvent {
  tweetId: string;
  text: string;
  authorId: string;
  authorHandle: string;
  inReplyToTweetId: string | null;
  likeCount: number;
}

export interface DndTurn {
  sourceTweetId: string;
  sourceAuthorId: string;
  sourceText: string;
  generatedTweetId: string;
  generatedAt: string;
}

export interface DndSession {
  rootTweetId: string;
  requesterId: string;
  requesterHandle: string;
  premise: string;
  mode: "solo" | "community";
  createdAt: string;
  updatedAt: string;
  episodeCount: number;
  awaitingReplyToTweetId: string;
  turns: DndTurn[];
}

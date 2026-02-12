import dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  twitter: {
    apiKey: required("TWITTER_API_KEY"),
    apiSecret: required("TWITTER_API_SECRET"),
    accessToken: required("TWITTER_ACCESS_TOKEN"),
    accessSecret: required("TWITTER_ACCESS_SECRET"),
    bearerToken: required("TWITTER_BEARER_TOKEN"),
  },
  openai: {
    apiKey: required("OPENAI_API_KEY"),
  },
  kling: {
    apiKey: process.env.KLING_API_KEY || "",
  },
  bot: {
    postIntervalHours: parseInt(process.env.POST_INTERVAL_HOURS || "6"),
    voteWindowMinutes: parseInt(process.env.VOTE_WINDOW_MINUTES || "300"),
    username: process.env.BOT_USERNAME || "MEMEBACKEDCURR",
    dataDir: process.env.DATA_DIR || "./data",
    logLevel: process.env.LOG_LEVEL || "info",
  },
} as const;

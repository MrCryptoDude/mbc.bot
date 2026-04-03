import cron from "node-cron";
import { config } from "./config";
import { logger } from "./utils/logger";
import { runLoreCycle } from "./jobs/lore-cycle";
import { runDnDModeCycle } from "./jobs/dnd-cycle";
import { getBotUserId } from "./services/twitter";
import { db } from "./services/database";
import { startServer } from "./server";

function getCronExpression(): string {
  const hours = config.bot.postIntervalHours;
  switch (hours) {
    case 3:  return "0 0,3,6,9,12,15,18,21 * * *";
    case 4:  return "0 2,6,10,14,18,22 * * *";
    case 6:  return "0 3,9,15,21 * * *";
    case 8:  return "0 6,14,22 * * *";
    case 24: return "0 13 * * *"; // Daily at 13:00 UTC = 15:00 Stockholm
    default: return `0 */${hours} * * *`;
  }
}

async function main(): Promise<void> {
  logger.info("Starting MEMEBACKEDCURR bot");

  const port = parseInt(process.env.PORT || "3000", 10);
  startServer(port);

  const botUserId = await getBotUserId();
  if (botUserId) {
    logger.info(`Twitter connected as @${config.bot.username} (ID: ${botUserId})`);
  } else {
    logger.error("Twitter connection failed. Story/DnD posting may fail.");
  }

  logger.info(`Loaded posts: ${db.getPosts().length}`);

  const storyCron = getCronExpression();
  cron.schedule(storyCron, async () => {
    await runLoreCycle();
  });

  cron.schedule("*/2 * * * *", async () => {
    await runDnDModeCycle();
  });

  logger.info(`Story Mode schedule: ${storyCron} (daily at 15:00 Stockholm / 13:00 UTC)`);
  logger.info("DnD Mode schedule: every 2 minutes");

  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

const command = process.argv[2];

if (command === "post-now") {
  runLoreCycle().then(() => process.exit(0)).catch((err) => {
    logger.error("Manual post failed", { error: String(err) });
    process.exit(1);
  });
} else if (command === "dnd-now") {
  runDnDModeCycle().then(() => process.exit(0)).catch(() => process.exit(1));
} else if (command === "reset") {
  db.reset();
  logger.info("Database reset complete");
  process.exit(0);
} else if (command === "serve") {
  const port = parseInt(process.env.PORT || "3000", 10);
  startServer(port);
  logger.info("Server-only mode (no bot). Open http://localhost:" + port);
} else if (command === "status") {
  const posts = db.getPosts();
  const lastPost = db.getLastPost();
  const progression = db.getStoryProgression();
  console.log(`Total posts: ${posts.length}`);
  console.log(`Next page: Chapter ${progression.chapterNumber}, Episode ${progression.episodeNumber}, Page ${progression.pageNumber}`);
  console.log(`Targets: ${progression.targetPagesInEpisode} pages/episode, ${progression.targetEpisodesInChapter} episodes/chapter`);
  if (lastPost) {
    console.log(`Last: Ch${lastPost.chapterNumber} Ep${lastPost.episodeNumber} Pg${lastPost.pageNumber}`);
    console.log(`Tweet: ${lastPost.tweetId || "none"} | Poll: ${lastPost.pollTweetId || "none"}`);
    console.log(`Winner: ${lastPost.winningOption || "none"}`);
  }
  process.exit(0);
} else {
  main().catch((err) => {
    logger.error("Fatal startup error", { error: String(err) });
    process.exit(1);
  });
}

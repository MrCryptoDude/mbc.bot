import cron from "node-cron";
import { config } from "./config";
import { logger } from "./utils/logger";
import { runLoreCycle } from "./jobs/lore-cycle";
import { runDnDModeCycle } from "./jobs/dnd-cycle";
import { getBotUserId } from "./services/twitter";
import { db } from "./services/database";

function getCronExpression(): string {
  const hours = config.bot.postIntervalHours;
  return hours > 0 ? `0 */${hours} * * *` : "0 */3 * * *";
}

async function main(): Promise<void> {
  logger.info("Starting MEMEBACKEDCURR bot");

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

  logger.info(`Story Mode schedule: ${storyCron}`);
  logger.info("DnD Mode schedule: every 2 minutes");

  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

const command = process.argv[2];

if (command === "post-now") {
  runLoreCycle().then(() => process.exit(0)).catch(() => process.exit(1));
} else if (command === "dnd-now") {
  runDnDModeCycle().then(() => process.exit(0)).catch(() => process.exit(1));
} else if (command === "reset") {
  db.reset();
  process.exit(0);
} else if (command === "status") {
  const posts = db.getPosts();
  const lastPost = db.getLastPost();
  console.log(`Total posts: ${posts.length}`);
  if (lastPost) {
    console.log(`Last chapter: ${lastPost.chapterNumber}`);
    console.log(`Last tweet: ${lastPost.tweetId || "none"}`);
    console.log(`Last poll tweet: ${lastPost.pollTweetId || "none"}`);
    console.log(`Winning option: ${lastPost.winningOption || "none"}`);
  }
  process.exit(0);
} else {
  main().catch((err) => {
    logger.error("Fatal startup error", { error: String(err) });
    process.exit(1);
  });
}

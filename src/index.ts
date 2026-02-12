import cron from "node-cron";
import { config } from "./config";
import { logger } from "./utils/logger";
import { runLoreCycle } from "./jobs/lore-cycle";
import { getBotUserId } from "./services/twitter";
import { db } from "./services/database";

// ─── Banner ───

function printBanner(): void {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║     MEME•BACKED•CURRENCY                    ║
  ║     AI Dungeon Master Bot v1.0               ║
  ║     @${config.bot.username.padEnd(37)}║
  ╚══════════════════════════════════════════════╝
  `);
}

// ─── Build cron expression from interval ───

function getCronExpression(): string {
  const hours = config.bot.postIntervalHours;

  // For common intervals, use cleaner schedules
  switch (hours) {
    case 4:
      return "0 2,6,10,14,18,22 * * *";    // 6 posts/day at even hours
    case 5:
      return "0 3,8,13,18,23 * * *";       // ~5 posts/day
    case 6:
      return "0 3,9,15,21 * * *";          // 4 posts/day
    case 8:
      return "0 6,14,22 * * *";            // 3 posts/day
    default:
      return `0 */${hours} * * *`;          // Generic interval
  }
}

// ─── Main startup ───

async function main(): Promise<void> {
  printBanner();

  // Validate Twitter connection
  logger.info("Validating Twitter connection...");
  const botUserId = await getBotUserId();
  if (botUserId) {
    logger.info(`Twitter connected as @${config.bot.username} (ID: ${botUserId})`);
  } else {
    logger.error("Failed to connect to Twitter — check your API credentials");
    logger.info("Bot will continue in dry-run mode (no tweets posted)");
  }

  // Show current state
  const posts = db.getPosts();
  logger.info(`Database loaded: ${posts.length} existing posts`);

  // Schedule lore cycle
  const cronExpr = getCronExpression();
  logger.info(`Scheduling lore cycle: every ${config.bot.postIntervalHours} hours (${cronExpr})`);
  logger.info(`Vote window: ${config.bot.voteWindowMinutes} minutes before resolving comments`);

  cron.schedule(cronExpr, async () => {
    logger.info("Cron triggered — starting lore cycle");
    await runLoreCycle();
  });

  logger.info("Bot is running! Waiting for first scheduled post...");
  logger.info(`Next post will be at the next cron interval. To post immediately, run: npm run post-now`);

  // Keep process alive
  process.on("SIGINT", () => {
    logger.info("Shutting down gracefully...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Shutting down gracefully...");
    process.exit(0);
  });
}

// ─── CLI commands ───

const command = process.argv[2];

if (command === "post-now") {
  // Immediately run one lore cycle
  logger.info("Manual trigger: posting now...");
  runLoreCycle()
    .then(() => {
      logger.info("Manual post complete");
      process.exit(0);
    })
    .catch((err) => {
      logger.error("Manual post failed", { error: String(err) });
      process.exit(1);
    });
} else if (command === "reset") {
  // Reset database
  db.reset();
  logger.info("Database reset complete");
  process.exit(0);
} else if (command === "status") {
  // Show current status
  const posts = db.getPosts();
  const lastPost = db.getLastPost();
  console.log(`\nTotal posts: ${posts.length}`);
  if (lastPost) {
    console.log(`Last post: Chapter ${lastPost.chapterNumber}`);
    console.log(`Content: ${lastPost.content}`);
    console.log(`Posted: ${lastPost.createdAt}`);
    console.log(`Resolved: ${lastPost.resolvedAt || "Pending"}`);
    console.log(`Winning comment: ${lastPost.winningComment || "None yet"}`);
  } else {
    console.log("No posts yet — run 'npm run post-now' to create the first one!");
  }
  process.exit(0);
} else {
  // Default: start the scheduler
  main().catch((err) => {
    logger.error("Fatal error", { error: String(err) });
    process.exit(1);
  });
}

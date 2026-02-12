import winston from "winston";
import { config } from "../config";

export const logger = winston.createLogger({
  level: config.bot.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: `${config.bot.dataDir}/bot.log`, maxsize: 5242880, maxFiles: 3 }),
  ],
});

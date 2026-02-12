import { config } from "../config";
import { logger } from "../utils/logger";
import fs from "fs";
import path from "path";

const MEDIA_DIR = path.join(config.bot.dataDir, "media");

function ensureMediaDir(): void {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

// ─── Kling AI Video Generation ───

async function generateVideoKling(prompt: string): Promise<string | null> {
  if (!config.kling.apiKey) {
    logger.warn("Kling API key not configured, skipping video generation");
    return null;
  }

  try {
    logger.info("Requesting video from Kling AI...");

    // Step 1: Submit generation request
    const createResponse = await fetch("https://api.klingai.com/v1/videos/text2video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.kling.apiKey}`,
      },
      body: JSON.stringify({
        prompt: `${prompt} Style: dark medieval fantasy, cinematic lighting, 4K quality, dramatic atmosphere`,
        negative_prompt: "modern, contemporary, cartoon, anime, bright colors, cheerful",
        duration: 5,
        aspect_ratio: "16:9",
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      logger.error("Kling API create failed", { status: createResponse.status, error: errorText });
      return null;
    }

    const createData = (await createResponse.json()) as { data?: { task_id?: string } };
    const taskId = createData?.data?.task_id;
    if (!taskId) {
      logger.error("No task_id in Kling response", { response: createData });
      return null;
    }

    // Step 2: Poll for completion (max 5 minutes)
    logger.info(`Kling task ${taskId} submitted, polling for completion...`);
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleep(10000); // 10 second intervals

      const statusResponse = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
        headers: { "Authorization": `Bearer ${config.kling.apiKey}` },
      });

      if (!statusResponse.ok) continue;

      const statusData = (await statusResponse.json()) as {
        data?: { task_status?: string; task_result?: { videos?: { url?: string }[] } };
      };

      const status = statusData?.data?.task_status;
      if (status === "succeed") {
        const videoUrl = statusData?.data?.task_result?.videos?.[0]?.url;
        if (videoUrl) {
          // Download video
          const localPath = await downloadFile(videoUrl, `video_${taskId}.mp4`);
          logger.info(`Video generated and downloaded: ${localPath}`);
          return localPath;
        }
      } else if (status === "failed") {
        logger.error("Kling video generation failed", { taskId });
        return null;
      }
      // else still processing, continue polling
    }

    logger.warn(`Kling video generation timed out after ${maxAttempts * 10}s`, { taskId });
    return null;
  } catch (err) {
    logger.error("Kling video generation error", { error: String(err) });
    return null;
  }
}

// ─── DALL-E Image Fallback ───

async function generateImageDallE(prompt: string): Promise<string | null> {
  if (!config.openai.apiKey) {
    logger.warn("OpenAI API key not configured, skipping image generation");
    return null;
  }

  try {
    logger.info("Generating fallback image via DALL-E 3...");

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `Dark medieval fantasy art: ${prompt}. Style: cinematic, dramatic lighting, painterly, muted earth tones with gold accents, 4K quality.`,
        n: 1,
        size: "1792x1024",
        quality: "standard",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("DALL-E API failed", { status: response.status, error: errorText });
      return null;
    }

    const data = (await response.json()) as { data?: { url?: string }[] };
    const imageUrl = data?.data?.[0]?.url;
    if (!imageUrl) {
      logger.error("No image URL in DALL-E response");
      return null;
    }

    const localPath = await downloadFile(imageUrl, `image_${Date.now()}.png`);
    logger.info(`Fallback image generated: ${localPath}`);
    return localPath;
  } catch (err) {
    logger.error("DALL-E generation error", { error: String(err) });
    return null;
  }
}

// ─── Public API ───

export interface MediaResult {
  localPath: string;
  type: "video" | "image";
}

export async function generateMedia(videoPrompt: string): Promise<MediaResult | null> {
  ensureMediaDir();

  // Try video first
  const videoPath = await generateVideoKling(videoPrompt);
  if (videoPath) {
    return { localPath: videoPath, type: "video" };
  }

  // Fallback to image
  logger.info("Video generation failed/unavailable, falling back to image...");
  const imagePath = await generateImageDallE(videoPrompt);
  if (imagePath) {
    return { localPath: imagePath, type: "image" };
  }

  logger.warn("All media generation failed — post will go out without media");
  return null;
}

// ─── Utilities ───

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadFile(url: string, filename: string): Promise<string> {
  ensureMediaDir();
  const localPath = path.join(MEDIA_DIR, filename);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(localPath, buffer);
  return localPath;
}

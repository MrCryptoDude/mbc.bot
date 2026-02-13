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

// ─── OpenAI Sora Video Generation (REST API) ───

async function generateVideoSora(prompt: string): Promise<string | null> {
  try {
    logger.info("Requesting video from OpenAI Sora...");

    // Step 1: Submit video generation job
    const createResponse = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: "sora-2-pro",
        prompt: `${prompt}. Style: Pixar/Disney 3D animation, rich vibrant colors, expressive characters, dramatic cinematic lighting, epic fantasy atmosphere`,
        seconds: "4",
        size: "1792x1024",
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      logger.error("Sora API create failed", { status: createResponse.status, error: errorText });
      return null;
    }

    const createData = (await createResponse.json()) as { id?: string; status?: string };
    const videoId = createData?.id;
    if (!videoId) {
      logger.error("No video ID in Sora response", { response: createData });
      return null;
    }

    // Step 2: Poll for completion (max 10 minutes)
    logger.info(`Sora job ${videoId} submitted, polling for completion...`);
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleep(10000); // 10 second intervals

      const statusResponse = await fetch(`https://api.openai.com/v1/videos/${videoId}`, {
        headers: { "Authorization": `Bearer ${config.openai.apiKey}` },
      });

      if (!statusResponse.ok) continue;

      const statusData = (await statusResponse.json()) as { id: string; status: string };

      if (statusData.status === "completed") {
        // Step 3: Download the video
        const contentResponse = await fetch(`https://api.openai.com/v1/videos/${videoId}/content`, {
          headers: { "Authorization": `Bearer ${config.openai.apiKey}` },
        });

        if (!contentResponse.ok) {
          logger.error("Sora video download failed", { status: contentResponse.status });
          return null;
        }

        const buffer = Buffer.from(await contentResponse.arrayBuffer());
        ensureMediaDir();
        const localPath = path.join(MEDIA_DIR, `video_${videoId}.mp4`);
        fs.writeFileSync(localPath, buffer);

        logger.info(`Sora video generated and downloaded: ${localPath}`);
        return localPath;
      } else if (statusData.status === "failed") {
        logger.error("Sora video generation failed", { videoId });
        return null;
      }
      // queued or in_progress — keep polling
    }

    logger.warn(`Sora video generation timed out`, { videoId });
    return null;
  } catch (err) {
    logger.error("Sora video generation error", { error: String(err) });
    return null;
  }
}

// ─── DALL-E Image Fallback ───

async function generateImageDallE(prompt: string): Promise<string | null> {
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

  // Try Sora video first
  const videoPath = await generateVideoSora(videoPrompt);
  if (videoPath) {
    return { localPath: videoPath, type: "video" };
  }

  // Fallback to DALL-E image
  logger.info("Video generation failed/unavailable, falling back to DALL-E image...");
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

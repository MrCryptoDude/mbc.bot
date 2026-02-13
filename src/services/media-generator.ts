import { config } from "../config";
import { logger } from "../utils/logger";
import fs from "fs";
import path from "path";

const MEDIA_DIR = path.join(config.bot.dataDir, "media");
const IMAGE_API_URL = "https://api.openai.com/v1/images/generations";

function ensureMediaDir(): void {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

// ─── Generate manga panel image via DALL-E 3 ───

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestImage(prompt: string): Promise<{ imageUrl: string | null; revisedPrompt?: string; errorText?: string; status: number }> {
  const requestBody = {
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1792x1024",
    quality: "standard",
  };

  logger.info("Calling DALL-E 3 API...", { model: requestBody.model, size: requestBody.size, quality: requestBody.quality });

  const response = await fetch(IMAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  logger.info(`DALL-E response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    return { imageUrl: null, errorText, status: response.status };
  }

  const data = (await response.json()) as { data?: { url?: string; revised_prompt?: string }[] };
  logger.info("DALL-E response received", { hasData: !!data?.data, count: data?.data?.length });

  return {
    imageUrl: data?.data?.[0]?.url || null,
    revisedPrompt: data?.data?.[0]?.revised_prompt,
    status: response.status,
  };
}

async function generateMangaPanel(panelPrompt: string): Promise<string | null> {
  logger.info("═══ Starting DALL-E manga panel generation ═══");
  logger.info(`Manga prompt length: ${panelPrompt.length} chars`);
  logger.info(`Manga prompt preview: ${panelPrompt.slice(0, 200)}...`);

  if (!panelPrompt || panelPrompt.trim().length === 0) {
    logger.error("DALL-E SKIPPED: manga prompt is empty!");
    return null;
  }

  try {
    const fullPrompt = `Create a LANDSCAPE (wide horizontal) manga/anime comic page with multiple panels arranged left-to-right in a dynamic layout. High-quality Japanese manga art style with dramatic inking, speed lines, expressive characters, cinematic compositions. Black and white with selective color highlights (gold for magical items, green for Pepe, orange for Doge).

PANEL LAYOUT AND SCENES:
${panelPrompt}

ART DIRECTION:
- Style: Professional manga art (Attack on Titan meets One Piece meets crypto meme characters)
- Pepe: Green anthropomorphic frog, large expressive manga eyes, medieval leather armor with gold trim, manga expressions (sweat drops, sparkle eyes)
- Doge: Shiba Inu in paladin plate armor with round shield, shonen hero style
- Wojak: Pale thin human mage in dark robes, worried manga expression
- Dynamic panel borders (broken for action, clean for dialogue)
- Manga sound effects and motion lines
- REQUIRED: include readable English speech bubbles in at least 2 panels
- Keep each speech bubble short (2-8 words), dramatic, and relevant to the scene
- Include at least one reaction bubble and one action-command bubble
- Must look like hand-drawn manga art, NOT realistic`;

    logger.info(`Full DALL-E prompt length: ${fullPrompt.length} chars`);

    let imageUrl: string | null = null;
    let revisedPrompt: string | undefined;
    let lastErrorText = "";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await requestImage(fullPrompt);
      imageUrl = result.imageUrl;
      revisedPrompt = result.revisedPrompt;
      lastErrorText = result.errorText || "";

      if (imageUrl) {
        break;
      }

      const retryable = result.status >= 500 || result.status === 429;
      if (retryable && attempt < 3) {
        const backoffMs = 1200 * attempt;
        logger.warn("DALL-E transient error; retrying", { attempt, status: result.status, backoffMs });
        await sleep(backoffMs);
        continue;
      }
      break;
    }

    if (!imageUrl && lastErrorText.includes("content_policy_violation")) {
      const safeFallbackPrompt =
        "Landscape manga page in a fantasy city. Three original heroes coordinate during a crisis. " +
        "Readable speech bubbles: \"We move now!\" \"Stay together!\" \"No fear.\" Dynamic action lines.";
      logger.warn("DALL-E policy rejection detected. Retrying with safe fallback prompt.");
      const safeResult = await requestImage(safeFallbackPrompt);
      imageUrl = safeResult.imageUrl;
      revisedPrompt = safeResult.revisedPrompt;
      lastErrorText = safeResult.errorText || lastErrorText;
    }

    if (!imageUrl) {
      logger.error("DALL-E API FAILED", { error: lastErrorText.slice(0, 1000) });
      return null;
    }

    if (revisedPrompt) {
      logger.info(`DALL-E revised prompt: ${revisedPrompt.slice(0, 200)}...`);
    }

    logger.info(`DALL-E image URL received, downloading...`);
    const localPath = await downloadFile(imageUrl, `manga_${Date.now()}.png`);

    // Verify file exists and has content
    if (fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      logger.info(`Manga panel saved: ${localPath} (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
      logger.error(`File not found after download: ${localPath}`);
      return null;
    }

    return localPath;
  } catch (err) {
    logger.error("Manga panel generation EXCEPTION", { error: String(err), stack: (err as Error).stack });
    return null;
  }
}

// ─── Public API ───

export interface MediaResult {
  localPath: string;
  type: "image";
}

export async function generateMedia(panelPrompt: string): Promise<MediaResult | null> {
  ensureMediaDir();
  logger.info(`generateMedia called with prompt length: ${panelPrompt?.length || 0}`);

  const imagePath = await generateMangaPanel(panelPrompt);
  if (imagePath) {
    logger.info(`generateMedia SUCCESS: ${imagePath}`);
    return { localPath: imagePath, type: "image" };
  }

  logger.warn("Manga panel generation failed — post will go out WITHOUT media");
  return null;
}

// ─── Utilities ───

async function downloadFile(url: string, filename: string): Promise<string> {
  ensureMediaDir();
  const localPath = path.join(MEDIA_DIR, filename);

  logger.info(`Downloading image to: ${localPath}`);
  const response = await fetch(url);
  if (!response.ok) {
    logger.error(`Image download failed: ${response.status} ${response.statusText}`);
    throw new Error(`Download failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(localPath, buffer);
  logger.info(`Image downloaded: ${buffer.length} bytes`);
  return localPath;
}

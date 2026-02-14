import { config } from "../config";
import { logger } from "../utils/logger";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const MEDIA_DIR = path.join(config.bot.dataDir, "media");
const client = new OpenAI({ apiKey: config.openai.apiKey });

function ensureMediaDir(): void {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestImage(prompt: string): Promise<{
  imageDataUrl: string | null;
  imageB64: string | null;
  revisedPrompt?: string;
  errorText?: string;
  status: number;
}> {
  try {
    logger.info("Calling GPT Image API...", { model: "gpt-image-1.5", size: "1536x1024", quality: "high" });
    const response = await client.images.generate({
      model: "gpt-image-1.5",
      prompt,
      n: 1,
      size: "1536x1024",
      quality: "high",
      output_format: "png",
    });

    const imageB64 = response.data?.[0]?.b64_json || null;
    logger.info("GPT Image response received", { hasData: !!response.data, count: response.data?.length || 0 });
    if (!imageB64) {
      return { imageDataUrl: null, imageB64: null, errorText: "missing_image_data", status: 500 };
    }

    return {
      imageDataUrl: `data:image/png;base64,${imageB64}`,
      imageB64,
      revisedPrompt: response.data?.[0]?.revised_prompt,
      status: 200,
    };
  } catch (err) {
    const errorText = String(err);
    logger.warn("GPT Image API call failed", { error: errorText.slice(0, 500) });
    return { imageDataUrl: null, imageB64: null, errorText, status: 500 };
  }
}

function normalizeLineForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bubbleTextFromLine(line: string): string {
  const deLabeled = line.replace(/^BUBBLE_\d+:\s*/i, "").trim();
  const quoted = deLabeled.match(/"([^"]+)"/);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }
  const colonIdx = deLabeled.indexOf(":");
  if (colonIdx >= 0) {
    return deLabeled.slice(colonIdx + 1).replace(/^"|"$/g, "").trim();
  }
  return deLabeled.replace(/^"|"$/g, "").trim();
}

async function validateSpeechBubbles(imageDataUrl: string, expectedLines: string[]): Promise<boolean> {
  const expectationText = expectedLines.map((line, index) => `${index + 1}. ${line}`).join("\n");

  try {
    const check = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You validate comic speech bubble text quality. Return strict JSON only: " +
            '{"english_ok": boolean, "matches_expected": boolean, "matched_count": number, "gibberish_detected": boolean, "confidence": number, "reason": string}. ' +
            "Set english_ok=false if text is gibberish/non-English/unreadable. " +
            "Set gibberish_detected=true if any bubble contains random/garbled words. " +
            "Set matches_expected=true only if all visible bubbles closely match expected lines.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Expected speech bubble lines:\n" + expectationText + "\n\nEvaluate the attached image now.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
              },
            },
          ] as any,
        },
      ],
    });

    const raw = check.choices[0]?.message?.content?.trim() || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn("Bubble validation returned non-JSON output", { raw: raw.slice(0, 300) });
      return false;
    }

    const parsed = JSON.parse(match[0]) as {
      english_ok?: boolean;
      matches_expected?: boolean;
      matched_count?: number;
      gibberish_detected?: boolean;
      confidence?: number;
      reason?: string;
    };

    const pass =
      !!parsed.english_ok &&
      !parsed.gibberish_detected &&
      !!parsed.matches_expected &&
      (parsed.matched_count ?? 0) >= Math.min(3, expectedLines.length) &&
      (parsed.confidence ?? 0) >= 0.8;

    logger.info("Bubble validation result", {
      pass,
      english_ok: parsed.english_ok,
      matches_expected: parsed.matches_expected,
      matched_count: parsed.matched_count,
      gibberish_detected: parsed.gibberish_detected,
      confidence: parsed.confidence,
      reason: parsed.reason,
    });

    return pass;
  } catch (err) {
    logger.warn("Bubble validation failed", { error: String(err) });
    return false;
  }
}

async function generateMangaPanel(panelPrompt: string): Promise<string | null> {
  logger.info("Starting manga panel generation");
  logger.info(`Manga prompt length: ${panelPrompt.length} chars`);
  logger.info(`Manga prompt preview: ${panelPrompt.slice(0, 200)}...`);

  if (!panelPrompt || panelPrompt.trim().length === 0) {
    logger.error("Image generation skipped: manga prompt is empty");
    return null;
  }

  try {
    const promptLines = panelPrompt
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const sceneLine = promptLines.find((line) => /^SCENE:/i.test(line)) || panelPrompt;
    const bubbleLines = promptLines
      .filter((line) => /^BUBBLE_\d+:/i.test(line))
      .map((line) => bubbleTextFromLine(line))
      .map((line) => normalizeLineForCompare(line))
      .map((line) => line.split(" ").filter(Boolean).slice(0, 7).join(" "))
      .map((line) => line.toUpperCase())
      .filter(Boolean);

    const expectedBubbleLines = bubbleLines.length > 0 ? bubbleLines : ["WE MOVE NOW", "STAY SHARP", "NO FEAR"];
    const bubbleBlock = expectedBubbleLines.map((line, index) => `${index + 1}. ${line}`).join("\n");

    const fullPrompt = `Create a LANDSCAPE (wide horizontal) manga/anime comic page with multiple panels arranged left-to-right in a dynamic layout. High-quality Japanese manga art style with dramatic inking, speed lines, expressive characters, cinematic compositions. Black and white with selective color highlights (gold for magical items, green for Pepe, orange for Doge).

PANEL LAYOUT AND SCENES:
${sceneLine}

ART DIRECTION:
- Style: Professional manga art (Attack on Titan meets One Piece meets crypto meme characters)
- Pepe: Green anthropomorphic frog, large expressive manga eyes, medieval leather armor with gold trim, manga expressions (sweat drops, sparkle eyes)
- Doge: Shiba Inu in paladin plate armor with round shield, shonen hero style
- Wojak: Pale thin human mage in dark robes, worried manga expression
- Dynamic panel borders (broken for action, clean for dialogue)
- Manga sound effects and motion lines
- REQUIRED: include readable English speech bubbles in at least 3 panels
- Render these speech lines verbatim (do not paraphrase, do not invent extra words):
${bubbleBlock}
- Keep each speech bubble short and visually clear
- Make bubble text tightly tied to the depicted moment and character emotions
- Must look like hand-drawn manga art, NOT realistic`;

    logger.info(`Full image prompt length: ${fullPrompt.length} chars`);

    let imageDataUrl: string | null = null;
    let imageB64: string | null = null;
    let revisedPrompt: string | undefined;
    let lastErrorText = "";

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = await requestImage(fullPrompt);
      imageDataUrl = result.imageDataUrl;
      imageB64 = result.imageB64;
      revisedPrompt = result.revisedPrompt;
      lastErrorText = result.errorText || "";

      if (imageDataUrl) {
        const validBubbles = await validateSpeechBubbles(imageDataUrl, expectedBubbleLines);
        if (validBubbles) {
          break;
        }

        imageDataUrl = null;
        imageB64 = null;
        lastErrorText = "speech_bubble_validation_failed";
        logger.warn("Generated image rejected due to unreadable/non-matching bubble text", { attempt });
      }

      const retryable = result.status >= 500 || result.status === 429 || lastErrorText === "speech_bubble_validation_failed";
      if (retryable && attempt < 4) {
        const backoffMs = 1200 * attempt;
        logger.warn("Image generation attempt failed quality/status checks; retrying", { attempt, status: result.status, backoffMs });
        await sleep(backoffMs);
        continue;
      }

      break;
    }

    if (!imageDataUrl || !imageB64) {
      logger.error("Image API failed", { error: lastErrorText.slice(0, 1000) });
      return null;
    }

    if (revisedPrompt) {
      logger.info(`Image model revised prompt: ${revisedPrompt.slice(0, 200)}...`);
    }

    const localPath = saveBase64Image(imageB64, `manga_${Date.now()}.png`);

    if (fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      logger.info(`Manga panel saved: ${localPath} (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
      logger.error(`File not found after save: ${localPath}`);
      return null;
    }

    return localPath;
  } catch (err) {
    logger.error("Manga panel generation exception", { error: String(err), stack: (err as Error).stack });
    return null;
  }
}

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

  logger.warn("Manga panel generation failed; post will go out without media");
  return null;
}

function saveBase64Image(imageB64: string, filename: string): string {
  ensureMediaDir();
  const localPath = path.join(MEDIA_DIR, filename);
  const buffer = Buffer.from(imageB64, "base64");
  fs.writeFileSync(localPath, buffer);
  logger.info(`Image saved from base64: ${localPath} (${buffer.length} bytes)`);
  return localPath;
}

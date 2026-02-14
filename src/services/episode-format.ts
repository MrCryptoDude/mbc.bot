export interface EpisodeSchema {
  title: string;
  description: string;
  choiceA: string;
  choiceB: string;
  choiceC: string;
  imagePrompt: string;
}

const REQUIRED_SECTIONS = [
  "TITLE",
  "DESCRIPTION",
  "CHOICE_A",
  "CHOICE_B",
  "CHOICE_C",
  "IMAGE_PROMPT",
] as const;

function extractSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current = "";

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    const section = REQUIRED_SECTIONS.find((name) => trimmed.startsWith(`${name}:`));
    if (section) {
      current = section;
      sections[current] = trimmed.slice(section.length + 1).trim();
      continue;
    }

    if (current) {
      sections[current] = `${sections[current] || ""}${sections[current] ? "\n" : ""}${trimmed}`.trimEnd();
    }
  }

  return sections;
}

function assertNonEmpty(value: string | undefined, field: string): string {
  const normalized = (value || "").trim();
  if (!normalized) {
    throw new Error(`Invalid episode format: missing ${field}`);
  }
  return normalized;
}

function normalizeBubbleText(rawLine: string): string {
  const quoted = rawLine.match(/"([^"]+)"/);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }
  const colonIdx = rawLine.indexOf(":");
  if (colonIdx >= 0) {
    return rawLine.slice(colonIdx + 1).trim();
  }
  return rawLine.trim();
}

function isLikelyGibberish(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length < 4) {
    return true;
  }

  const words = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length < 2) {
    return true;
  }

  if (/(.)\1\1/i.test(cleaned)) {
    return true;
  }

  const wordsWithoutVowels = words.filter((w) => w.length >= 4 && !/[aeiou]/.test(w)).length;
  if (wordsWithoutVowels >= 2) {
    return true;
  }

  const alphaChars = cleaned.replace(/[^a-z]/gi, "").length;
  const nonSpaceChars = cleaned.replace(/\s/g, "").length;
  if (nonSpaceChars > 0 && alphaChars / nonSpaceChars < 0.55) {
    return true;
  }

  return false;
}

function validateImagePrompt(imagePrompt: string): void {
  const lines = imagePrompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const hasScene = lines.some((line) => /^SCENE:/i.test(line));
  if (!hasScene) {
    throw new Error("Invalid episode format: IMAGE_PROMPT must include SCENE");
  }

  const bubbleLines = lines.filter((line) => /^BUBBLE_\d+:/i.test(line));
  if (bubbleLines.length < 3) {
    throw new Error("Invalid episode format: IMAGE_PROMPT must include at least 3 BUBBLE lines");
  }

  for (const bubbleLine of bubbleLines) {
    const bubbleText = normalizeBubbleText(bubbleLine);
    if (bubbleText.length > 80) {
      throw new Error("Invalid episode format: speech bubble text too long");
    }
    if (isLikelyGibberish(bubbleText)) {
      throw new Error("Invalid episode format: speech bubble text appears gibberish");
    }
  }
}

export function parseAndValidateEpisode(raw: string): EpisodeSchema {
  const sections = extractSections(raw);

  const episode: EpisodeSchema = {
    title: assertNonEmpty(sections.TITLE, "TITLE").slice(0, 100),
    description: assertNonEmpty(sections.DESCRIPTION, "DESCRIPTION").slice(0, 220),
    choiceA: assertNonEmpty(sections.CHOICE_A, "CHOICE_A").slice(0, 25),
    choiceB: assertNonEmpty(sections.CHOICE_B, "CHOICE_B").slice(0, 25),
    choiceC: assertNonEmpty(sections.CHOICE_C, "CHOICE_C").slice(0, 25),
    imagePrompt: assertNonEmpty(sections.IMAGE_PROMPT, "IMAGE_PROMPT"),
  };

  validateImagePrompt(episode.imagePrompt);

  return episode;
}

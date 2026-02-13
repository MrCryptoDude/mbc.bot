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

  return episode;
}

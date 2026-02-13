import test from "node:test";
import assert from "node:assert/strict";
import { parseAndValidateEpisode } from "../src/services/episode-format";

test("parseAndValidateEpisode accepts valid schema", () => {
  const parsed = parseAndValidateEpisode(`TITLE: Ep 1
DESCRIPTION: The hero arrives.
CHOICE_A: Fight
CHOICE_B: Hide
CHOICE_C: Negotiate
IMAGE_PROMPT: Anime hero in rain-soaked alley.`);

  assert.equal(parsed.title, "Ep 1");
  assert.equal(parsed.choiceA, "Fight");
  assert.equal(parsed.choiceB, "Hide");
  assert.equal(parsed.choiceC, "Negotiate");
});

test("parseAndValidateEpisode rejects missing sections", () => {
  assert.throws(
    () =>
      parseAndValidateEpisode(`TITLE: Ep 1
DESCRIPTION: Missing choices and image prompt.`),
    /Invalid episode format/
  );
});

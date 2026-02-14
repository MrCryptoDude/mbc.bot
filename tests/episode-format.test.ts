import test from "node:test";
import assert from "node:assert/strict";
import { parseAndValidateEpisode } from "../src/services/episode-format";

test("parseAndValidateEpisode accepts valid schema", () => {
  const parsed = parseAndValidateEpisode(`TITLE: Ep 1
DESCRIPTION: The hero arrives.
CHOICE_A: Fight
CHOICE_B: Hide
CHOICE_C: Negotiate
IMAGE_PROMPT:
SCENE: Rain lashes the alley as Pepe blocks a charging wraith with his shield.
BUBBLE_1: Pepe "Hold the line!"
BUBBLE_2: Doge "I will flank left!"
BUBBLE_3: Wojak "Its core is exposed!"`);

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

test("parseAndValidateEpisode rejects gibberish bubble dialogue", () => {
  assert.throws(
    () =>
      parseAndValidateEpisode(`TITLE: Ep 1
DESCRIPTION: The hero arrives.
CHOICE_A: Fight
CHOICE_B: Hide
CHOICE_C: Negotiate
IMAGE_PROMPT:
SCENE: The team enters the ruined gatehouse at dusk.
BUBBLE_1: Pepe "xqtr blrzzn qlmp"
BUBBLE_2: Doge "We move fast!"
BUBBLE_3: Wojak "Cover me now!"`),
    /gibberish/
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { duel, seeded, skirmish } from "../scripts/balance";

test("balance bots: a seed repeats exactly and every match has a result", () => {
  assert.equal(seeded(7)(), seeded(7)());
  for (const seed of [1, 2]) {
    const once = duel("ethan", "tovya", seed);
    assert.equal(duel("ethan", "tovya", seed), once, "same seed, same duel");
    assert.ok([0, 0.5, 1].includes(once));
  }
  const team = skirmish("samuel", 3);
  assert.equal(skirmish("samuel", 3), team, "same seed, same skirmish");
  assert.ok([0, 0.5, 1].includes(team));
});

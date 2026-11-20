import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS } from "../shared/definitions";
import { MOTION, POSE_SIZE } from "../client/src/arena/motion";

test("every fighter has its own attack, Super, hit, knockout, landing and victory", () => {
  const hold = { x: -0.55, z: 0.32 };
  const pose = new Float32Array(POSE_SIZE);
  for (const id of IDS)
    for (const [clip, [style, seconds]] of Object.entries(MOTION[id])) {
      assert.ok(seconds > 0.15 && seconds <= 1.6, `${id} ${clip} lasts ${seconds}`);
      // Every style writes finite poses across its whole length.
      for (let t = 0; t <= seconds; t += seconds / 12) {
        pose.fill(0);
        style(t, pose, hold, seconds);
        assert.ok(pose.every(Number.isFinite), `${id} ${clip} at ${t}`);
      }
    }
});

test("attack clips stay near the attack interval so rapid fire crossfades", () => {
  for (const id of IDS) assert.ok(MOTION[id].basic_attack[1] <= 0.5, id);
});

test("the roster is not one shared animation: attacks, Supers and knockouts vary", () => {
  const distinct = (clip: "basic_attack" | "super" | "eliminated" | "respawn" | "hit") =>
    new Set(IDS.map((id) => MOTION[id][clip][0])).size;
  assert.ok(distinct("basic_attack") >= 15);
  assert.ok(distinct("super") >= 15);
  assert.ok(distinct("eliminated") >= 6);
  assert.ok(distinct("respawn") >= 6);
  assert.ok(distinct("hit") >= 5);
});

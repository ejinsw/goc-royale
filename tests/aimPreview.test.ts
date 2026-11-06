import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS } from "../shared/definitions";
import { aimPreviewFor } from "../client/src/arena/aimPreview";

test("every fighter has finite attack and Super aim footprints", () => {
  for (const id of IDS)
    for (const intent of ["attack", "super"] as const) {
      const shape = aimPreviewFor(id, intent);
      assert.ok(
        Object.values(shape).every(
          (v) => typeof v !== "number" || Number.isFinite(v),
        ),
        `${id} ${intent}`,
      );
    }
});

test("aim footprints mirror distinctive ability geometry", () => {
  const mixedVoice = aimPreviewFor("david", "attack");
  assert.equal(mixedVoice.kind, "lane");
  assert.equal(mixedVoice.range, 8);
  assert.equal(mixedVoice.width, 1.48);
  assert.ok(Math.abs((mixedVoice.coreWidth ?? 0) - 0.92) < 1e-9);
  assert.deepEqual(aimPreviewFor("david", "super"), {
    kind: "lane",
    range: 6.5,
    width: 4.5,
  });
  assert.equal(aimPreviewFor("josh", "attack").kind, "cone");
  assert.equal(aimPreviewFor("brandon", "super").kind, "circle");
  assert.equal(aimPreviewFor("isaac", "super").kind, "bar");
});

test("ball shot preview grows with charge", () => {
  const low = aimPreviewFor("brandon", "attack", true, 0.35);
  const high = aimPreviewFor("brandon", "attack", true, 1);
  assert.equal(low.kind, "lane");
  assert.equal(high.kind, "lane");
  assert.ok(high.range > low.range);
});

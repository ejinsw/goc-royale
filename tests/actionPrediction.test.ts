import { test } from "node:test";
import assert from "node:assert/strict";
import { ActionPredictor } from "../client/src/actionPrediction";
import { Engine } from "../shared/engine";
import { IDS, RULES } from "../shared/definitions";
import type { Member } from "../shared/types";

const setup = (mode: "showdown" | "broomball" = "showdown") => {
  const members: Member[] = Array.from({ length: mode === "showdown" ? 2 : 6 }, (_, i) => ({
    id: "p" + i,
    name: "P" + i,
    fighter: IDS[0],
    team: i < 3 ? 0 : 1,
    ready: true,
    connected: true,
  }));
  const e = new Engine(mode, members);
  for (let i = 0; i < 95; i++) e.step();
  const match = e.snapshot("p0");
  return { e, match, self: match.players.find((p) => p.id === "p0")! };
};

test("predicts a plausible attack on the input frame", () => {
  const { match, self } = setup();
  const a = new ActionPredictor();
  assert.equal(a.tryAttack(self, match, 10, false), "attack");
});

test("does not predict while paused, dead, stunned, or before play", () => {
  const { e, match, self } = setup();
  const a = new ActionPredictor();
  assert.equal(a.tryAttack(self, match, 10, true), null, "paused");
  assert.equal(a.tryAttack({ ...self, alive: false }, match, 10, false), null, "dead");
  assert.equal(a.tryAttack({ ...self, stunUntil: match.time + 1 }, match, 10, false), null, "stunned");
  const countdown = new Engine("showdown", e.playerList.map((p) => ({ ...p })));
  const cm = countdown.snapshot("p0");
  assert.equal(a.tryAttack(cm.players[0], cm, 10, false), null, "countdown");
});

test("unconfirmed shots count against ammo and the attack interval applies", () => {
  const { match, self } = setup();
  const a = new ActionPredictor();
  const s = { ...self, ammo: 2 };
  assert.equal(a.tryAttack(s, match, 10, false), "attack");
  assert.equal(a.tryAttack(s, match, 10 + RULES.attackInterval / 2, false), null, "interval");
  assert.equal(a.tryAttack(s, match, 10.4, false), "attack");
  // Both predicted shots are still unconfirmed: no ammo left locally.
  assert.equal(a.tryAttack(s, match, 10.8, false), null, "out of ammo");
});

test("confirmation consumes one prediction; mispredictions expire", () => {
  const { match, self } = setup();
  const a = new ActionPredictor();
  a.tryAttack(self, match, 10, false);
  assert.equal(a.confirmAttack(10.1), true, "matched: skip the duplicate cue");
  assert.equal(a.confirmAttack(10.2), false, "unpredicted authoritative attack plays normally");
  a.tryAttack(self, match, 20, false);
  assert.equal(a.confirmAttack(21.5), false, "stale prediction expired");
  assert.equal(a.pending.length, 0);
});

test("a ball carrier's attack predicts a release cue, not a shot", () => {
  const { match, self } = setup("broomball");
  match.ball.carrier = self.id;
  const a = new ActionPredictor();
  assert.equal(a.tryAttack({ ...self, ammo: 0 }, match, 10, false), "release");
  assert.equal(a.pending.length, 0, "releases are not attack effects");
});

test("Super anticipation requires full charge and no ball, and is rate limited", () => {
  const { match, self } = setup("broomball");
  const a = new ActionPredictor();
  assert.equal(a.trySuper({ ...self, charge: 4999 }, match, 10, false), false);
  const full = { ...self, charge: RULES.superCharge };
  assert.equal(a.trySuper(full, match, 10, false), true);
  assert.equal(a.trySuper(full, match, 10.2, false), false, "mashing does not spam");
  match.ball.carrier = self.id;
  assert.equal(a.trySuper(full, match, 11, false), false, "carrier lock");
});

test("predicted attacks match the authority's attack effects one-to-one", () => {
  // Drive the real engine and check each predicted shot gets exactly one
  // authoritative attack effect, so no cue is lost or doubled.
  const { e } = setup();
  const a = new ActionPredictor();
  let predicted = 0,
    confirmed = 0;
  const seen = new Set<number>();
  for (let k = 0; k < 90; k++) {
    const now = 10 + k / 30;
    const snap = e.snapshot("p0");
    const self = snap.players.find((p) => p.id === "p0")!;
    for (const fx of snap.effects)
      if (fx.kind === "attack" && fx.owner === "p0" && !seen.has(fx.id)) {
        seen.add(fx.id);
        if (a.confirmAttack(now)) confirmed++;
      }
    if (k % 4 === 0 && a.tryAttack(self, snap, now, false)) {
      predicted++;
      e.setInput("p0", { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: true });
    }
    e.step();
  }
  assert.ok(predicted >= 3, `predicted ${predicted}`);
  assert.equal(confirmed, predicted);
  assert.equal(seen.size, predicted, "authority fired exactly the predicted shots");
});

test("item cue confirmation matches the exact input sequence", () => {
  const predictor = new ActionPredictor();
  predictor.predictItem(10);
  predictor.predictItem(12);
  assert.equal(predictor.confirmItem(11), false, "a different or rejected action cannot steal a cue");
  assert.equal(predictor.confirmItem(undefined), false, "an unsequenced event is not guessed");
  assert.equal(predictor.confirmItem(12), true);
  assert.equal(predictor.confirmItem(12), false, "the same cue cannot be consumed twice");
  predictor.acknowledgeItems(10);
  assert.equal(predictor.confirmItem(10), false, "acknowledged rejected predictions are discarded");
});

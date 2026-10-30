import { test } from "node:test";
import assert from "node:assert/strict";
import { runScenario } from "./netsim";

/** Standard §4.2 target: local correction error <= 0.25 world units p95. */
const TARGET = 0.25;

const lan = runScenario({ name: "lan", rttMs: 10, loss: 0, jitterMs: 2 });
const rtt50 = runScenario({ name: "50", rttMs: 50, loss: 0, jitterMs: 6 });
const rtt100 = runScenario({ name: "100/1", rttMs: 100, loss: 0.01, jitterMs: 8 });
const rtt200 = runScenario({ name: "200/3", rttMs: 200, loss: 0.03, jitterMs: 12 });
const outage = runScenario({
  name: "outage",
  rttMs: 100,
  loss: 0,
  jitterMs: 8,
  outage: { start: 9000, end: 9500 },
});
const all = [lan, rtt50, rtt100, rtt200, outage];

test("netsim: actions are presented exactly once under every network case", () => {
  for (const r of all) {
    assert.ok(r.attacksSent > 0, `${r.name}: scripted attacks were sent`);
    assert.equal(r.attacksPresented, r.attacksSent, `${r.name}: none lost or doubled`);
  }
});

test("netsim: local movement responds on the frame the input is sampled", () => {
  for (const r of all) assert.equal(r.responseFrames.max, 0, r.name);
});

test("netsim: correction p95 meets the 0.25-unit target at LAN, 50 ms, and through a 500 ms outage", () => {
  for (const r of [lan, rtt50, outage])
    assert.ok(r.corrections.p95 <= TARGET, `${r.name}: p95 ${r.corrections.p95}`);
});

test("netsim: corrections render as small per-frame glides, not snaps", () => {
  for (const r of [lan, rtt50, rtt100])
    assert.ok(r.visibleJumpMax <= TARGET, `${r.name}: ${r.visibleJumpMax}`);
});

test("netsim: outage recovers and prediction state stays bounded", () => {
  assert.ok(outage.staleAgeMs.max >= 500, "the outage was actually exercised");
  assert.ok(outage.staleAgeMs.max < 700, "snapshots resume after the outage");
  for (const r of all) assert.ok(r.maxPendingInputs < 60, `${r.name}: pending bounded`);
});

test("netsim: regression ceiling for 100 ms/1% and 200 ms/3% (target NOT yet met)", () => {
  // These exceed the 0.25 target because the authority applies the latest
  // input each tick, so retransmission-delayed inputs are stretched or skipped.
  // This guards against regressions only; see docs/STATUS.md.
  for (const r of [rtt100, rtt200])
    assert.ok(r.corrections.p95 < 0.45, `${r.name}: p95 ${r.corrections.p95}`);
});

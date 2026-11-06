import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraFocusId } from "../client/src/arena/cameraFocus";

const players = [
  { id: "local", alive: true },
  { id: "one", alive: true },
  { id: "two", alive: false },
];

test("a living local fighter always retakes camera control", () => {
  assert.equal(cameraFocusId(players, "local", "one"), "local");
});

test("a defeated local fighter may spectate a living fighter", () => {
  assert.equal(
    cameraFocusId(
      players.map((player) =>
        player.id === "local" ? { ...player, alive: false } : player,
      ),
      "local",
      "one",
    ),
    "one",
  );
});

test("dead and missing spectator targets fall back to a living fighter", () => {
  const defeated = players.map((player) =>
    player.id === "local" ? { ...player, alive: false } : player,
  );
  assert.equal(cameraFocusId(defeated, "local", "two"), "one");
  assert.equal(cameraFocusId(defeated, "local", "missing"), "one");
});

test("the camera has a stable fallback when nobody is alive", () => {
  const defeated = players.map((player) => ({ ...player, alive: false }));
  assert.equal(cameraFocusId(defeated, "local", "one"), "local");
  assert.equal(cameraFocusId(defeated, "missing", null), null);
});

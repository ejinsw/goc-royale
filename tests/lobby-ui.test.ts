import assert from "node:assert/strict";
import { test } from "node:test";
import type { Lobby } from "../shared/types";
import { lobbyStage } from "../client/src/ui/screens/stageViews";

const lobby: Lobby = {
  code: "TESTAA",
  host: "host",
  mode: "broomball",
  phase: "lobby",
  members: [
    {
      id: "host",
      name: "Host",
      fighter: "brandon",
      team: 0,
      ready: false,
      connected: true,
    },
    {
      id: "guest",
      name: "Guest",
      fighter: "ethan",
      team: 1,
      ready: false,
      connected: true,
    },
  ],
};

test("Broomball stage exposes team controls for every host-managed player", () => {
  const calls: string[] = [];
  const view = lobbyStage(
    lobby,
    "host",
    { x0: 0, y0: 0, x1: 1, y1: 1 },
    {
      openPicker: () => {
        calls.push("picker");
      },
      setTeam: (id, team) => {
        calls.push(`team:${id}:${team}`);
      },
      kick: (id) => {
        calls.push(`kick:${id}`);
      },
    },
  );

  assert.deepEqual(
    view.plates.map((plate) => plate.actions?.map((action) => action.key)),
    [["team"], ["team", "kick"]],
  );
  view.plates[0].actions?.find((action) => action.key === "team")?.onPress();
  view.plates[1].actions?.find((action) => action.key === "team")?.onPress();
  view.plates[1].actions?.find((action) => action.key === "kick")?.onPress();
  assert.deepEqual(calls, ["team:host:1", "team:guest:0", "kick:guest"]);
});

test("guests receive no team or kick controls", () => {
  const view = lobbyStage(
    lobby,
    "guest",
    { x0: 0, y0: 0, x1: 1, y1: 1 },
    {
      openPicker: () => undefined,
      setTeam: () => undefined,
      kick: () => undefined,
    },
  );
  assert.equal(
    view.plates.every((plate) => !plate.actions?.length),
    true,
  );
});

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
      pickFor: (id) => {
        calls.push(`pick:${id}`);
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
      pickFor: () => undefined,
      setTeam: () => undefined,
      kick: () => undefined,
    },
  );
  assert.equal(
    view.plates.every((plate) => !plate.actions?.length),
    true,
  );
});

test("bot plates: the host picks their fighter and removes them; guests only see them", () => {
  const withBot: Lobby = {
    ...lobby,
    mode: "showdown",
    members: [
      ...lobby.members,
      { id: "bot-1", name: "Rich Bot", fighter: "rich", team: 1, ready: true, connected: true, bot: true },
    ],
  };
  const calls: string[] = [];
  const actions = {
    openPicker: () => void calls.push("picker"),
    pickFor: (id: string) => void calls.push(`pick:${id}`),
    setTeam: () => undefined,
    kick: (id: string) => void calls.push(`kick:${id}`),
  };
  const host = lobbyStage(withBot, "host", { x0: 0, y0: 0, x1: 1, y1: 1 }, actions);
  const plate = host.plates[2];
  assert.equal(plate.icon, "bot");
  assert.equal(plate.caption, "Bot");
  assert.match(plate.label, /Rich Bot, Rich, bot\. Change fighter, team or remove/);
  // Team and removal live in the bot's sheet, not as plate buttons.
  assert.equal(plate.actions, undefined);
  plate.onPress?.();
  // A guest's plate is not the host's to re-pick.
  assert.equal(host.plates[1].onPress, undefined);
  assert.deepEqual(calls, ["pick:bot-1"]);
  const guest = lobbyStage(withBot, "guest", { x0: 0, y0: 0, x1: 1, y1: 1 }, actions);
  assert.equal(guest.plates[2].onPress, undefined);
  assert.equal(guest.plates[2].actions, undefined);
});

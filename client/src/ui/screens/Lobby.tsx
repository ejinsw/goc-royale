import { FIGHTERS, MODES, type Mode } from "../../../../shared/definitions";
import type { Command, Lobby } from "../../../../shared/types";
import type { PressResult } from "../core/control";
import { menuKit } from "../menu/menuKit";

const { Control } = menuKit;

/** Lobby order and icon of each mode; names and capacities come from MODES. */
const MODE_PICKS: { value: Mode; icon: "users" | "ball" | "hook" }[] = [
  { value: "showdown", icon: "users" },
  { value: "broomball", icon: "ball" },
  { value: "fishing", icon: "hook" },
];

/** Mirrors the room's start validation so Start can deny with a reason. */
export function startBlocked(l: Lobby): string | undefined {
  if (l.members.some((p) => !p.connected)) return "Waiting for players to reconnect";
  const waiting = l.members.filter((p) => !p.ready).length;
  if (waiting) return waiting === 1 ? "1 player is not ready" : `${waiting} players are not ready`;
  if (l.members.length > MODES[l.mode].capacity)
    return `${MODES[l.mode].name} holds up to ${MODES[l.mode].capacity}`;
  return undefined;
}

export interface LobbyProps {
  lobby: Lobby;
  selfId: string;
  command: (c: Command) => void;
  onCopy: () => PressResult;
  onLeave: () => PressResult;
  onFighters: () => PressResult;
  onSettings: () => PressResult;
}

/** Lobby: the party stands on the stage; mode, readiness and start dock. */
export function LobbyScreen({ lobby, selfId, command, onCopy, onLeave, onFighters, onSettings }: LobbyProps) {
  const me = lobby.members.find((m) => m.id === selfId);
  const host = lobby.host === selfId;
  const ready = lobby.members.filter((m) => m.ready).length;
  const blocked = startBlocked(lobby);
  const count = lobby.members.length;
  return (
    <main className="screen lobby">
      <header className="bar">
        <Control kind="icon" icon="leave" label="Leave room" hideLabel onPress={onLeave} />
        <Control
          kind="button"
          variant="dark"
          size="sm"
          className="room-code"
          icon="copy"
          label={`ROOM ${lobby.code}`}
          sub="Copy invite"
          onPress={onCopy}
        />
        <Control
          kind="choice"
          className="mode-pick"
          label="Game mode"
          value={lobby.mode}
          disabled={host ? undefined : "Only the host picks the mode"}
          options={MODE_PICKS.map(({ value, icon }) => ({
            value,
            icon,
            label: MODES[value].short ?? MODES[value].name,
            sub: `${count}/${MODES[value].capacity} players`,
            disabled:
              count > MODES[value].capacity && lobby.mode !== value
                ? `${MODES[value].name} holds up to ${MODES[value].capacity}`
                : undefined,
          }))}
          onChange={(mode) => command({ type: "mode", mode })}
        />
        <Control kind="icon" icon="gear" label="Settings" hideLabel onPress={onSettings} />
      </header>
      <section className="dock">
        <div className="dock-side">
          <Control
            kind="tile"
            icon="users"
            label="Fighter"
            sub={me ? FIGHTERS[me.fighter].name : ""}
            onPress={onFighters}
          />
          {host && lobby.mode === "broomball" && (
            <Control
              kind="button"
              variant="dark"
              icon="shuffle"
              label="Shuffle"
              onPress={() => {
                command({ type: "shuffle" });
                return "confirm";
              }}
            />
          )}
        </div>
        <div className="dock-main">
          <Control
            kind="button"
            variant={me?.ready ? "selected" : host ? "dark" : "primary"}
            size={host ? "lg" : "hero"}
            profile="heavy"
            icon={me?.ready ? "check" : "play"}
            label={me?.ready ? "Ready!" : "Ready up"}
            sub={me?.ready ? "Tap to undo" : undefined}
            onPress={() => {
              command({ type: "ready", ready: !me?.ready });
              return me?.ready ? undefined : "confirm";
            }}
          />
          {host && (
            <Control
              kind="button"
              variant="primary"
              size="hero"
              profile="heavy"
              icon="play"
              label="Start"
              sub={`${ready}/${count} ready`}
              disabled={blocked}
              onPress={() => {
                command({ type: "start" });
                return "confirm";
              }}
            />
          )}
        </div>
      </section>
    </main>
  );
}

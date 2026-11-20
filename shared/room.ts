import { Bot } from "./bot";
import { Engine } from "./engine";
import { FIGHTERS, IDS, type FighterId, type Mode } from "./definitions";
import type { Command, HostMessage, Lobby, Member } from "./types";
interface Session {
  id: string;
  token: string;
  leftAt: number | null;
  lastMessage: number;
  count: number;
}
/** Party caps: Showdown 10, Broomball 6, bots included. */
const CAPACITY = { showdown: 10, broomball: 6 } as const;
export class Room {
  lobby: Lobby;
  engine: Engine | null = null;
  sessions = new Map<string, Session>();
  /** One brain per bot member while a match runs. */
  bots = new Map<string, Bot>();
  now = 0;
  private botSerial = 0;
  constructor(
    code: string,
    public send: (id: string, message: HostMessage) => void,
    private random: () => number = Math.random,
  ) {
    this.lobby = {
      code,
      host: "",
      mode: "showdown",
      members: [],
      phase: "lobby",
    };
  }
  join(name: string, token?: string) {
    const found = token
      ? [...this.sessions.values()].find((s) => s.token === token)
      : undefined;
    if (found) {
      const m = this.lobby.members.find((m) => m.id === found.id);
      if (!m) throw Error("Session expired. Rejoin the room.");
      if (
        found.leftAt !== null &&
        this.now - found.leftAt > (this.lobby.phase === "lobby" ? 30 : 20)
      )
        throw Error("Reconnect window expired.");
      found.leftAt = null;
      m.connected = true;
      const p = this.engine?.state.players.find((x) => x.id === m.id);
      if (p) {
        // A fresh browser or a replacement transport has a fresh sequence
        // counter and clock, even when reclaiming the same player identity.
        this.engine?.resetInput(m.id);
        p.connected = true;
      }
      this.send(m.id, {
        type: "welcome",
        id: m.id,
        token: found.token,
        lobby: this.lobby,
      });
      this.broadcastLobby();
      return { id: m.id, token: found.token };
    }
    if (this.lobby.phase !== "lobby")
      throw Error(
        "This match has started. Join after the host returns to the lobby.",
      );
    if (this.lobby.members.length >= CAPACITY[this.lobby.mode])
      throw Error(
        this.lobby.members.some((m) => m.bot)
          ? "Room is full. Ask the host to remove a bot."
          : "Room is full.",
      );
    const clean = String(name)
      .trim()
      .replace(/[\u0000-\u001f]/g, "")
      .slice(0, 18);
    if (!clean) throw Error("Enter a nickname.");
    const id = crypto.randomUUID(),
      secret = crypto.randomUUID() + crypto.randomUUID();
    const i = this.lobby.members.length;
    const member: Member = {
      id,
      name: clean,
      // Spread first picks across the whole roster (was IDS[i % 6], which
      // never offered the seventh or any later fighter).
      fighter: IDS[i % IDS.length],
      team: i < 3 ? 0 : 1,
      ready: false,
      connected: true,
    };
    this.lobby.members.push(member);
    if (!this.lobby.host) this.lobby.host = id;
    this.sessions.set(id, {
      id,
      token: secret,
      leftAt: null,
      lastMessage: this.now,
      count: 0,
    });
    this.send(id, { type: "welcome", id, token: secret, lobby: this.lobby });
    this.broadcastLobby();
    return { id, token: secret };
  }
  error(id: string, message: string) {
    this.send(id, { type: "error", message });
  }
  /** A lobby change asks people to ready up again; bots are always ready. */
  private unready() {
    for (const p of this.lobby.members) p.ready = !!p.bot;
  }
  /** "Rich Bot", then "Rich Bot 2" for a second Rich. */
  private botName(fighter: FighterId, self?: string) {
    const base = `${FIGHTERS[fighter].name} Bot`;
    const taken = (n: string) =>
      this.lobby.members.some((m) => m.id !== self && m.name === n);
    let name = base;
    for (let k = 2; taken(name); k++) name = `${base} ${k}`;
    return name;
  }
  /** Host: add a bot, as `fighter` or a fighter nobody in the party has. */
  private addBot(fighter?: FighterId) {
    const l = this.lobby;
    if (l.members.length >= CAPACITY[l.mode]) return "The room is full.";
    const used = new Set(l.members.map((m) => m.fighter));
    const free = IDS.filter((f) => !used.has(f));
    const pool = free.length ? free : IDS;
    const pick =
      fighter && IDS.includes(fighter)
        ? fighter
        : pool[Math.floor(this.random() * pool.length) % pool.length];
    const blue = l.members.filter((m) => m.team === 0).length;
    const team =
      l.mode === "broomball"
        ? blue <= l.members.length - blue
          ? 0
          : 1
        : l.members.length < 3
          ? 0
          : 1;
    l.members.push({
      id: `bot-${++this.botSerial}-${crypto.randomUUID().slice(0, 8)}`,
      name: this.botName(pick),
      fighter: pick,
      team,
      ready: true,
      connected: true,
      bot: true,
    });
    return null;
  }
  broadcastLobby() {
    for (const m of this.lobby.members)
      if (m.connected && !m.bot)
        this.send(m.id, { type: "lobby", lobby: structuredClone(this.lobby) });
  }
  validation() {
    const l = this.lobby,
      m = l.members;
    if (m.length === 0) return "Add at least one player.";
    if (!m.some((p) => !p.bot)) return "Someone needs to play.";
    if (m.some((p) => !p.connected))
      return "Wait for disconnected players to reconnect or expire.";
    if (m.some((p) => !p.ready)) return "Everyone needs to ready up.";
    // No minimum player count by product decision. Caps only: Showdown 10,
    // Broomball 6. Broomball teams may be any split and may share fighters.
    if (l.mode === "showdown" && m.length > 10)
      return "Showdown is capped at 10 players.";
    if (l.mode === "broomball" && m.length > 6)
      return "Broomball is capped at 6 players.";
    return null;
  }
  command(id: string, c: Command) {
    const member = this.lobby.members.find((m) => m.id === id),
      session = this.sessions.get(id);
    if (!member || !member.connected || !session || !c || typeof c !== "object")
      return;
    if (this.now - session.lastMessage >= 1) {
      session.count = 0;
      session.lastMessage = this.now;
    }
    if (++session.count > 90) return;
    if (c.type === "input") {
      if (this.lobby.phase === "match") this.engine?.setInput(id, c.input);
      return;
    }
    const host = id === this.lobby.host;
    if (c.type === "lobby") {
      if (!host) {
        this.error(id, "Only the host can return everyone to the lobby.");
        return;
      }
      if (this.engine && this.engine.state.phase !== "finished") {
        this.error(id, "Finish the current match first.");
        return;
      }
      this.engine = null;
      this.bots.clear();
      this.lobby.members = this.lobby.members.filter(
        (p) => p.bot || this.sessions.has(p.id),
      );
      this.lobby.phase = "lobby";
      this.unready();
      this.broadcastLobby();
      return;
    }
    if (this.lobby.phase !== "lobby") {
      this.error(id, "Lobby is locked during the match.");
      return;
    }
    if (c.type === "select") {
      if (!IDS.includes(c.fighter)) return;
      if (c.id !== undefined && c.id !== id) {
        // The host picks for bots; nobody picks for another person.
        const target = this.lobby.members.find((p) => p.id === c.id);
        if (!host || !target?.bot) {
          this.error(id, "Only the host can choose a bot's fighter.");
          return;
        }
        target.fighter = c.fighter;
        target.name = this.botName(c.fighter, target.id);
      } else {
        // Duplicate fighters are allowed on a team (no-duplicate rule removed).
        member.fighter = c.fighter;
        member.ready = false;
      }
    } else if (c.type === "bot") {
      if (!host) {
        this.error(id, "Only the host can add bots.");
        return;
      }
      const problem = this.addBot(c.fighter);
      if (problem) {
        this.error(id, problem);
        return;
      }
    } else if (c.type === "ready") member.ready = c.ready === true;
    else if (
      c.type === "mode" &&
      host &&
      ["showdown", "broomball"].includes(c.mode)
    ) {
      this.lobby.mode = c.mode as Mode;
      this.unready();
      this.lobby.members.forEach((p, i) => (p.team = i < 3 ? 0 : 1));
    } else if (c.type === "team" && host && (c.team === 0 || c.team === 1)) {
      const target = this.lobby.members.find((p) => p.id === c.id);
      if (target) target.team = c.team;
      this.unready();
    } else if (c.type === "kick") {
      if (!host) {
        this.error(id, "Only the host can remove players.");
        return;
      }
      const target = this.lobby.members.find((p) => p.id === c.id);
      if (!target || target.id === this.lobby.host) {
        this.error(id, "The host cannot be removed from their own room.");
        return;
      }
      if (!target.bot)
        this.send(target.id, {
          type: "removed",
          message: "The host removed you from the room.",
        });
      this.lobby.members = this.lobby.members.filter((p) => p.id !== target.id);
      this.sessions.delete(target.id);
      this.unready();
    } else if (c.type === "shuffle" && host) {
      const shuffled = [...this.lobby.members];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled.forEach((p, i) => (p.team = i < 3 ? 0 : 1));
      this.unready();
    } else if (c.type === "start" && host) {
      const problem = this.validation();
      if (problem) {
        this.error(id, problem);
        return;
      }
      this.engine = new Engine(this.lobby.mode, this.lobby.members);
      this.bots = new Map(
        this.lobby.members
          .filter((m) => m.bot)
          .map((m, i) => [m.id, new Bot(m.id, this.random, i)]),
      );
      this.lobby.phase = "match";
    }
    this.broadcastLobby();
  }
  disconnect(id: string) {
    const session = this.sessions.get(id),
      m = this.lobby.members.find((p) => p.id === id);
    if (!session || !m) return;
    session.leftAt = this.now;
    m.connected = false;
    m.ready = false;
    this.engine?.disconnect(id);
    this.broadcastLobby();
  }
  tick() {
    this.now += 1 / 30;
    for (const [id, s] of this.sessions)
      if (
        s.leftAt !== null &&
        this.now - s.leftAt > (this.lobby.phase === "lobby" ? 30 : 20)
      ) {
        const p = this.engine?.state.players.find((p) => p.id === id);
        if (p?.alive && this.engine?.state.phase !== "finished")
          this.engine?.eliminate(p);
        if (p) p.respawn = Infinity;
        this.sessions.delete(id);
        if (this.lobby.phase === "lobby")
          this.lobby.members = this.lobby.members.filter((p) => p.id !== id);
        s.leftAt = null;
        this.broadcastLobby();
      }
    if (this.engine && this.lobby.phase === "match") {
      // Bots send their input for this tick like any client, then it runs.
      for (const bot of this.bots.values()) bot.update(this.engine);
      this.engine.step();
      if (this.engine.state.phase === "finished") {
        this.lobby.phase = "results";
        this.broadcastLobby();
      }
    }
  }
  snapshots() {
    if (!this.engine) return;
    for (const m of this.lobby.members)
      if (m.connected && !m.bot)
        this.send(m.id, {
          type: "snapshot",
          match: this.engine.snapshot(m.id),
        });
  }
}

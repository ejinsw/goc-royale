import assert from "node:assert/strict";
import { test } from "node:test";
import { FIGHTERS, FISH, IDS, MAPS, type FighterId } from "../shared/definitions";
import { Bot, superUses } from "../shared/bot";
import { Engine } from "../shared/engine";
import { Room } from "../shared/room";
import type { HostMessage, Member } from "../shared/types";

/** A tiny seeded generator, so a failure always reproduces. */
const random = (seed: number) => () =>
  ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function room() {
  const sent: { id: string; m: HostMessage }[] = [];
  const r = new Room("BOTSAA", (id, m) => sent.push({ id, m }), random(3));
  const host = r.join("Host").id;
  return { r, host, sent };
}
const errors = (sent: { id: string; m: HostMessage }[], id: string) =>
  sent.filter((s) => s.id === id && s.m.type === "error").map((s) => (s.m as { message: string }).message);

test("every fighter row declares a bot, and every Super has a reason to be used", () => {
  for (const id of IDS) {
    const { bot, abilities } = FIGHTERS[id];
    assert.ok(bot.keep > 0 && bot.keep <= 1, `${id} keep`);
    assert.ok(bot.retreat >= 0 && bot.retreat < 1, `${id} retreat`);
    assert.ok(bot.strafe >= 0 && bot.strafe <= 1, `${id} strafe`);
    assert.ok(superUses(abilities.super).length > 0, `${id} Super has no bot use`);
  }
});

test("the host adds bots that are always ready and fill party slots", () => {
  const { r, host, sent } = room();
  r.command(host, { type: "bot" });
  r.command(host, { type: "bot", fighter: "rich" });
  const bots = r.lobby.members.filter((m) => m.bot);
  assert.equal(bots.length, 2);
  assert.ok(bots.every((b) => b.ready && b.connected));
  assert.equal(bots[1].fighter, "rich");
  assert.equal(bots[1].name, "Rich Bot");
  // A bot added without a pick takes a fighter nobody has yet.
  assert.notEqual(bots[0].fighter, r.lobby.members[0].fighter);
  r.command(host, { type: "bot", fighter: "rich" });
  assert.equal(r.lobby.members.at(-1)!.name, "Rich Bot 2");
  for (let i = 0; i < 10; i++) r.command(host, { type: "bot" });
  assert.equal(r.lobby.members.length, 10);
  assert.deepEqual(errors(sent, host).slice(-1), ["The room is full."]);
  assert.throws(() => r.join("Late"), /remove a bot/);
  // Bots never receive messages: they are not connections.
  assert.ok(sent.every((s) => !s.id.startsWith("bot-")));
});

test("only the host adds bots or picks their fighters; bots can be removed", () => {
  const { r, host, sent } = room();
  const guest = r.join("Guest").id;
  r.command(guest, { type: "bot" });
  assert.deepEqual(errors(sent, guest), ["Only the host can add bots."]);
  r.command(host, { type: "bot", fighter: "tovya" });
  const bot = r.lobby.members.find((m) => m.bot)!;
  r.command(guest, { type: "select", fighter: "joyce", id: bot.id });
  assert.equal(bot.fighter, "tovya");
  // Nobody picks for another person, the host included.
  r.command(host, { type: "select", fighter: "joyce", id: guest });
  assert.equal(r.lobby.members.find((m) => m.id === guest)!.fighter, IDS[1]);
  r.command(host, { type: "select", fighter: "joyce", id: bot.id });
  assert.equal(bot.fighter, "joyce");
  assert.equal(bot.name, "Joyce Bot");
  assert.ok(bot.ready);
  r.command(host, { type: "kick", id: bot.id });
  assert.equal(r.lobby.members.some((m) => m.bot), false);
  assert.ok(!sent.some((s) => s.m.type === "removed"));
});

test("bots stay ready through lobby changes and stay in the party for a rematch", () => {
  const { r, host } = room();
  r.command(host, { type: "bot" });
  r.command(host, { type: "mode", mode: "broomball" });
  r.command(host, { type: "shuffle" });
  const bot = r.lobby.members.find((m) => m.bot)!;
  assert.ok(bot.ready);
  r.command(host, { type: "start" });
  assert.equal(r.lobby.phase, "lobby", "the host is not ready yet");
  r.command(host, { type: "ready", ready: true });
  r.command(host, { type: "start" });
  assert.equal(r.lobby.phase, "match");
  assert.equal(r.bots.size, 1);
  r.engine!.finish("blue");
  r.tick();
  assert.equal(r.lobby.phase, "results");
  r.command(host, { type: "lobby" });
  assert.equal(r.lobby.phase, "lobby");
  assert.ok(r.lobby.members.some((m) => m.id === bot.id && m.ready));
  assert.equal(r.bots.size, 0);
});

test("a bot plays a real match through the room: it moves and attacks the host", () => {
  const { r, host } = room();
  r.command(host, { type: "select", fighter: "daniel" });
  r.command(host, { type: "bot", fighter: "brandon" });
  r.command(host, { type: "ready", ready: true });
  r.command(host, { type: "start" });
  const e = r.engine!;
  const [me, bot] = e.state.players;
  for (let i = 0; i < 100; i++) r.tick();
  me.pos = { x: 18, y: 12 };
  bot.pos = { x: 12, y: 12 };
  const start = { ...bot.pos };
  for (let i = 0; i < 30 * 6; i++) {
    e.setInput(me.id, { move: { x: 0, y: i % 40 < 20 ? 1 : -1 }, aim: { x: -1, y: 0 } });
    r.tick();
  }
  assert.ok(bot.stats.damage > 0, "the bot hit the host");
  assert.ok(Math.hypot(bot.pos.x - start.x, bot.pos.y - start.y) > 0.5, "the bot moved");
});

/** One fighter's bot against a rival who jukes around the middle and never fights back. */
function duel(id: FighterId, seconds: number) {
  const members: Member[] = [
    { id: "bot", name: "Bot", fighter: id, team: 0, ready: true, connected: true, bot: true },
    { id: "rival", name: "Rival", fighter: "daniel", team: 1, ready: true, connected: true },
  ];
  const rnd = random(5 + IDS.indexOf(id));
  const e = new Engine("showdown", members, rnd);
  const bot = new Bot("bot", rnd);
  const [me, rival] = e.state.players;
  me.pos = { x: 12, y: 12 };
  rival.pos = { x: 20, y: 12 };
  let dir = { x: 0, y: 1 },
    turnAt = 0,
    supers = 0,
    hurt = false;
  while (e.state.time < seconds) {
    if (e.state.time > turnAt) {
      const a = rnd() * Math.PI * 2;
      dir = { x: Math.cos(a), y: Math.sin(a) };
      turnAt = e.state.time + 0.4 + rnd() * 0.8;
    }
    if (Math.hypot(rival.pos.x - 18, rival.pos.y - 12) > 5)
      dir = { x: (18 - rival.pos.x) / 5, y: (12 - rival.pos.y) / 5 };
    e.setInput("rival", { move: dir, aim: { x: -1, y: 0 } });
    // Healing and shielding Supers wait for a reason: take a hit once charged.
    if (me.charge >= 5000 && !hurt) {
      me.hp = FIGHTERS[id].hp * 0.4;
      hurt = true;
    }
    bot.update(e);
    e.step();
    while (e.state.cutscene) e.step();
    for (const ev of e.state.events)
      if (ev.tick === e.state.tick && ev.type === "super_started" && ev.owner === "bot") {
        supers++;
        hurt = false;
      }
    if (rival.hp < 2000) rival.hp = FIGHTERS.daniel.hp;
  }
  return { damage: me.stats.damage, supers };
}

test("every fighter's bot lands attacks and uses its Super, with no fighter-specific code", () => {
  for (const id of IDS) {
    const { damage, supers } = duel(id, 60);
    assert.ok(damage >= 5000, `${id} bot dealt only ${Math.round(damage)}`);
    assert.ok(supers >= 1, `${id} bot never used its Super`);
  }
});

test("a bot cannot see a rival hidden in a bush", () => {
  const members: Member[] = [
    { id: "bot", name: "Bot", fighter: "rich", team: 0, ready: true, connected: true, bot: true },
    { id: "hidden", name: "Hidden", fighter: "daniel", team: 1, ready: true, connected: true },
  ];
  const e = new Engine("showdown", members, random(9));
  const bot = new Bot("bot", random(9));
  const [me, hidden] = e.state.players;
  for (let i = 0; i < 100; i++) e.step();
  const attacks = () => e.state.events.filter((ev) => ev.type === "attack_started").length;
  let fired = 0;
  for (let i = 0; i < 90; i++) {
    me.pos = { x: 10, y: 12 };
    hidden.pos = { x: 5.5, y: 12 }; // inside the west bush, 4.5 away
    bot.update(e);
    e.step();
    fired += attacks();
  }
  assert.equal(fired, 0, "attacked a concealed rival");
  hidden.revealUntil = e.state.time + 5;
  for (let i = 0; i < 90; i++) {
    me.pos = { x: 10, y: 12 };
    hidden.pos = { x: 5.5, y: 12 };
    bot.update(e);
    e.step();
    fired += attacks();
  }
  assert.ok(fired > 0, "ignored a revealed rival");
});

function botMatch(mode: "showdown" | "broomball", fighters: FighterId[], seed: number) {
  const members: Member[] = fighters.map((f, i) => ({
    id: "b" + i,
    name: f,
    fighter: f,
    team: (mode === "broomball" ? i % 2 : 0) as 0 | 1,
    ready: true,
    connected: true,
    bot: true,
  }));
  const rnd = random(seed);
  const e = new Engine(mode, members, rnd);
  const bots = members.map((m, i) => new Bot(m.id, rnd, i));
  let thinking = 0,
    ticks = 0;
  while (e.state.phase !== "finished" && e.state.time < 240) {
    const t0 = performance.now();
    for (const b of bots) b.update(e);
    thinking += performance.now() - t0;
    ticks++;
    e.step();
    while (e.state.cutscene) e.step();
  }
  return { e, msPerTick: thinking / ticks };
}

test("ten bots finish a Showdown within the planning budget", () => {
  const { e, msPerTick } = botMatch("showdown", IDS.slice(0, 10), 11);
  assert.equal(e.state.phase, "finished");
  assert.ok(e.state.winner, "a winner");
  assert.ok(e.state.players.filter((p) => p.stats.kills > 0).length >= 2);
  // Ten bots together, per 33 ms simulation tick, on the hosting browser.
  assert.ok(msPerTick < 1, `bots took ${msPerTick.toFixed(3)} ms per tick`);
});

test("Broomball bots carry, shoot, score and defend", () => {
  const { e } = botMatch("broomball", ["daniel", "rich", "samuel", "josh", "elijah", "tovya"], 22);
  assert.equal(e.state.phase, "finished");
  const goals = e.state.score[0] + e.state.score[1];
  assert.ok(goals >= 1, "someone scored");
  assert.equal(
    e.state.players.reduce((n, p) => n + p.stats.goals, 0),
    goals,
    "every goal was a shot by a bot",
  );
});

test("the Broomball bot nearest its goal keeps it against a shot flying at it", () => {
  const members: Member[] = ["daniel", "rich", "josh", "tovya"].map((f, i) => ({
    id: "b" + i,
    name: f,
    fighter: f as FighterId,
    team: (i < 2 ? 0 : 1) as 0 | 1,
    ready: true,
    connected: true,
    bot: true,
  }));
  const e = new Engine("broomball", members, random(4));
  const bots = members.map((m, i) => new Bot(m.id, random(4 + i), i));
  for (let i = 0; i < 100; i++) e.step();
  const [keeper, mate, red] = e.state.players;
  keeper.pos = { x: 4, y: 6 };
  mate.pos = { x: 14, y: 14 };
  red.pos = { x: 20, y: 4 };
  // A red shot from midfield, heading for the low post.
  Object.assign(e.state.ball, {
    pos: { x: 15, y: 12 },
    velocity: { x: -13, y: -1.5 },
    state: "flight",
    carrier: null,
    scorer: red.id,
  });
  const lane = () => {
    const b = e.state.ball;
    const t = (1.2 - b.pos.x) / b.velocity.x;
    return b.pos.y + b.velocity.y * t;
  };
  const before = Math.abs(keeper.pos.y - lane());
  for (let i = 0; i < 9 && !e.state.ball.carrier; i++) {
    for (const b of bots) b.update(e);
    e.step();
  }
  assert.ok(
    e.state.ball.carrier === keeper.id || Math.abs(keeper.pos.y - lane()) < before - 1,
    "the keeper moved into the shot's path",
  );
});

test("Fishers of Men bots: Fishers hunt and catch, Fish hide in bushes", () => {
  const fighters = ["daniel", "rich", "samuel", "josh", "elijah", "tovya", "joyce", "miriam"] as FighterId[];
  const members: Member[] = fighters.map((f, i) => ({
    id: "b" + i,
    name: f,
    fighter: f,
    team: 0,
    ready: true,
    connected: true,
    bot: true,
  }));
  const rnd = random(14);
  const e = new Engine("fishing", members, rnd);
  const bots = members.map((m, i) => new Bot(m.id, rnd, i));
  const bushes = MAPS.fishing.bushes;
  const inBush = (p: { pos: { x: number; y: number } }) =>
    bushes.some((b) => p.pos.x >= b.x && p.pos.x <= b.x + b.w && p.pos.y >= b.y && p.pos.y <= b.y + b.h);
  let hid = false;
  while (e.state.phase !== "finished" && e.state.time < 200) {
    for (const b of bots) b.update(e);
    e.step();
    while (e.state.cutscene) e.step();
    hid ||= e.state.players.some((p) => p.alive && p.team === FISH && inBush(p));
  }
  assert.equal(e.state.phase, "finished");
  assert.ok(hid, "a Fish bot hid in a bush");
  assert.ok(
    e.state.players.reduce((n, p) => n + p.stats.catches, 0) >= 2,
    "Fisher bots caught Fish",
  );
});

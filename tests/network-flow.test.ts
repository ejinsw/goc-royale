import { test } from "node:test";
import assert from "node:assert/strict";
import { Room } from "../shared/room";
import type { Command, HostMessage } from "../shared/types";
/** Runs the same protocol used by WebRTC, without requiring third-party signaling in CI. */
class Client {
  messages: HostMessage[] = [];
  id = "";
  token = "";
  constructor(
    public room: Room,
    public name: string,
  ) {}
  connect(token?: string) {
    const session = this.room.join(this.name, token);
    this.id = session.id;
    this.token = session.token;
  }
  send(c: Command) {
    this.room.command(this.id, structuredClone(c));
  }
}
function group(n: number) {
  const clients: Client[] = [];
  const room = new Room("TESTAA", (id, m) => {
    clients.find((c) => c.id === id)?.messages.push(structuredClone(m));
  });
  for (let i = 0; i < n; i++) {
    const c = new Client(room, "Client " + i);
    clients.push(c);
    c.connect();
  }
  return { room, clients };
}
const tick = (r: Room, n = 1) => {
  for (let i = 0; i < n; i++) {
    r.tick();
    if (i % 2 === 0) r.snapshots();
  }
};
test("six-client Broomball protocol launches, replicates input and goals, reconnects, rematches", () => {
  const { room: r, clients: c } = group(6);
  c[0].send({ type: "mode", mode: "broomball" });
  for (const client of c) client.send({ type: "ready", ready: true });
  c[0].send({ type: "start" });
  tick(r, 100);
  assert.equal(r.lobby.phase, "match");
  assert.ok(
    c.every((x) =>
      x.messages.some(
        (m) => m.type === "snapshot" && m.match.phase === "playing",
      ),
    ),
  );
  const game = r.engine!;
  const p = game.playerList[0];
  const x = p.pos.x;
  c[0].send({
    type: "input",
    input: { move: { x: 1, y: 0 }, aim: { x: 1, y: 0 } },
  });
  tick(r, 10);
  assert.ok(p.pos.x > x);
  c[0].send({
    type: "input",
    input: { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 } },
  });
  r.disconnect(c[2].id);
  tick(r, 30);
  const oldId = c[2].id;
  c[2].connect(c[2].token);
  assert.equal(c[2].id, oldId);
  assert.equal(game.playerList[2].connected, true);
  game.state.ball.pos = { x: 33.5, y: 10 };
  game.state.ball.velocity = { x: 16, y: 0 };
  game.state.ball.state = "flight";
  game.state.ball.scorer = c[0].id;
  tick(r, 3);
  assert.deepEqual(game.state.score, [1, 0]);
  tick(r, 100);
  game.state.ball.pos = { x: 33.5, y: 10 };
  game.state.ball.velocity = { x: 16, y: 0 };
  game.state.ball.state = "flight";
  game.state.ball.scorer = c[0].id;
  tick(r, 4);
  assert.equal(r.lobby.phase, "results");
  const finals = c.map((x) =>
    x.messages.filter((m) => m.type === "snapshot").at(-1),
  );
  assert.ok(
    finals.every(
      (m) =>
        m?.type === "snapshot" &&
        m.match.winner === "blue" &&
        m.match.score[0] === 2,
    ),
  );
  c[0].send({ type: "lobby" });
  assert.equal(r.lobby.phase, "lobby");
  for (const client of c) client.send({ type: "ready", ready: true });
  c[0].send({ type: "start" });
  tick(r, 100);
  assert.deepEqual(r.engine!.state.score, [0, 0]);
  assert.equal(r.engine!.state.phase, "playing");
});
test("expired disconnects cannot respawn and are removed from rematch roster", () => {
  const { room: r, clients: c } = group(6);
  c[0].send({ type: "mode", mode: "broomball" });
  c.forEach((p) => p.send({ type: "ready", ready: true }));
  c[0].send({ type: "start" });
  tick(r, 100);
  r.disconnect(c[1].id);
  tick(r, 650);
  assert.equal(r.engine!.playerList[1].alive, false);
  assert.equal(r.sessions.has(c[1].id), false);
  r.engine!.finish("blue");
  tick(r);
  c[0].send({ type: "lobby" });
  assert.equal(r.lobby.members.length, 5);
});
test("new guests cannot enter running matches or full rooms", () => {
  const { room: r, clients: c } = group(8);
  assert.throws(() => r.join("Ninth"), /full/);
  c.forEach((p) => p.send({ type: "ready", ready: true }));
  c[0].send({ type: "start" });
  assert.throws(() => r.join("Late"), /started/);
});
test("public lobby and match data never include private reconnect credentials", () => {
  const { room: r, clients: c } = group(2);
  c.forEach((p) => p.send({ type: "ready", ready: true }));
  c[0].send({ type: "start" });
  tick(r, 110);
  for (const client of c)
    for (const m of client.messages) {
      if (m.type === "welcome") continue;
      assert.equal(JSON.stringify(m).includes(client.token), false);
    }
});
test("guest cannot alter teams, mode, or return everyone to the lobby", () => {
  const { room: r, clients: c } = group(2);
  c[1].send({ type: "mode", mode: "broomball" });
  assert.equal(r.lobby.mode, "showdown");
  c.forEach((p) => p.send({ type: "ready", ready: true }));
  c[0].send({ type: "start" });
  c[1].send({ type: "lobby" });
  assert.equal(r.lobby.phase, "match");
});
test("disconnect grace expiry cannot change finalized results", () => {
  const { room: r, clients: c } = group(2);
  c.forEach((p) => p.send({ type: "ready", ready: true }));
  c[0].send({ type: "start" });
  tick(r, 100);
  r.engine!.finish(c[1].id);
  tick(r);
  const before = structuredClone(r.engine!.playerList[1].stats);
  r.disconnect(c[1].id);
  tick(r, 650);
  assert.deepEqual(r.engine!.playerList[1].stats, before);
  assert.equal(r.engine!.state.winner, c[1].id);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { Room } from "../shared/room";
import { SnapshotDecoder, SnapshotEncoder } from "../shared/delta";
import type { HostMessage, Match } from "../shared/types";

test("two clients receive item ownership, use, and disconnect through snapshots", () => {
  const messages = new Map<string, HostMessage[]>();
  const room = new Room("ITEMS", (id, message) => {
    const list = messages.get(id) ?? [];
    list.push(structuredClone(message));
    messages.set(id, list);
  });
  const host = room.join("Host");
  const guest = room.join("Guest");
  room.command(host.id, { type: "mode", mode: "broomball" });
  for (const client of [host, guest])
    room.command(client.id, { type: "ready", ready: true });
  room.command(host.id, { type: "start" });
  for (let i = 0; i < 100; i++) room.tick();
  const engine = room.engine!;
  const player = engine.playerList.find((p) => p.id === guest.id)!;
  const broom = engine.state.items.find(
    (item) => item.kind === "golden_broom",
  )!;
  broom.pos = { ...player.pos };

  const encoder = new Map(
    [host, guest].map((c) => [c.id, new SnapshotEncoder()]),
  );
  const decoder = new Map(
    [host, guest].map((c) => [c.id, new SnapshotDecoder()]),
  );
  const snapshot = () => {
    room.snapshots();
    return [host, guest].map(({ id }) => {
      const message = messages
        .get(id)!
        .filter((m) => m.type === "snapshot")
        .at(-1)!;
      assert.equal(message.type, "snapshot");
      if (message.type !== "snapshot") throw Error("missing snapshot");
      return decoder
        .get(id)!
        .accept(encoder.get(id)!.encode(message.match)) as Match;
    });
  };
  snapshot(); // establish each client's delta baseline

  const neutral = { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 } };
  room.command(guest.id, {
    type: "input",
    input: { ...neutral, itemPickup: true, seq: 1 },
  });
  // A subsequent neutral input before the simulation tick must not erase a tap.
  room.command(guest.id, { type: "input", input: { ...neutral, seq: 2 } });
  room.tick();
  for (const match of snapshot()) {
    assert.equal(
      match.players.find((p) => p.id === guest.id)?.heldItem,
      broom.id,
    );
    assert.equal(
      match.items.find((item) => item.id === broom.id)?.carrier,
      guest.id,
    );
    assert.equal(
      match.events.filter(
        (e) => e.type === "item_picked_up" && e.owner === guest.id,
      ).length,
      1,
    );
  }

  room.command(guest.id, {
    type: "input",
    input: { ...neutral, itemUse: true, seq: 3 },
  });
  room.tick();
  const used = snapshot();
  for (const match of used) {
    assert.equal(
      match.players.find((p) => p.id === guest.id)?.heldItem,
      broom.id,
    );
    assert.equal(
      match.events.filter((e) => e.type === "item_used" && e.owner === guest.id)
        .length,
      1,
    );
  }
  assert.equal(used[1].ackSeq, 3);

  room.disconnect(guest.id);
  room.join("Guest", guest.token);
  room.tick();
  for (const match of snapshot()) {
    assert.equal(match.players.find((p) => p.id === guest.id)?.heldItem, null);
    assert.equal(
      match.items.find((item) => item.id === broom.id)?.state,
      "ground",
    );
  }
});

test("item events survive modeled latency, retransmission, and a brief outage", () => {
  const scenarios = [
    { rtt: 50, everyLoss: 0, outage: false },
    { rtt: 100, everyLoss: 100, outage: false },
    { rtt: 200, everyLoss: 33, outage: false },
    { rtt: 100, everyLoss: 0, outage: true },
  ];
  for (const scenario of scenarios) {
    let now = 0;
    let guestId = "";
    const outgoing: { at: number; message: HostMessage }[] = [];
    const incoming: {
      at: number;
      action: "itemPickup" | "itemUse" | "itemDrop";
      seq: number;
    }[] = [];
    let downLast = 0;
    let upLast = 0;
    let packet = 0;
    const delivery = (sent: number, last: number) => {
      // Reliable ordered transport: loss delays a packet and everything after it.
      let at = sent + scenario.rtt / 2;
      if (scenario.everyLoss && ++packet % scenario.everyLoss === 0)
        at += scenario.rtt + 20;
      if (scenario.outage && at >= 5400 && sent < 5900)
        at = Math.max(at, 5900 + scenario.rtt / 2);
      return Math.max(last, at);
    };
    const room = new Room("DELAY", (id, message) => {
      if (id !== guestId || message.type !== "snapshot") return;
      downLast = delivery(now, downLast);
      outgoing.push({ at: downLast, message: structuredClone(message) });
    });
    const host = room.join("Host");
    const guest = room.join("Guest");
    guestId = guest.id;
    room.command(host.id, { type: "mode", mode: "broomball" });
    for (const c of [host, guest])
      room.command(c.id, { type: "ready", ready: true });
    room.command(host.id, { type: "start" });
    const engine = room.engine!;
    const player = engine.playerList.find((p) => p.id === guest.id)!;
    const broom = engine.state.items.find(
      (item) => item.kind === "golden_broom",
    )!;
    broom.pos = { ...player.pos };
    const times = new Map<number, "itemPickup" | "itemUse" | "itemDrop">([
      [120, "itemPickup"],
      [165, "itemUse"],
      [225, "itemDrop"],
    ]);
    const seen = new Set<number>();
    const counts = new Map<string, number>();
    let seq = 0;
    for (let tick = 0; tick < 300; tick++) {
      now = (tick * 1000) / 30;
      const action = times.get(tick);
      if (action) {
        upLast = delivery(now, upLast);
        incoming.push({ at: upLast, action, seq: ++seq });
      }
      while (incoming.length && incoming[0].at <= now) {
        const next = incoming.shift()!;
        room.command(guest.id, {
          type: "input",
          input: {
            move: { x: 0, y: 0 },
            aim: { x: 1, y: 0 },
            [next.action]: true,
            seq: next.seq,
          },
        });
      }
      room.tick();
      if (tick % 2 === 0) room.snapshots();
      while (outgoing.length && outgoing[0].at <= now) {
        const message = outgoing.shift()!.message;
        if (message.type !== "snapshot") continue;
        for (const event of message.match.events) {
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          if (event.owner === guest.id)
            counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
        }
      }
    }
    for (const type of ["item_picked_up", "item_used", "item_dropped"])
      assert.equal(counts.get(type), 1, `${JSON.stringify(scenario)}: ${type}`);
    assert.equal(player.heldItem, null);
    assert.equal(broom.state, "ground");
  }
});

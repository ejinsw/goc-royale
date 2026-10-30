import Peer, { type DataConnection } from "peerjs";
import { Room } from "../../shared/room";
import type {
  ClientMessage,
  Command,
  HostMessage,
  Input,
} from "../../shared/types";
import { metrics, payloadBytes } from "./metrics";
import { SnapshotDecoder, SnapshotEncoder } from "../../shared/delta";
export type Listener = (m: HostMessage) => void;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (x) => alphabet[x % alphabet.length],
  ).join("");
const peerId = (code: string) => "goc-pilot-v1-" + code;
export class Network {
  peer: Peer | null = null;
  connection: DataConnection | null = null;
  room: Room | null = null;
  id = "";
  token = "";
  code = "";
  isHost = false;
  timer: ReturnType<typeof setInterval> | null = null;
  peers = new Map<string, DataConnection>();
  stopped = false;
  lastSnapshot = 0;
  lastTick = 0;
  /** Local monotonic input sequence (standard §4.3). */
  inputSeq = 0;
  /** Snapshot broadcast accumulator (ms), decoupled from the sim tick. */
  private snapshotAccrued = 0;
  /** Snapshot send interval: ~18 Hz, independent of the 30 Hz simulation. */
  static readonly snapshotIntervalMs = 1000 / 18;
  /** Guest RTT probe (standard §4.3): outstanding ping send times. */
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private outstandingPings = new Set<number>();
  /** Host: one delta encoder per guest connection (standard §4.2). */
  private encoders = new WeakMap<DataConnection, SnapshotEncoder>();
  /** Guest: decoder for the host's snapshot/delta stream. */
  private decoder = new SnapshotDecoder();
  constructor(
    public onMessage: Listener,
    public onStatus: (s: string) => void,
  ) {}
  async create(name: string) {
    this.isHost = true;
    this.code = randomCode();
    await this.openPeer(peerId(this.code));
    this.room = new Room(this.code, (id, msg) => {
      if (id === this.id || (msg.type === "welcome" && !this.id)) {
        if (msg.type === "welcome") {
          this.id = msg.id;
          this.token = msg.token;
        }
        this.deliver(msg);
      } else {
        const c = this.peers.get(id);
        if (c?.open) {
          let out: HostMessage = msg;
          if (msg.type === "snapshot") {
            let enc = this.encoders.get(c);
            if (!enc) this.encoders.set(c, (enc = new SnapshotEncoder()));
            out = enc.encode(msg.match);
          }
          c.send(out);
          if (metrics.enabled)
            metrics.bytesOut.add(payloadBytes(out), performance.now());
        }
      }
    });
    metrics.reset();
    metrics.role = "host";
    const local = this.room.join(name);
    this.id = local.id;
    this.token = local.token;
    this.peer!.on("connection", (c) => this.accept(c));
    this.lastTick = performance.now();
    this.snapshotAccrued = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      const elapsed = now - this.lastTick;
      if (elapsed > 2000) {
        this.onStatus(
          "Host was paused. The match clock resumes now. Keep this tab active.",
        );
        this.lastTick = now;
        this.snapshotAccrued = 0;
        return;
      }
      let ticked = 0;
      let steps = 0;
      while (now - this.lastTick >= 1000 / 30 && steps++ < 6) {
        this.room?.tick();
        this.lastTick += 1000 / 30;
        ticked++;
      }
      if (ticked) metrics.simTicks.add(ticked, now);
      // Snapshot cadence is independent of the simulation rate (standard §3,
      // §4.2): the sim runs at a fixed 30 Hz but authoritative snapshots are
      // broadcast at ~18 Hz. Immediate action/change feedback is local; remote
      // clients interpolate from a short buffer keyed on sampleTime.
      if (ticked > 0) {
        this.snapshotAccrued += ticked * (1000 / 30);
        if (this.snapshotAccrued >= Network.snapshotIntervalMs) {
          this.room?.snapshots();
          metrics.snapshotsOut.add(1, now);
          // Keep the remainder so cadence does not drift against the sim.
          this.snapshotAccrued %= Network.snapshotIntervalMs;
        }
      }
    }, 8);
    this.onStatus("Hosting • keep this tab open");
    return this.code;
  }
  async join(code: string, name: string, token?: string) {
    this.code = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(this.code))
      throw Error("Enter a six-character room code.");
    await this.openPeer();
    await this.connect(name, token);
    return this.code;
  }
  private openPeer(id?: string) {
    return new Promise<void>((resolve, reject) => {
      const options = {
        debug: 0,
        config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
      };
      // Optional TURN settings must be scoped, temporary public credentials; never put an account API key here.
      const turn = import.meta.env.VITE_TURN_URL;
      if (turn)
        (options.config.iceServers as RTCIceServer[]).push({
          urls: turn,
          username: import.meta.env.VITE_TURN_USERNAME,
          credential: import.meta.env.VITE_TURN_CREDENTIAL,
        });
      this.peer = id ? new Peer(id, options) : new Peer(options);
      const timeout = setTimeout(
        () =>
          reject(
            Error(
              "Could not reach the signaling service. Check your connection and retry.",
            ),
          ),
        15000,
      );
      this.peer.once("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      this.peer.on("error", (e) => {
        clearTimeout(timeout);
        this.onStatus(
          e.type === "peer-unavailable"
            ? "Room unavailable. Ask the host to keep the room open."
            : `Connection: ${e.message}`,
        );
        reject(e);
      });
      this.peer.on("disconnected", () => {
        if (this.stopped) return;
        this.onStatus(
          "Signaling disconnected; existing matches may continue. Reconnecting…",
        );
        this.peer?.reconnect();
      });
    });
  }
  private connect(name: string, token?: string) {
    this.decoder.reset();
    return new Promise<void>((resolve, reject) => {
      const conn = this.peer!.connect(peerId(this.code), {
        reliable: true,
        serialization: "json",
      });
      this.connection = conn;
      let welcomed = false;
      let resyncRequested = false;
      const timeout = setTimeout(() => {
        reject(
          Error(
            "Could not connect to the host. Some networks require TURN relay access. Try another network.",
          ),
        );
        conn.close();
      }, 18000);
      conn.on("open", () => {
        conn.send({ type: "hello", name, token } satisfies ClientMessage);
      });
      conn.on("data", (raw) => {
        const m = raw as HostMessage;
        if (metrics.enabled)
          metrics.bytesIn.add(payloadBytes(raw), performance.now());
        if (m.type === "pong") {
          // Measured here; never forwarded to React.
          if (typeof m.at === "number" && this.outstandingPings.delete(m.at))
            metrics.recordRtt(performance.now() - m.at);
          return;
        }
        if (m.type === "welcome") {
          welcomed = true;
          clearTimeout(timeout);
          this.id = m.id;
          this.token = m.token;
          resolve();
          this.onStatus("Connected to browser host");
          this.startPing();
        }
        if (m.type === "error" && !welcomed) {
          clearTimeout(timeout);
          reject(Error(m.message));
          conn.close();
          return;
        }
        if (m.type === "snapshot" || m.type === "delta") {
          const match = this.decoder.accept(m);
          if (!match) {
            // Baseline lost: ask once for a keyframe and drop deltas until it
            // arrives, so the host does not answer with a burst of keyframes.
            if (!resyncRequested) {
              resyncRequested = true;
              conn.send({ type: "resync" } satisfies ClientMessage);
            }
            return;
          }
          if (m.type === "snapshot") resyncRequested = false;
          this.lastSnapshot = performance.now();
          this.deliver({ type: "snapshot", match });
          return;
        }
        this.deliver(m);
      });
      conn.on("close", () => {
        clearTimeout(timeout);
        if (!welcomed)
          reject(
            Error(
              "The host closed the connection before you could join. Try again.",
            ),
          );
        if (!this.stopped)
          this.onStatus(
            "Host connection lost. Reconnect within 20 seconds to reclaim your fighter.",
          );
      });
      conn.on("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    });
  }
  private accept(conn: DataConnection) {
    let id = "";
    let count = 0,
      epoch = performance.now();
    const timeout = setTimeout(() => {
      if (!id) conn.close();
    }, 10000);
    conn.on("data", (raw) => {
      try {
        if (performance.now() - epoch > 1000) {
          count = 0;
          epoch = performance.now();
        }
        if (++count > 100 || JSON.stringify(raw).length > 4096) {
          conn.close();
          return;
        }
        const m = raw as ClientMessage;
        if (!m || typeof m !== "object") return;
        if (m.type === "hello" && !id) {
          if (
            typeof m.name !== "string" ||
            (m.token !== undefined && typeof m.token !== "string")
          )
            return;
          // Establish routing before welcome is sent; session tokens never appear in lobby snapshots.
          const previous = this.room!.send;
          const queued: HostMessage[] = [];
          this.room!.send = (target, msg) => {
            if (msg.type === "welcome") queued.push(msg);
            else previous(target, msg);
          };
          try {
            const session = this.room!.join(m.name, m.token);
            id = session.id;
            const old = this.peers.get(id);
            this.peers.set(id, conn);
            if (old && old !== conn) old.close();
            for (const msg of queued) conn.send(msg);
          } finally {
            this.room!.send = previous;
          }
          this.room!.broadcastLobby();
          clearTimeout(timeout);
        } else if (id && m.type === "command")
          this.room?.command(id, m.command);
        else if (
          id &&
          m.type === "ping" &&
          typeof m.at === "number" &&
          Number.isFinite(m.at)
        )
          conn.send({ type: "pong", at: m.at } satisfies HostMessage);
        else if (id && m.type === "resync") this.encoders.get(conn)?.reset();
      } catch (e) {
        conn.send({
          type: "error",
          message: e instanceof Error ? e.message : "Invalid message",
        } satisfies HostMessage);
      }
    });
    conn.on("close", () => {
      clearTimeout(timeout);
      if (id && this.peers.get(id) === conn) {
        this.peers.delete(id);
        this.room?.disconnect(id);
      }
    });
  }
  private deliver(m: HostMessage) {
    if (m.type === "snapshot") metrics.snapshotArrived(performance.now());
    this.onMessage(structuredClone(m));
  }
  /** 1 Hz RTT probe over the existing ping/pong messages (guest only). */
  private startPing() {
    if (this.pingTimer) return;
    metrics.reset();
    metrics.role = "guest";
    this.pingTimer = setInterval(() => {
      if (!this.connection?.open) return;
      const now = performance.now();
      for (const at of this.outstandingPings)
        if (now - at > 3000) {
          this.outstandingPings.delete(at);
          metrics.late++;
        }
      this.outstandingPings.add(now);
      metrics.pingsSent++;
      this.connection.send({ type: "ping", at: now } satisfies ClientMessage);
    }, 1000);
  }
  command(command: Command) {
    if (this.isHost) this.room?.command(this.id, command);
    else if (this.connection?.open)
      this.connection.send({
        type: "command",
        command,
      } satisfies ClientMessage);
  }
  input(input: Input) {
    // Stamp a monotonic sequence so the authority can acknowledge it and the
    // local client can replay unacknowledged inputs after a correction. The
    // renderer may supply its own seq (so it can tag its reconciliation
    // buffer with the same value); otherwise assign one here.
    const seq =
      typeof input.seq === "number" ? input.seq : ++this.inputSeq;
    this.command({ type: "input", input: { ...input, seq } });
  }
  async reconnect(name: string) {
    if (this.isHost)
      throw Error("The host cannot reload a live room. Create a new room.");
    if (this.connection?.open) return;
    await this.connect(name, this.token);
  }
  close() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    metrics.role = "menu";
    this.connection?.close();
    this.peer?.destroy();
    this.peers.clear();
  }
}

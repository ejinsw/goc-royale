# GOC Royale

A browser-hosted arena brawler for private groups. React menus, a Three.js 3D arena, TypeScript simulation, and PeerJS/WebRTC data channels. **No application server, Socket.IO, accounts, or database.** Eighteen fighters: the 17 GOC ministry team leaders—the pilot seven (Brandon Kam, Daniel, Rich, Samuel, Josh, Elijah, Ethan Ha) plus Dylan, Isaac, Tovya, Rosalie, Joelle, Susannah, Joyce, Miriam, Jemuel and Russell (see docs/MINISTRY-TEAMS-BRIEF.md)—and David, a Music-team Vocal Controller. Three modes: Showdown FFA (up to 10 players), Broomball (up to 6) and Fishers of Men, an infection mode on Bruin Plaza, a UCLA campus map around Ackerman Union (up to 10; see docs/FISHERS-OF-MEN.md). No mode enforces a minimum player count.

## Run it

Requires Node.js 22+ and internet access for PeerJS signaling and STUN discovery.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (normally http://localhost:5173). Pick a nickname, create a room, and copy the invitation link to another browser. Pick fighters, ready up on every client, and have the host start. The creator must keep their tab open and active. Do not refresh a hosted room: its simulation lives in that tab.

Testing on the same machine: open separate browser tabs, use different nicknames, and join with the code. Multiple tabs are real WebRTC participants, not bots. A desktop host works best. For phones, deploy to HTTPS first: plain HTTP LAN addresses may not provide Web Crypto / WebRTC features consistently.

```sh
npm test          # deterministic gameplay and room tests
npm run typecheck # strict TypeScript check
npm run build     # production static files in dist/
npm run preview   # serve that production build locally
```

## First deployment — static files only

Upload the contents of `dist/` to an HTTPS static host, or connect this repository to Cloudflare Pages with build command `npm run build` and output directory `dist`. A Netlify build configuration is also included. There is no Node process to deploy. Invite links use `?room=ABCDEF` and need no SPA route rewrites. Use the same deployed URL for every participant; a localhost link cannot be used from somebody else's device.

The default network uses the public PeerJS Cloud signaling service and a Google STUN endpoint. Those services help browsers find one another; the browser host runs gameplay. No payment credentials or paid cloud resources are configured by this project. These external services have their own availability and policies. Direct connections can fail on restrictive or carrier networks. Optional TURN settings are documented in `.env.example`; relay service is not included or guaranteed free. The UI reports failed connections instead of pretending a match connected.

### Controls

- Desktop: WASD/arrows move and the mouse aims. Hold left click to preview an attack or Space/right click to preview a Super, then release to fire. Escape opens settings.
- Carrying the Broomball: hold left click to charge; release toward the cursor to pass/shoot. A carrier cannot attack or use a Super.
- Touch: left stick moves. Dragging the right or Super stick previews the ability footprint; release to fire. Short attack taps auto-aim at an enemy in range and line of sight. Right-stick drag length controls ball power.
- Portrait mobile gameplay shows a landscape prompt. Settings include independent music/sound and screen shake.
- Eliminated Showdown participants watch the arena; Next Survivor highlights another surviving fighter. Broomball respawns after three seconds. In Fishers of Men a caught Fish returns at the Bruin Bear as a Fisher after two seconds.

### Room rules

Only the host changes modes, assigns/shuffles teams, and starts matches. Everyone must be connected and ready. Showdown and Fishers of Men hold up to 10 players and Broomball up to 6; there is no minimum, so a host can start with as few as one readied player. Broomball teams may be any split and may repeat fighters (the exactly-3-per-team and no-duplicate rules were removed). Ready states reset on mode/team changes and after returning from results. Run It Back returns everyone to character selection for a rematch. Fishers of Men ignores lobby teams: the host picks the starting Fishers at random.

Guest reconnect identity uses a private random token in sessionStorage, separate from the shareable six-character code. Press Reconnect after a brief lost connection. Guest refresh can rejoin using the code in the current tab, nickname, and saved token. Lobby grace: 30 seconds; match grace: 20 seconds. After grace expires, the fighter is removed from play without a replacement bot. Host departure ends the room; there is no host migration.

## Implementation layout

- `shared/definitions.ts`: fighters and their abilities as data, balance values, map geometry, math.
- `shared/types.ts`: public room, match, and message schemas.
- `shared/engine.ts`: authority over movement, collision, damage, abilities, hazards, ball physics, scoring, results.
- `shared/room.ts`: lobby validation, membership, reconnect sessions, match lifecycle.
- `client/src/network.ts`: PeerJS transport, host fixed-timestep loop, message routing, limits, snapshots.
- `client/src/game.ts`: match controller: desktop input, send cadence, local prediction, predicted cues, event dedupe.
- `client/src/arena/`: the 3D arena renderer (camera, map art, fighter rigs and animation graph, pooled effects and labels).
- `client/src/main.tsx`: React menus, HUD, results, settings, multi-pointer touch sticks.
- `client/public/art/`: shared SVG roster art for the fighter picker and results.
- `tests/engine.test.ts`: gameplay and room transition regression tests.
- `docs/PILOT-SPEC.txt`: supplied design document, renamed GOC Royale and amended for the chosen hosting model.
- `docs/STATUS.md`: verified behavior and remaining release work.

The host simulates 30 fixed ticks/second and broadcasts snapshots at about 18 Hz, independent of the tick. Guests send bounded movement/aim/action inputs stamped with a monotonic sequence number and the client time each input began. The host applies movement from that timeline for the time each input was held, at real-time speed, extrapolating at most 60 ms past the newest input and catching up at up to 2x for at most 0.25 s after a stall. Aim, attacks, and Supers still apply on the next tick after arrival. Each snapshot carries the authoritative sample time, the last acknowledged sequence, and how far along the viewer's timeline movement has been applied. Guests cannot supply damage, HP, ball ownership, or scores. Projectiles and the ball use small swept substeps to avoid tunneling. The renderer predicts local movement immediately, reconciles on each snapshot by replaying its own input timeline from the acknowledged point, and blends any correction out over about 100 ms. Remote fighters ease toward the latest snapshot. Snapshots are quantized (positions to 0.01 units) and delta-encoded against the previous snapshot on each connection, with a full keyframe every 10 seconds and on request after a gap.

Development overlay: press the backtick key during play (or open the app with `?debug`) to show frame time, RTT, jitter, late pings, snapshot rate and stale age, correction error, and bandwidth. `npm run netsim` runs the scripted controlled-network harness for the 50/100/200 ms RTT, loss, and 500 ms outage cases.

## Design and character production

- [Shared character pipeline](docs/CHARACTER_3D_PIPELINE.md): the same production and verification requirements for every fighter.
- [Art and audio direction](docs/ART-AND-AUDIO-DIRECTION.md): painterly anime-inspired chibi style, individual palettes, effects, UI and sound.
- [Deprecated Brandon 3D redaction notice](docs/BRANDON-3D-REDACTED.md): scope and handling of the retired 3D studies.
- [Performance and gameplay standards](docs/PERFORMANCE-AND-GAMEPLAY-STANDARDS.md): mandatory runtime limits and acceptance gates.

Matches render in 3D (see [the integration brief](docs/ARENA-3D-INTEGRATION-BRIEF.md)). All 19 fighters, including Brandon and David, use the shared procedural `LOOKS` model system. The retired Brandon GLB studies are [redacted and deprecated](docs/BRANDON-3D-REDACTED.md); the live game does not load them. Production character assets remain planned work, and the arena has not been profiled on physical phones.

## Trust and scope

Host authority is appropriate for a private, trusted friend group: the host can alter their own browser, see hidden state, and cheat. A browser-only build cannot provide independent anti-cheat. Private room codes are invitations, not authentication or confidentiality guarantees. WebRTC data channels are encrypted in transit; peers may learn one another's network addresses through ICE. No analytics, microphone, or camera are used.

There is no public matchmaking, progression, or gadgets. Fishers of Men is the one mode added beyond the pilot specification, by user decision. The placeholders and synthesized music/effects are original; fonts are self-hosted via Fontsource with included font licenses. See `docs/STATUS.md` before calling this a completed pilot release.

Latest roster update: David uses Mixed Voice (500 damage, plus 400 for its narrow center) and Side Eye (a 0.4-second warning followed by 750 damage, a collision-safe sideways shove, and a one-second 25% slow). Ethan uses Rizz (two 420-damage notes) and Aura Pulse (instant knockout of enemies within 4 units, blocked by walls and spawn protection). Brandon's live procedural model uses a beige jacket with unchanged mechanics; his retired standalone 3D studies are redacted. The camera keeps your fighter centered at 1.65× arena-fit scale, or follows a living selected survivor while you are out. Settings includes a player-triggered full-screen mode; installed iPhone home-screen apps provide the cleanest browser-free view. Movement changes and actions send on the next rendered frame; steady inputs remain 30 Hz. Actual Internet delay is not eliminated. (Networking was since reworked; see the paragraph above and docs/STATUS.md.)

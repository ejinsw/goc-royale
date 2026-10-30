# Graph Report - .  (2026-10-29)

## Corpus Check
- Large corpus: 163 files · ~1,418,483 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 128 nodes · 388 edges · 7 communities (6 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Combat Simulation|Combat Simulation]]
- [[_COMMUNITY_Shared Match State|Shared Match State]]
- [[_COMMUNITY_Client UI and Feedback|Client UI and Feedback]]
- [[_COMMUNITY_Peer Networking|Peer Networking]]
- [[_COMMUNITY_Arena Rendering and Input|Arena Rendering and Input]]
- [[_COMMUNITY_Geometry and Game Rules|Geometry and Game Rules]]
- [[_COMMUNITY_Room Lifecycle|Room Lifecycle]]

## God Nodes (most connected - your core abstractions)
1. `Engine` - 29 edges
2. `Vec` - 24 edges
3. `Player` - 15 edges
4. `ArenaScene` - 14 edges
5. `Network` - 14 edges
6. `mul()` - 14 edges
7. `Room` - 14 edges
8. `distance()` - 12 edges
9. `clamp()` - 12 edges
10. `add()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `ArenaScene` --references--> `Vec`  [EXTRACTED]
  client/src/game.ts → shared/definitions.ts
- `Network` --references--> `Room`  [EXTRACTED]
  client/src/network.ts → shared/room.ts
- `GameBridge` --references--> `Input`  [EXTRACTED]
  client/src/game.ts → shared/types.ts
- `GameBridge` --references--> `Match`  [EXTRACTED]
  client/src/game.ts → shared/types.ts
- `FighterCard()` --calls--> `fighterArt()`  [EXTRACTED]
  client/src/main.tsx → client/src/art.ts

## Import Cycles
- None detected.

## Communities (7 total, 1 thin omitted)

### Community 0 - "Combat Simulation"
Cohesion: 0.30
Nodes (4): clamp(), mul(), Engine, Player

### Community 1 - "Shared Match State"
Cohesion: 0.18
Nodes (18): GameBridge, FighterId, Mode, Vec, Wall, Dash, History, Pending (+10 more)

### Community 2 - "Client UI and Feedback"
Cohesion: 0.16
Nodes (12): fighterArt(), hasPortraitArt(), preferences, setMusic(), sound(), unlockAudio(), App(), FighterCard() (+4 more)

### Community 3 - "Peer Networking"
Cohesion: 0.15
Nodes (7): Listener, Network, peerId(), randomCode(), ClientMessage, Command, HostMessage

### Community 4 - "Arena Rendering and Input"
Cohesion: 0.23
Nodes (3): ArenaScene, col(), length2()

### Community 5 - "Geometry and Game Rules"
Cohesion: 0.28
Nodes (10): add(), Arena, distance(), Fighter, finiteVec(), length(), RULES, segmentDistance() (+2 more)

## Knowledge Gaps
- **5 isolated node(s):** `Listener`, `Fighter`, `Arena`, `Session`, `Stats`
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Vec` connect `Shared Match State` to `Combat Simulation`, `Client UI and Feedback`, `Arena Rendering and Input`, `Geometry and Game Rules`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Why does `Engine` connect `Combat Simulation` to `Shared Match State`, `Geometry and Game Rules`, `Room Lifecycle`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `Network` connect `Peer Networking` to `Client UI and Feedback`, `Room Lifecycle`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **What connects `Listener`, `Fighter`, `Arena` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
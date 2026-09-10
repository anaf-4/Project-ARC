# Phase 3: Server-Authoritative Multiplayer — Design

Status: approved by user, pending implementation plan
Date: 2026-09-10

## Goals

- 2-4 player co-op, playable across different PCs over the internet.
- The server is authoritative for the multiplayer simulation: movement
  resolution, enemy AI, collision, damage, drops, and the spawn director all
  run on the server. Clients send input and render server-sent state.
- Solo play stays exactly as it is today (Phase 1/2): fully local, fully
  offline, zero server dependency. Multiplayer is an additional mode, not a
  replacement.
- Reuse the existing `src/game/*`, `src/core/*`, `src/data/*` simulation
  modules on the server via Node + Colyseus, rather than writing a parallel
  server-side reimplementation. Solo and co-op must share one source of
  truth for game balance/behavior, since both are meant to ship together.
- Hosted on Render (user's choice), reachable over the public internet
  (not LAN-only).

## Non-goals (this phase)

- Anti-cheat beyond "the server computes the truth." No replay validation,
  no advanced rate limiting.
- Reconnect/resume mid-run. A disconnected player is removed from the room;
  v1 does not support rejoining an in-progress run.
- Public matchmaking/lobbies. Private room codes only (GDD 4.3).
- Host migration. Not applicable — the server itself is the authority, so
  no single player's client being present/absent affects room state.

## Key refactor: state ownership becomes per-room

Today `G` is a single module-level `let G` in `src/game/state.js`, and the
entity pools (`core/pool.js`) and spatial hash (`core/spatialHash.js`) are
also module-level singletons. That's correct for one browser tab running
one game. A Colyseus server process hosts multiple concurrent rooms (one
per co-op party), so simulation state must become a **per-room instance**,
not a module-level global.

Chosen approach: refactor `state.js` / `pool.js` / `spatialHash.js` into
factory functions that return an instance bundle (`createSimulation()` →
`{ G, pools, grid, query, nearest, ... }`), and thread that instance through
every function in `combat.js`, `weapons.js`, `director.js`, `systems.js`,
`growth.js` that currently imports `G` directly as a module singleton.

This was chosen over duplicating simulation logic into a separate
server-only copy, because:
- Every relevant function already takes explicit arguments like `p`
  (player) or `e` (entity) — only `G`, the pools, and the grid are implicit
  singletons. Converting those three to an explicit `sim` context is
  mechanical, not a logic rewrite.
- Duplicating logic risks solo/co-op behavior drift over time, which
  matters for a game planned for a real release.

This refactor is its own checkpoint, done and verified (solo playtest
repeated, must behave identically to Phase 1/2) before any networking code
is written.

### DOM decoupling

`growth.js`, `director.js`, and `systems.js` currently call `banner()`
(`ui/banner.js`, a DOM toast) directly. The server has no DOM. These calls
become a callback on the `sim` context (`sim.onBanner?.(text, kind)`):
solo mode wires it to the real `banner()`; the server passes nothing
(no-op) and instead includes any relevant info in the networked state
(e.g. a `announcements` field) if a specific event needs to reach clients.

## Directory layout

```
server/
  index.js            Colyseus server entrypoint (Express + colyseus, registers GameRoom)
  rooms/GameRoom.js    onCreate, onJoin, onLeave, fixed-tick server loop
  schema/              @colyseus/schema classes: PlayerState, EnemyState,
                       ProjectileState, DropState, RoomState
src/net/               Colyseus.js client: connect, state subscription, input send
```

## Networking

- `@colyseus/schema` state tree: `RoomState { players: MapSchema<PlayerState>,
  enemies: MapSchema<EnemyState>, projectiles: MapSchema<ProjectileState>,
  drops: MapSchema<DropState>, time, kills, bossId, ... }` — minimal fields
  needed for rendering, not full internal simulation objects.
- Interest management: enemies/projectiles are filtered per player to
  those within `query(player.x, player.y, VIEW_RADIUS)` (reusing the
  existing spatial hash), matching GDD 4.3's stated bandwidth design.
- Tick rate: server simulation runs at a fixed 20Hz, decoupled from each
  client's own render rate. Clients render at their own rAF rate and
  interpolate between the last two received snapshots (~100ms buffer) for
  smooth motion.
- Client → server messages: normalized movement vector `{dx, dy}` on
  change, plus discrete action messages (level-up choice, reroll).
- Pause: opening the pause/build-recipe view in multiplayer is local-only
  UI (does not pause the shared server simulation) — pausing a shared
  co-op run for everyone because one player alt-tabbed doesn't make sense.
  This is a deliberate deviation from the solo pause behavior; flagged
  here rather than left implicit.

## Client-side changes

- `src/net/` — Colyseus.js client wrapper.
- `ui/lobby.js` gains a multiplayer entry point (create/join room by code)
  alongside the existing solo "출격" flow.
- `render/render.js` currently reads directly from `core/pool.js`'s
  singleton pools. Multiplayer adds a thin "network snapshot → pool-shaped
  view" adapter so the same draw functions run unmodified over either the
  local simulation pools (solo) or network-driven shadow pools
  (multiplayer) — avoids a second renderer.

## Deployment

- `server/` is its own small Node service deployed to Render (Web Service,
  Node runtime, `colyseus` + `express` dependencies, start command
  `node server/index.js`).
- The client's multiplayer connection points at the Render service's
  public `wss://` URL.
- Render's free tier spins a web service down after inactivity and
  cold-starts on the next request (10-50s delay). Acceptable for a
  prototype; flagged here so it isn't a surprise later.

## Testing/verification plan

1. **Solo regression** — after the state-ownership refactor, repeat the
   Phase 1 manual playtest (lobby → run → level-up → pause → result) to
   confirm no behavior change before any networking code exists.
2. **Local multiplayer** — run the Colyseus server locally
   (`npm run server:dev`), connect two browser tabs as a stand-in for two
   different PCs, verify synced player/enemy state and interest-radius
   filtering.
3. **Cross-machine** — deploy to Render, connect from two actual separate
   machines over the internet, verify the full co-op loop (join by code,
   fight, one player dies and gets revived, boss fight, result screen).

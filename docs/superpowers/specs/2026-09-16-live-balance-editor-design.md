# Live Balance Editor — Design

Status: approved by user, pending implementation plan
Date: 2026-09-16

## Goals

- A hidden, developer-only in-game editor for tuning numeric balance values
  (weapon per-level stats, enemy stats, boss stats, character base stats)
  without editing code and rebuilding.
- Editing locally previews instantly in the developer's own running session
  (solo or multiplayer), for fast iteration while tuning.
- A "동기화" (sync) action pushes the edited values to a place both the
  live multiplayer server AND solo clients (exe/apk, no server dependency
  today) pick up — so a balance tweak reaches players without a new
  release, matching the user's explicit ask ("동기화 누르면 실제 배포된
  게임에도 적용").
- Gated by a single shared password on the sync action specifically (not
  on opening/using the editor locally, which is harmless).
- Durable across server redeploys: the synced values must survive Render
  restarting/redeploying the multiplayer server process, without adding a
  database. Chosen mechanism: commit the synced JSON to a dedicated branch
  of the existing public GitHub repo.

## Non-goals (this round)

- Editing passives, permanent META upgrades, or the difficulty/spawn-rate
  curve. Those are currently implemented as JS closures
  (`apply: (s, l) => { s.x += k * l }`) or magic numbers inside
  `director.js`'s formulas, not plain data — making them editable would
  require first refactoring them into a data-driven shape. Flagged as
  explicit future work, not attempted here.
- Multi-admin accounts, audit logging beyond git history, or fine-grained
  per-field permissions. One shared password is the only access control.
- Retroactively re-applying edited character/enemy base stats to entities
  that already exist in an in-progress run (see Known limitations below).
- Any UI for players — this is exclusively a developer tool.

## Data flow

```
tables.js defaults (baked into the client/server bundle at build time)
        │
        ▼
applyLiveOverrides(overrides)  ── mutates WEAPONS/ETYPES/BOSSES/CLASSES
        │                          objects IN PLACE (same references
        │                          every existing consumer already holds)
        │
        ├── server boot: overrides fetched from the `live-config` branch's
        │   raw GitHub content (public repo, no auth needed to read)
        │
        ├── solo client boot: overrides fetched via GET /config from the
        │   multiplayer server's HTTP endpoint (best-effort, short
        │   timeout); on success, cached to localStorage; on failure,
        │   falls back to the last cached copy, else pure defaults
        │
        └── editor "동기화" button: POSTs the edited overrides to
            POST /config (with the shared password header) → server
            applies them in-memory immediately AND commits them to the
            `live-config` branch for durability
```

Because `applyLiveOverrides` mutates the *same* `WEAPONS`/`ETYPES`/
`BOSSES`/`CLASSES` objects that `weapons.js`, `director.js`, `render.js`,
`GameRoom.js`, etc. already import and read from directly, none of those
consumers need to change — they see new values automatically once the
override is applied, the same way they'd see a hand-edited `tables.js`.

## Components

### `src/data/liveConfig.js` (new, shared client+server code)

- `applyLiveOverrides(overrides)`: given a plain object shaped like
  `{ weapons: { [id]: { lv: [{...partial}], evoS: {...partial}, altEvos: [...] } }, enemies: { [tid]: {...partial} }, bosses: [{...partial}], classes: { [id]: {...partial} } }`,
  deep-merges each present field onto the matching live object in
  `tables.js`, skipping any id/field it doesn't recognize (defensive
  against typos or stale overrides referencing a since-renamed field).
- `getEditableSchema()`: returns the current live values in the same
  shape, annotated with each field's id/label, for the editor UI to render
  inputs from without hardcoding a duplicate list of field names in the
  UI layer.
- Both functions are pure/synchronous and framework-free, so they're
  usable from server code (no `window`/DOM) and from the browser client
  alike — same constraint this codebase already applies to `combat.js`/
  `systems.js`.

### Server (`server/index.js` + new `server/liveConfigStore.js`)

- On boot: `fetch('https://raw.githubusercontent.com/anaf-4/Project-ARC/live-config/live-config.json')`,
  parse, `applyLiveOverrides(json)`. A missing branch/file (first run
  ever) or a network error is not fatal — falls through to pure
  `tables.js` defaults, logged but not thrown.
- `GET /config` → returns the current in-memory overrides object as JSON
  (whatever was last applied, whether from GitHub at boot or a later
  sync) — no auth, this is a read of already-public balance numbers.
- `POST /config` → requires header `x-editor-password` to match the
  `EDITOR_PASSWORD` environment variable (new Render env var). On match:
  validates the body shape (only known weapon/enemy/boss/class ids and
  fields — see Error handling), applies it via `applyLiveOverrides`
  immediately (already-running rooms' *newly spawned* entities pick it up
  on their very next tick, see Known limitations), then commits the same
  JSON to `live-config.json` on the `live-config` branch via GitHub's
  Contents API (`GET` for the current file `sha`, then `PUT` to update),
  using a `GITHUB_TOKEN` env var (new, a fine-grained PAT scoped to
  Contents:write on this one repo). On password mismatch: `401`, no
  state change, no commit attempt.
- The `live-config` branch is dedicated and separate from whatever branch
  Render is configured to auto-deploy from, specifically so a sync commit
  can never accidentally trigger a real server redeploy (which would be
  slow and would disconnect any active multiplayer rooms) — it's purely a
  storage location the server reads from at boot and writes to on sync.

### Client boot (`src/main.js`)

- After `loadSettings()`, a best-effort, short-timeout
  `fetch(HTTP_SERVER_URL + '/config')` (derived from the existing
  `SERVER_URL` websocket URL by swapping the scheme, same value already
  used for multiplayer connect). On success: `applyLiveOverrides(json)`
  and cache the raw JSON to `localStorage` under a new key. On failure
  (offline, server down): read the cached copy if one exists and apply
  that instead; if there's no cache either, silently keep pure defaults.
  This all happens before `startDemo(sim)` so the very first (even demo)
  game state already reflects the latest known balance.

### Editor UI (`src/ui/editor.js` + a new `#editor` modal in `index.html`)

- Opened by a hidden shortcut, `Ctrl+Shift+E` (checked for collisions:
  not used by any existing keybind or browser-reserved combo in this
  app), wired in `input.js` the same way `F2`/`F3` are today — works from
  the main menu or mid-run, solo or multiplayer.
- Renders one row per editable field, grouped into four collapsible
  sections (무기, 몹, 보스, 캐릭터), sourced from `getEditableSchema()` so
  adding a new field to `tables.js` later doesn't require a matching UI
  change.
- Every input is a plain `<input type="number">`; on `input`, immediately
  calls `applyLiveOverrides()` with just that one field changed, for
  instant local preview — no separate "apply" step for local testing.
- A "동기화" button prompts for the password (a plain
  `<input type="password">` in the same modal, not a browser `prompt()`,
  to fit the existing modal styling) and `POST`s the full current
  override set. Shows a success/failure banner (reusing the existing
  `ui/banner.js` helper) based on the response status.
- A "초기화" button clears all local overrides back to pure `tables.js`
  defaults (does not touch the server/GitHub state — a separate,
  explicit action, not implemented in this round, would be needed to
  "un-sync" a bad value; reverting a bad sync means editing the values
  back and syncing again, same as fixing a bad manual balance commit
  today).

## Error handling

- Server boot fetch failure → defaults, logged, non-fatal (matches the
  existing pattern of every other best-effort network call in this
  codebase, e.g. the client's multiplayer connect attempt).
- `POST /config` body validation: reject (400) any top-level key other
  than `weapons`/`enemies`/`bosses`/`classes`, and within each, any id not
  currently present in that table. This stops a stale or hand-crafted
  payload from injecting an unrecognized field that `applyLiveOverrides`
  would otherwise silently merge in and nothing downstream would ever
  read — fails loudly instead of quietly doing nothing.
- Wrong password → 401, no partial application, no commit.
- GitHub commit failure (rate limit, network) after a successful
  in-memory apply → the sync still "worked" for the live server's current
  process (players see the new values immediately), but the failure is
  surfaced in the editor's banner as a durability warning ("적용은 됐지만
  GitHub 저장 실패 — 서버 재시작 시 사라질 수 있음") rather than silently
  losing durability without telling the developer.

## Known limitations (communicated to the user up front)

- Entities that already exist when a sync/local-edit happens don't
  retroactively update: an enemy's `hp`/`dmg` are copied from `ETYPES`
  once at spawn time (`director.js`'s `spawnEnemy`), and a player's
  derived stats (`p.s`) are computed once by `recompute()` whenever their
  build changes, not re-read from `CLASSES` continuously. New edits apply
  to newly spawned enemies and newly started runs; testing a character
  base-stat change means starting a fresh run.
- If Render's plan doesn't persist local process state across a redeploy,
  that's fine here specifically because durability comes from the GitHub
  commit, not the server's disk — a fresh boot re-fetches the last synced
  values from the `live-config` branch regardless of how many times the
  server has restarted.

## Prerequisites / local dev behavior

- Two new secrets the user must create and set as Render environment
  variables on the deployed server (this implementation cannot create
  them): `EDITOR_PASSWORD` (any string they choose) and `GITHUB_TOKEN` (a
  GitHub fine-grained personal access token scoped to Contents:write on
  `anaf-4/Project-ARC` only). Until both are set, syncing from the real
  deployed editor won't work — implementation and local testing don't
  depend on having the real values.
- Running `server/index.js` locally without either env var set must not
  crash: `POST /config` with no `EDITOR_PASSWORD` configured always
  responds 401 (fail closed, never fail open), and a sync with no
  `GITHUB_TOKEN` configured still applies in-memory but skips the commit
  step, surfacing the same "durability warning" banner path already
  defined above for a failed commit — one code path handles both "GitHub
  rejected the commit" and "GitHub isn't configured at all".

## Testing

- `node --test` coverage for `applyLiveOverrides()`: merges known fields,
  ignores unknown ids/fields, doesn't touch fields not present in the
  override object, and is idempotent (applying the same override twice
  produces the same result) — pure-function unit tests fit this repo's
  existing `node --test` style (no server or DOM needed).
- A local round-trip test of the server's `/config` routes (boot with no
  `live-config` branch yet → defaults; POST with correct/incorrect
  password; GET reflects the POSTed value) using Node's built-in
  `fetch`/`http`, same style as the existing `server/rooms/*.test.js`.
- Manual CDP-driven verification (this project's established pattern for
  UI/bugfix verification) of the editor modal: opens on the shortcut,
  edits reflect immediately in a local run, sync button round-trips
  against a locally-run server instance (not the real production Render
  service, to avoid polluting the real `live-config` branch during
  testing).

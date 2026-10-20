# Shared Lists

A local-first mobile app for shared lists. **Every phone keeps its own
database.** Lists, items and the full edit history live on the device in
SQLite, so the app opens instantly and works with no signal at all. Phones
only trade small patches to stay in step, and edits merge automatically —
two people editing the same item at the same time never overwrite each
other.

Built with Expo (React Native) + expo-sqlite. One codebase for iOS and
Android.

## How sync works

Nothing about your data is stored centrally. Each phone keeps a local
**op log** — every tap becomes one small immutable patch:

```
{ id: "…", kind: "item.set", itemId: "…", patch: { done: { v: true, u: [timestamp, deviceId] } } }
```

Patches merge **per field** with last-write-wins ordered by
`(timestamp, deviceId)`. Because each field is merged independently,
checking an item's box on one phone while another phone renames it results
in both changes surviving — and because the order is total, every device
lands on the same final state no matter what order patches arrive in.

Two transports carry the patches. Both are just pipes; the app picks one
and you can switch in Settings:

| | **Supabase** (default when configured) | **Local relay** |
|---|---|---|
| Reaches phones | Anywhere, over the internet | Only on the same network |
| Works when the other phone is offline | ✅ catches up from the op log | ❌ both must be online together |
| Online storage used | Append-only op log only — no list contents are queried or rendered from it | None whatsoever |
| Setup | One-time migration + anon key | `node server/relay.mjs` |

In both modes the phone's SQLite remains the source of truth for what you
see. Supabase's table is only an **append-only buffer** that makes "one
update reaches every phone" true even when the others are offline at that
moment; it is never the app's database.

The relay ([server/relay.mjs](server/relay.mjs)) is a ~100-line WebSocket
pipe that stores nothing. It exists so the app can sync with **zero online
services** — useful on a locked-down or air-gapped network.

## Run it

```bash
npm install

# 1. the sync backbone (any machine everyone can reach)
npm run relay          # ws://localhost:8787 — no storage

# 2. the app
npx expo start         # scan the QR with Expo Go
npx expo start --web   # or open in a browser
```

To try the two-phone behaviour without two devices, open the web app in
**two different browser tabs** — each tab has isolated storage, so they act
as two separate phones. Create a list in one, then join it in the other
using its code.

Tests cover the whole sync model, including a real two-device run against
the actual relay process:

```bash
npm test
```

### On a real phone

The relay has to be reachable from the phone's network. Run it on a
computer on the same Wi-Fi and set the relay address in the app's Settings
to that computer's LAN IP, e.g. `ws://192.168.1.20:8787`.

## Using Supabase

The project URL and anon key go in `.env` (copy `.env.example`), which is
gitignored. Both values are **safe to ship inside the app bundle** — the URL
identifies the project and the anon key is a public, RLS-scoped JWT by
design.

```bash
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Then run [supabase/migration.sql](supabase/migration.sql) once in the
Supabase SQL Editor (Dashboard → SQL Editor → New query). It creates the
`ops` table, two indexes and the RLS policies.

The anon key in `.env` is compiled into the app, so keep the **`postgres`
password and the `service_role` key out of the bundle, out of `.env`, and
out of version control.** Those are server-only secrets. If a key ever lands
in chat or in a commit, rotate it from the dashboard.

### Security model

Lists are gated only by their share code. That is a reasonable trade for an
app with no sign-in, but it means **anyone holding the anon key could read
or write any list** — so treat the anon key as semi-private and the share
code as an invite. To harden it later, add Supabase Auth and scope the two
RLS policies with `auth.uid()` plus a membership table; the app's sync code
does not need to change.

## Project layout

```
server/relay.mjs              storage-free WebSocket relay (optional mode)
supabase/migration.sql        ops table + indexes + RLS
src/sync/
  engine.ts                   local-first pipeline, transport-agnostic
  transport.ts                the pipe interface both backends implement
  relay-transport.ts          WebSocket relay backend
  supabase-transport.ts       Postgres op log + Realtime backend
  merge.ts                    pure per-field last-write-wins merge
  ops.ts, code.ts             op builders, share-code helpers
  config.ts                   picks the transport, env + stored overrides
  context.tsx                 React provider + hooks
src/storage/
  sqlite.ts                   the phone's local database (native)
  web.ts                      per-tab sessionStorage (web dev/testing only)
tests/                        merge, transport, and two-device relay e2e
```

The merge logic is pure and the engine is transport-agnostic, so the sync
model is tested without a network, and the relay end-to-end suite runs two
independent engines against the real relay process.

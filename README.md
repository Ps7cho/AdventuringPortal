# Mosswood Public Client Template

For this local setup, see [LOCAL-SETUP.md](LOCAL-SETUP.md).

Affliction abilities use the same encounter action endpoint as other abilities.
Send only the equipped ability ID and legal target IDs; the server owns all stack
interactions and damage. Authenticated `/api/afflictions` and
`/api/afflictions/grammar` expose the catalog and instruction schema. Combat
snapshots include status stacks, amplification, preservation, and combat resources;
the existing WebSocket delivers their updates. Resources such as Zeal are not
inventory rewards. Equip new abilities before starting a new encounter.

A standalone HTML/CSS/JavaScript reference client for the game server. No build
step, backend source, database connection, service key, or bundled account is needed.
Only this folder is intended for public hosting or distribution.

`lobby.js` provides the character workspace using the existing API client. Include
it alongside the other JavaScript files when publishing this folder. Character is
the single place to create and select an adventurer; Quests opens the route lobby.
No additional configuration or keys are needed.

## Configure and Run

The Expeditions bulletin lists recovery contracts from full-party defeats. Inspect
a contract to see the fallen names, ranks and abilities; accepting uses
`POST /api/contracts/{id}/accept`. Contract changes arrive in village WebSocket
snapshots. Recovered souls are returned in character inventory with `type: soul`
and the saved `fallen` profile; no soul-use action is exposed yet.

Set `apiBaseUrl` in `config.js` to the server's public API URL, including `/api`.
This copy uses `https://pythonapi-onvq.onrender.com/api`.

Serve this folder as the web root, for example:

```sh
cd "D:\Game Assets\Builds\PythonAPI\FrontEndJS"
python -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173`. Register your own username/password or log in with an
existing account. Direct `file://` opening is not supported. On a static host, set
the publish directory to `FrontEndJS` (or `.` when this folder is its own repository). No SPA fallback or server rewrites are
needed: character pages use `adventurer.html?id=<UUID>`. Relative links also work
when this folder is hosted below a subdirectory.

For production, use HTTPS for both the site and API. Configure the backend's
`PUBLIC_CLIENT_ORIGINS` with the exact frontend origin, e.g.
`["https://play.example.com"]`. This is a server setting, not a second client
setting. The API URL is public; Neon credentials and all privileged configuration
remain on the server. Never host the parent backend directory.

## API Pattern

`api.js` is the only network boundary. Pages send player intent and render the
server's result; they do not calculate authoritative damage, rewards, or progression.

```js
// Credentials come from the player's login form, never from config.js.
await GameApi.request('/auth/login', { username, password });
const heroes = await GameApi.request('/adventurers');
const hero = await GameApi.request('/adventurers/' + heroes[0].id);
const fight = await GameApi.request('/encounters', {
  adventurer_ids: [hero.id], enemy_slug: 'goblin', encounter_count: 1
});
const updated = await GameApi.request('/encounters/' + fight.id + '/actions', {
  actor_id: hero.id, expected_turn: fight.turn,
  ability_id: hero.equipped_ability_ids[0]
});
await GameApi.request('/auth/logout', {});
```

Requests with a body use POST; requests without one use GET. The helper handles
JSON, bearer headers, empty 204 responses, validation errors, expired sessions,
and a 20-second timeout. It never automatically retries state-changing requests.
After a timeout or stale-turn response, refresh the encounter before acting again.

## Playing Together

Open a quest, epic, raid, or recovery contract to enter its quest lobby. The leader
can create a party and copy an invite code; the other player joins from the same
lobby flow. Both characters appear in the roster with presence and readiness.
The leader proposes the displayed quest, then each player selects Ready Up for their
own character. Changing the selection or risk acceptance clears all readiness.
The village socket pushes roster and selection changes automatically. There is
no party polling loop. Refresh Party remains an optional manual recovery control.

Once everyone is ready, the leader departs from the quest lobby.
Departure includes the entire party. Other members see Resume Adventure appear
and can open the same encounter. Only the owner can submit their character's actions.

Leaders propose with `POST /parties/{id}/selection`, using `enemy_slug` and
`encounter_count` (1 or 3), or `template_slug`. `accept_rank_risk` is part of the
shared selection. The response includes `selection` and `selection_revision`.
Clients set readiness with `POST /parties/{id}/ready` and a JSON body containing
`adventurer_id`, `ready`, and the displayed `selection_revision`. Leaders depart
with `POST /parties/{id}/encounters` and that revision. Stale revisions are rejected;
departure uses only the stored selection. `GET /parties` returns these fields,
member readiness, `all_ready`, and the shared `active_encounter_id`.

## Live Combat

Village and character pages subscribe to `/village/live` through `GameLive.village`.
The server sends an initial `village` message and updated snapshots after committed
changes. Each payload contains only the authenticated account, its adventurers,
and parties containing those adventurers. Character pages optionally request their
owned `adventurer_id` and receive full stats, inventory, equipment and loadout data.
Unfinished loadout and weapon choices are retained while unrelated changes arrive.
Read-only requests and rolled-back changes do not generate broadcasts. Reconnection
resends current state; no repeating HTTP requests are needed to stay synchronized.

`GameLive` in `ui.js` connects to the WebSocket path derived from the same configured
API base URL. It sends the player's runtime token in the first frame, never in
the URL. The server pushes committed encounter snapshots to all participants,
including turn changes and the next encounter. No combat-state polling is needed.
The client reconnects with backoff, receives the latest snapshot, and ignores
older revisions. Heartbeats keep the connection healthy but never advance combat.
Actions still use `GameApi.request`; clients must not automatically replay them.

## Authentication

There is no shared client key. Login returns a short-lived, player-specific bearer
token at runtime. The helper stores it in tab-scoped `sessionStorage` to allow
navigation/reload, clears it on logout/expiry, and sends it only to the configured
API. Cookies are omitted. User passwords are not stored. Session storage is readable
by scripts on the frontend origin: avoid adding untrusted scripts and use a dedicated
origin for a public release. Do not publish browser storage exports or login responses.

## Files

- `config.js`: the one public API URL.
- `api.js`: reusable authenticated fetch helper.
- `index.html` / `village.js`: login, characters, quests, parties and encounters.
- `adventurer.html` / `character.js`: character stats, gear, loadout and progression.
- `ui.js`, `ui.css`, `journey_ui.js`: shared presentation helpers.

This is a snapshot of the reference UI. Backend code and tests are intentionally
excluded. Review this folder's files when extending the template; do not copy `.env`,
server logs, screenshots of private accounts, databases, or virtual environments.

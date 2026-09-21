# Local standalone frontend

Run from this folder in PowerShell:

```powershell
.\start-local.ps1
```

Open http://127.0.0.1:5173. The server serves only this frontend folder; the game
API and database remain hosted remotely. No local FastAPI server is needed.

Set `apiBaseUrl` in `config.js` to your hosted API URL ending in `/api`.
On the hosted backend, allow this local frontend with:

```text
PUBLIC_CLIENT_ORIGINS=["http://127.0.0.1:5173","http://localhost:5173"]
```

These are the current backend defaults. If you already configured other allowed
origins, keep them and add these local origins. Restart the backend after changing
its environment variables. Use the frontend's login form with your game account.

## Worldsmith content editor

After signing in with a developer account, open the `Worldsmith` tab to curate
quests, enemy/ability assignments, essence recipes, loot tables, villages, shops,
weapons, and armor. Catalog writes are authorized by `users.account_type=developer`.

Player accounts can inspect the public gameplay catalog but cannot save Worldsmith
changes. Assign the developer role through an administrator-controlled database
migration or SQL session; there is intentionally no client-side or environment-
variable override.

Configured API: `https://pythonapi-onvq.onrender.com/api`.

### Ability designer

Deploy backend migration `027_ability_design` with the updated frontend. In
Worldsmith, **Ability archetypes** holds reusable templates (direct damage, weapon
strike, healing, Guard, evasion, life drain, party siphon, mana siphon, empower,
and weaken). Choose **Create ability from archetype**, adjust the dials, and use
Review changes / Create in database. **Save as archetype** captures an existing
ability, including its status interactions, for future variants. Duplicating an
ability preserves its values while allowing a new name and slug. Template edits
do not change existing variants.

The ability designer provides ordered follow-up effects with move/remove controls:
damage, healing, a named resource such as `mana`, and temporary ability modifiers.
Choose a fixed amount or a percentage of the primary result, primary damage dealt,
or previous step's actual result. Healing can target self or the living party;
enable Split to distribute one healing budget. Example: damage → heal the party
for 50% of damage dealt → grant self mana equal to 100% of healing actually received.
Triggers can require a primary hit, positive damage, or kill. Modifiers can boost
or reduce one ability or all abilities, including follow-up conversion amounts,
for a chosen number of rounds. They affect subsequent casts immediately.

Rank upgrades override individual values at each rank; empty fields inherit the
previous rank. Character sheets show the resolved rank values. New departures
use those values; an active adventure keeps its saved snapshot. Resources generated
by chains are encounter state; mana costs/spending are not implemented by this editor.

See [README.md](README.md) for client documentation.


## Landing page content

Edit `news.js` to publish Village News announcements, newest first. These are
editorial announcements, not a live server news feed. The Friend Feed shows current
party-member status from `/parties` and village live updates. The Character Friends
tab groups players from shared parties into online and offline lists; it excludes
your own adventurers. Presence is live rather than stored as activity history.

Quests has four discovery categories: Journeys, Bulletin Board, Epics, and Raids.
Each choice opens a quest lobby where route details, rewards, party invites, readiness,
and departure are handled together. Custom single encounters remain available under
Bestiary & Testing.

## Auction House

Deploy the backend with migration `022_auction_house` before using this menu.
Players can list an unequipped weapon or a lot of consumables (including essences
and orbs), choose a fixed price or timed auction, and set a 1?168 hour duration.
The Auction House always trades as the adventurer selected in Character; it has no
separate character selector.
Prices and bids cover the entire lot; there are no fees. The current highest bid
is held, refunded immediately on outbid, and paid to the seller on expiry.
PostgreSQL servers settle auctions every 15 seconds while running. Market reads
also settle overdue listings after downtime. Refresh Market shows new listings,
bids, and outcomes; My Sales & Bids includes completed transactions.

## Equipment inventory

Deploy migration `023_equipment` for functional armor and accessory slots. The
Equipment tab has outfit slots, search/category/sort controls, item comparisons,
and a gear shop. Equipped gear adds catalog-defined attributes through existing
server combat formulas; outfits are locked during adventures. Gear purchases and
auction trades are supported. This first catalog contains one Iron-rank item per
slot; quest loot remains unchanged. Equipping never restores health.

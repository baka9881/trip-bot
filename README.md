# trip-bot

Taipei → Japan flight promotions, hotels and price watches for the Hermes "trip" Telegram bot.
Split out of a Flight Finder fork on 2026-10-18: it keeps only what the bot used, with a SQLite
file instead of PostgreSQL/Redis and a scheduled task instead of a web server.

## How it runs

| Piece | What it does |
|-------|--------------|
| `bin/deals` | The command the trip agent runs (`hermes/workspace/deals` forwards to it): fare list, hotels, rooms, dated trips, watches, party size, regions. `--telegram` sends the result with buttons. |
| Scheduled task **Trip Bot** (`bin/tick.vbs` → `deals tick`) | Every 15 min and at logon: scans each region every 6 h via Google Flights Explore, queues promotions and the 14:00 daily list, sends them, prefetches hotels, checks watched trips, daily self-check. Log: `logs/tick.log`. |
| Scheduled task **Hermes Gateway Watchdog** (`bin/hermes-watchdog.vbs`) | Every 10 min and at logon: starts the Hermes gateway if it is down. |
| `data/` (not in git) | `trip-bot.db` (watches, scans, alerts), cache, watches, settings, last lists. |
| `hermes/` | Backup of the Hermes side: the button plugin, the agent's SOUL and skill, the workspace wrapper. |

Runs on the system Node (`C:\Program Files\nodejs`, Node 24 for `node:sqlite`); not on a Node under Hermes' `cache/scratch`, which Hermes prunes.

## Code

- `src/cli.ts` — commands; `src/format.ts` — what reaches the phone; `src/telegram.ts` — sending (bot token from the Hermes profile `.env`).
- `src/deals/` — Explore page parsing, deal rules (`detect.ts`), hotels (`hotel-page.ts`), Booking rooms, flight list, scanning (`runner.ts`).
- `src/google/` — headless Chromium (Playwright) and Google consent/market helpers.
- `src/store.ts` — SQLite store. `scripts/import-flight-finder.ts` — the one-time import from the old database.

`npm test` (vitest), `npm run typecheck`.

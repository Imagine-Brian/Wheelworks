# Wheelworks

Wheelworks is a factory puzzle game powered by real hamster-wheel activity recorded by Squeekchain. Lay conveyors and rotate machines on a 5×5 grid to turn wood into boards and iron into gears. Route both parts to their matching docks within the daily power budget. Each completed daily order can contribute one crate to Acorn Creek Bridge. The community needs 50 crates to finish it.

[Play Wheelworks](https://squeek.guard-ai.live/). Choose **Practice** to try any of the three training layouts, or **Daily shift** to play today's order.

## Run locally

From the repository root, run:

```sh
nvm install
nvm use
npm ci
npm run dev
```

Open the URL printed in the terminal (default: `http://127.0.0.1:5186`). The daily shift needs an internet connection to fetch wheel data. Practice remains available when the feed is offline. To sign in, use an Ethereum browser wallet and sign the login message.

The development server stores blueprints in the Git-ignored `.local-data/` directory. Production saves live in a separate store. By default, restarting the development server generates a new session secret, so players sign in again.

## How the game works

**Daily orders.** The backend reads four six-hour settlement intervals covering the previous full UTC day from the [Squeekchain API](https://docs.squeekchain.com/developers/api/). It checks the Sepolia chain ID, confirmation depth, and time coverage before issuing an order. The date and settled work determine the targets, power budget, and obstacles. A confirmed day with zero work still produces a solvable order. If an interval is missing, the daily shift stays pending until a scheduled or player-triggered retry succeeds. The backend caches the order by UTC date.

**Blueprints and offline production.** The browser keeps the current draft and personal best power usage on the device. Cloud saves are grouped by wallet, UTC date, and hour. The last blueprint saved in an hour takes effect at the start of the next hour. Players can restore it in another browser. When loading an older blueprint, the game clears any equipment that overlaps the current day's rocks or docks. Practice results stay on the device.

The backend calculates boards and gears for completed production hours against that day's power budget. The **Build log** shows yesterday's output after the daily shift rolls over.

**Wallets and deliveries.** Sign-in uses a short-lived challenge and supports Ethereum accounts whose address can be recovered from a `personal_sign` signature. On delivery, the backend identifies the wallet from its session and simulates the submitted layout. Each wallet has one delivery record per UTC day, so retries and simultaneous submissions count as a single crate. Two different wallets count as two participants. Power, parts, and crates are in-game resources. Saving, offline production, and delivery require no blockchain transactions.

**Service usage.** The backend calculates production on demand. Usage scales with sign-ins, saves, deliveries, and storage reads and writes. The EdgeOne console provides usage monitoring and rate limits for authentication and save endpoints.

## Validation

```sh
npm run format:check
npm run typecheck
npm test
npm run build
```

Platform documentation: [Cloud Functions](https://pages.edgeone.ai/document/node-functions), [Blob storage](https://pages.edgeone.ai/document/blob-storage), and [scheduled tasks](https://pages.edgeone.ai/document/edgeone-json).

squeekchain-project: 690506e4-2683-4977-9270-fb3ef1fdb673

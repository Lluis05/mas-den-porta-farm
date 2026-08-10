# Mas d'en Porta Farm App

An app to manage a pig farm: pig counts down to corral level, the 7-band batch
cycle, slaughterhouse exits and feed forecasting.

## Status

Project scaffolded, no features built yet. The data model is designed and the
parents' existing spreadsheet has been fully analysed.

- [`docs/excel-analisi.md`](./docs/excel-analisi.md) — what the parents' Excel contains, and their answers about how the farm actually works.
- [`docs/model-dades.md`](./docs/model-dades.md) — the data model the app is built on.
- [`CLAUDE.md`](./CLAUDE.md) — full project context and current status.

## Key requirements

- **Offline-first**: the farm has no reliable internet connection, so data entry must work locally on-device and sync when a connection is available.
- **Mobile + web**: primary use is on a phone out in the barn, with a secondary web/PC view at the desk.
- **Nothing is ever overwritten** — the full history is kept.
- Imports the existing Excel spreadsheet (current year + full feed history).

## Stack

- [Expo](https://expo.dev/) SDK 54 (React Native) with TypeScript — one codebase for mobile and web.
  Pinned to 54 on purpose: Expo Go supports one SDK at a time, and the test iPhone can only install Expo Go 54. See `CLAUDE.md` before bumping.
- [expo-router](https://docs.expo.dev/router/introduction/) for file-based routing.
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) for on-device storage.
- Supabase proposed as the remote backend to sync to (not set up yet).

## Running it

```bash
npm install                  # once
npx expo start --tunnel      # then scan the QR code with Expo Go on your phone
npm run web                  # or open it in the browser
```

`--tunnel` is needed because the phone and the PC are on networks that can't see
each other; plain `npm start` (LAN mode) won't connect. `@expo/ngrok` is a local
devDependency because Expo's own global install of it doesn't resolve.

If the tunnel fails to start, the ngrok-free workaround is to turn on the phone's
personal hotspot, connect the PC to it, and use plain `npx expo start`.

## Layout

```
src/app/      screens and layouts only (each file is a route)
src/          everything else (components, database, logic)
docs/         analysis and design documents
```

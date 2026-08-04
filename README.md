# Mas d'en Porta Farm App

An app to help manage a pig farm: tracking how many pigs are in each farm and room, flagging pigs that are ill or need attention, tracking feeding needs, and more features to come.

## Status

Early planning stage — no app code yet. See [`CLAUDE.md`](./CLAUDE.md) for the full project context, constraints, and current status.

## Key requirements

- **Offline-first**: the farm may have no internet connection, so data entry must work locally on-device and sync when a connection is available.
- **Mobile + web**: primary use is on a phone out in the barn/field, with a secondary web/PC view.
- Will eventually import data from an existing Excel spreadsheet used by the farm.

## Planned stack

- [Expo](https://expo.dev/) (React Native) — one codebase for mobile and web.
- Local on-device storage for offline use, syncing to a remote backend (Supabase proposed) when online.

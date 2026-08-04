# Farm App

## Purpose
An app for the user's parents (pig farmers) to track their farm operations. Built by the user with Claude Code's help; the user is learning as they go.

## Core features (initial scope)
- Track how many pigs are in each **farm** and each **room** within a farm.
- Flag/track pigs that are ill or need attention.
- Track feeding needs/schedule.
- More features to be added as the user thinks of them — check in with the user before assuming scope.

## Key constraints (do not lose these when planning features)
- **Must work offline.** The farm(s) may have no internet connection. Data entry (pig counts, health status, feeding) must be stored locally on the phone first, and sync to the shared/remote database opportunistically when a connection is available. Do not design any feature that requires a live connection to function.
- **Two surfaces sharing one dataset**: a mobile app (primary, used out in the barn/field) and a web/PC app (secondary, used e.g. at a desk). Both need to see the same data once synced.
- The parents have an **existing Excel spreadsheet** with farm data. At some point we need to import that into the app so they don't have to re-enter everything by hand. Ask the user for the spreadsheet/structure when we get to that step.
- The user is non-technical / learning to code through this project. Explain setup steps plainly, don't assume prior knowledge of the toolchain.

## Tech decisions made so far
- **Framework**: Expo (React Native) — one codebase, runs as a mobile app (iOS/Android via Expo Go for testing) and exports to a web app, so we don't maintain two separate frontends.
- **Local storage**: TBD — need an offline-first local DB on-device (e.g. Expo SQLite or WatermelonDB) since connectivity can't be assumed.
- **Remote/sync backend**: Supabase (hosted Postgres + API) proposed as the shared backend the local data syncs to when online. Not yet set up.
- **Editor**: VS Code, installed on this machine (Arch/CachyOS) via pacman, for the user's own visibility into the code. Claude Code does the actual editing via terminal.
- **Version control**: git — the user will create the repo themselves later. Do not `git init` this folder until asked.

## Project status
- 2026-08-04: Folder created at ~/Documents/farm-app. No code scaffolded yet. VS Code installed by the user directly. Node/npm/git already present on the machine — no other software installs are blocking. Paused here: the user wants to think through app design first (feature scope, how modular to make it) before scaffolding any code. Next session: pick up with data-model/feature planning (farms, rooms, pigs, health status, feeding — matching the parents' existing Excel structure where possible), then run `npx create-expo-app` once ready.

## Notes for future sessions
- Always re-read this file at the start of a session in this project.
- Update "Project status" as things change — this is the source of truth for where the project stands between sessions.

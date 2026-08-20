# Farm App

@AGENTS.md

## Purpose
An app for the user's parents (pig farmers) to track their farm operations. Built by the user with Claude Code's help; the user is learning as they go.

## Core features (initial scope)
_Revised 2026-08-10 after the father answered the open questions — see `docs/excel-analisi.md` §7–8._
- Track pig counts down to **corral level**: 1 site → 27 fattening rooms → 12 corrals each (~132 pigs/room).
- Record the **7-band batch cycle**: weaning (`Cens24`), fattening cycle, exits to slaughterhouse.
- **Kill the duplicate data entry** between truck-level and room-level exit records — this is the parents' #1 pain point. The room record holds only the pig count; the app fills in load date and average weight from the truck record.
- **Feed forecasting**: use consumption history (mainly gestation + farrowing) to notify a few days before feed runs out. This — not feed distribution — is what "feeding" means here.
- Everything is **append-only history**; nothing is ever overwritten (the Excel's rotating sheet numbering is a limitation, not a requirement).
- ~~Flag/track pigs that are ill~~ — **dropped from initial scope.** The parents keep no health records and don't need them. What they do want, as *optional* entries: manual death records (deaths are still primarily derived by difference) and a treatment log.
- More features to be added as the user thinks of them — check in with the user before assuming scope.

## Key constraints (do not lose these when planning features)
- **Must work offline.** The farm(s) may have no internet connection. Data entry (pig counts, health status, feeding) must be stored locally on the phone first, and sync to the shared/remote database opportunistically when a connection is available. Do not design any feature that requires a live connection to function.
- **Two surfaces sharing one dataset**: a mobile app (primary, used out in the barn/field) and a web/PC app (secondary, used e.g. at a desk). Both need to see the same data once synced.
- The parents have an **existing Excel spreadsheet** with farm data: `~/Documents/estat granja.xlsm`. Analysed in `docs/excel-analisi.md`. We need to import it so they don't re-enter everything by hand.
- The user is non-technical / learning to code through this project. Explain setup steps plainly, don't assume prior knowledge of the toolchain.

## Tech decisions made so far
- **Framework**: Expo (React Native) — one codebase, runs as a mobile app (iOS/Android via Expo Go for testing) and exports to a web app, so we don't maintain two separate frontends.
- **Expo SDK version: pinned to 54** (2026-08-10, after 57 → 56 → 54). Reason: **Expo Go only ever supports one SDK**, and the user's iPhone can only install **Expo Go 54.0.2** from the App Store — the newer builds aren't offered for that device/iOS version, so this is a hard ceiling, not a temporary lag. Do **not** bump the SDK; the phone will reject the project again ("incompatible with this version of Expo Go"). The durable fix, once the app matters, is a **development build** (EAS) instead of Expo Go — that decouples the SDK from the App Store and is required anyway before the parents can use it for real.
- **Testing on device**: the user's phone and PC are on **separate networks that can't see each other**, so plain LAN mode doesn't reach the phone. Use `npx expo start --tunnel`. `@expo/ngrok` is a **local devDependency on purpose** — Expo CLI's "install it globally" prompt installs to `~/.local` but then can't resolve it, failing with `CommandError: Install @expo/ngrok and try again`. Do not remove it. If the tunnel itself errors (`failed to start tunnel / remote gone away`), the fallback that avoids ngrok entirely is: turn on the **iPhone's personal hotspot, connect the PC to it**, then plain `npx expo start` — both devices are then on one network.
- **Local storage**: **Expo SQLite** (decided 2026-08-10). Chosen over WatermelonDB deliberately: it's plain SQL the user can read and learn from, and we write the Supabase sync ourselves rather than adopting a framework's sync model. **On web, the SQLite file uses an exclusive OPFS lock: only one browser tab may have the app open at a time.** A second tab (or an orphaned one left open from earlier testing) makes the first fail with `NoModificationAllowedError` / `createSyncAccessHandle`, which then cascades into unrelated-looking SQLite errors. Before debugging a web SQLite error, first check for — and close — any other tab on the dev server.
- **Data model**: designed in `docs/model-dades.md` — **read it before writing any DB or screen code.**
- **Five traps already hit once, do not re-introduce:**
  1. A corral is reused cycle after cycle, so anything joining `linia_carrega` to `ocupacio_corral` by `corral_id` alone attributes a load to *every* cycle that ever used that corral. `v_cicle_resum` picks the occupancy with the latest `data_entrada` on or before the load date. Any new per-cycle query must do the same.
  2. **Rebuilding a table requires dropping the views first.** `ALTER TABLE ... RENAME` makes SQLite re-parse the whole schema; any view still pointing at the table you just dropped aborts it with `error in view …: no such table`. Migrations must `DROP VIEW` → rebuild → `db.execAsync(VISTES_SQL)`. That's why the views live in their own exported constant.
  3. Soft delete and plain `UNIQUE` constraints don't mix: a `UNIQUE` that ignores `esborrat_el` blocks re-inserting a row that was soft-deleted. Use **partial unique indexes** (`WHERE esborrat_el IS NULL`), as `idx_ocupacio_unica` does.
  4. **A `Pressable` rendered via `<Link asChild>` must never get an array `style={[a, b]}` — merge into one object instead.** On web, `Link asChild` clones its child onto the `<a>` it renders; if that child's `style` is an array, first mount throws `Failed to set an indexed property [0] on 'CSSStyleDeclaration'` and the whole screen crashes with a wrapped `<a>` in the component stack. Single-object styles on the same `Pressable` are fine, and array styles on non-`Link` elements (plain `View`/`Pressable` with `onPress`) are also fine — it's specifically `asChild` + array + `<a>`. Discovered 2026-08-11 building the history page: it silently broke the home screen (and the cicle/carrega edit buttons) the moment real data existed, on a code path that had simply never been exercised on web before. **Verify new `Link asChild` screens on web with real, non-empty data, not just an empty database.**
  5. **No backticks inside the SQL in `schema.ts`.** `SCHEMA_SQL` and `VISTES_SQL` are each one big JS template literal, so a backtick used to quote an identifier inside a `--` SQL comment silently terminates the string and produces a pile of confusing syntax errors pointing at unrelated lines. Write *the column albara*, not the backticked form. Hit 2026-08-12 while adding migration 6.
- **Project layout**: `src/app` = screens + layouts only (expo-router file-based routing); all other code elsewhere in `src/`.
- **`metro.config.js` is load-bearing — do not delete.** `expo-sqlite` on web runs as WebAssembly; without `assetExts.push('wasm')` the web build fails to resolve `wa-sqlite.wasm`, and without the COOP/COEP headers the browser refuses SharedArrayBuffer. The dev server gets those headers from `enhanceMiddleware`; **whoever hosts the production web build must send them too**, or the web app won't open its database.
- **Remote/sync backend**: Supabase (hosted Postgres + API) proposed as the shared backend the local data syncs to when online. Not yet set up.
- **Editor**: VS Code, installed on this machine (Arch/CachyOS) via pacman, for the user's own visibility into the code. Claude Code does the actual editing via terminal.
- **Version control**: git — the user will create the repo themselves later. Do not `git init` this folder until asked.

## Project status
- 2026-08-20 (worker login / PIN gate): Fifth and last of the queued requests
  (see the 2026-08-13 entry below), implemented **differently from how it was
  first described** — the user reframed it mid-session: instead of a worker
  view reached *from* the existing dashboard, the **default screen (`/`) is
  now the worker view**, and the dashboard moves *behind* a PIN.
  - `src/lib/admin.tsx`: `AdminProvider`/`useAdmin()`, a small React context
    holding `isAdmin` in memory only — **no persistence** (no SecureStore/
    AsyncStorage dependency added on purpose, to avoid forcing another EAS
    dev-client rebuild for this). It resets to the worker view every time the
    app restarts, same as a screen lock. Shared PIN, hardcoded `4163`, not
    per-user accounts — matches what was already decided for this feature.
  - New `src/app/index.tsx` ("/") **is** the worker screen: one button,
    "Apuntar una baixa" (already existed, still ungated), plus a hamburger
    icon that opens a right-side PIN panel (`Modal`, not a real drawer lib —
    no new dependency). Correct PIN → `router.replace('/inici')`.
  - The **entire previous dashboard** (cicles, pinso, càrregues, llavors,
    resum, importar — everything) moved into a route group,
    `src/app/(admin)/`, whose own `_layout.tsx` is the gate: if `!isAdmin` it
    `<Redirect href="/" />`s, otherwise renders a `<Stack>`. **Group folders
    don't change the URL** (`(admin)/cicle` is still served at `/cicle`), so
    every existing link/route in the app kept working unchanged except the
    old home, which needed a new name — chosen `/inici` — and the three
    `router.replace('/')` calls after delete/undo actions in
    `cicle/[id]/index.tsx`, `carrega/[id]/index.tsx`, and `importar.tsx`,
    updated to `router.replace('/inici')` so they land back on the dashboard,
    not the worker screen. The old dashboard's own header now also carries a
    "Tancar sessió" button (`bloqueja()` + `replace('/')`).
  - **One real bug hit and fixed while building this**: the `(admin)`
    layout's guard first returned `<Slot />` on success. That's wrong — a
    `<Slot>` has no header of its own, so every `<Stack.Screen options={{title:
    …}}>` call inside the moved screens stopped taking effect, and the header
    silently fell back to showing the raw route-group segment name,
    `(admin)`, with no title and no headerRight button at all (found via
    screenshot, not types — `tsc` and the export both stayed clean through
    this). Fixed by having the guard return its own `<Stack>` (with the same
    `screenOptions` as the root) instead of `<Slot>`, and marking the
    `(admin)` segment `headerShown: false` in the *root* Stack.Screen so the
    two navigators don't stack two header bars. **New trap for this file**:
    a nested route-group `_layout.tsx` that gates access must render its own
    `<Stack>`, not `<Slot>`, or per-screen `<Stack.Screen>` header options
    inside that group silently stop working.
  - **Second bug, found by the user testing it**: the PIN panel visually
    slid up from the bottom instead of in from the right. Cause: RN's
    `Modal` only ever animates its whole content sliding from the bottom
    (`animationType="slide"`) — the panel's own `position:'absolute',
    right:0` styling doesn't change that, since the Modal itself is what's
    being animated, not the panel inside it. Fixed by switching the Modal to
    `animationType="fade"` (just the backdrop) and animating the panel's own
    `translateX` by hand with `Animated.timing` (280px off-screen → 0 on
    open, reverse on close, native driver). **New trap for this file**: RN's
    built-in `Modal` slide animation cannot be aimed at a side panel — for
    anything that isn't a bottom sheet, animate the content yourself.
  - Verified end-to-end on web (`npx expo export --platform web` clean,
    `tsc --noEmit` clean, then live in a browser): worker screen loads at
    `/`; typing a wrong PIN shows "PIN incorrecte" and doesn't unlock;
    `4163` unlocks and lands on `/inici` with real data (3,638 pigs, full
    cicle list); navigating into `/cicle/[id]` while unlocked works exactly
    as before (collapsible sales, "Apuntar un moviment"); "Tancar sessió"
    returns to `/`; navigating straight to `/inici` by URL **without**
    unlocking first bounces back to `/`; and the PIN panel now visibly
    slides in from the right. **Then verified against real SQLite, not just
    the UI**, per this file's standing rule: recorded an actual baixa (2
    pigs, Sala 1) through the worker screen with no PIN entered, confirmed
    both the sala count and the farm total dropped by exactly 2 and survived
    a reload, then — since there's no delete screen for `baixa` yet — wrote
    a throwaway temporary route to hard-delete that test row and confirmed
    the numbers landed back at exactly 182/3,638. Pushed as `2e39b41`.
  - **Not done / open**: no logout timer, no persistence across app
    restarts (deliberate, see above), and the "how do I get back to the
    worker view from the admin side without the button" question doesn't
    arise since it's always reachable at `/`. If persistence is wanted later,
    it needs `expo-secure-store` — a new native dependency, so a fresh EAS
    dev-client build before it can be tested on the phone.
  - **Session ended here on 2026-08-20.** All five queued requests from
    2026-08-13 are done except cens de truges, which the user explicitly
    deferred ("otro día hacemos todas las columnas que faltan del cens") —
    **pick up there next**, see item 6 under "Where to pick up" below; it
    needs a design conversation about the missing columns before any code.
- 2026-08-13 (moviment screen: multi-select + collapsible sales): Follow-up
  on the moviment screen shipped minutes earlier. User wanted two UI changes:
  (1) pick **more than one** corralina on both the origin and destination
  side of a moviment, not just one-to-one; (2) don't show all corralines at
  first glance anywhere — sales collapsed by default, tap to expand — and
  applied that to the cicle detail page's "On són" section too, not just the
  moviment screen.
  - **New pure function** `aparellaTrasllats()` in `lib/corrals.ts`: the
    `moviment` table is still always one corral → one corral
    (`CHECK (corral_origen_id <> corral_desti_id)` assumes 1:1), so
    multi-select on both sides needs turning "these origins give this many,
    these destins take this many" into concrete pairs. Greedy two-pointer
    matching — which literal origin lands in which literal destination
    doesn't matter (pigs aren't tracked individually), only that per-corral
    sums are right on both sides. Tested in new `scripts/prova-corrals.mjs`
    (11 checks — first dedicated tests for `corrals.ts`, folded into
    `npm run provar`).
  - Distribution: the one "how many porcs" the user types is split across
    selected **origins** with `reparteixProporcional()` (weighted by what's
    there, capped, same as baixa/carrega already do) and across selected
    **destinations** with `reparteix()` (even split — same helper the
    cicle-creation entry flow already uses for tap-to-select corrals).
  - `creaMoviment()` → `creaMoviments()` (plural): now takes a list of
    pairs and writes them inside one transaction.
  - **New shared component** `src/components/sala-colapsable.tsx`: a
    collapsed-by-default sala row, tap to expand. Purely presentational —
    the moviment screen puts a multi-select corral grid inside it, the cicle
    page puts a read-only one. Reused in both places rather than building
    the collapse logic twice.
  - Verified against real SQLite (throwaway script, not committed): two
    moviments written in the same `creaMoviments()` transaction both apply
    correctly to `v_ocupacio_actual`.
  - **Still open, deliberately deferred**: how the PIN/login itself works —
    user wants the moviment UI settled first. Two questions still
    outstanding from before: where the PIN is stored/checked (on-device
    only vs configurable remotely), and how to get back to the full app
    from the worker-restricted view.
- 2026-08-13 (moviments + baixa history on the cicle page): Second of the
  five queued requests (see entry below). User wants baixes (already
  shippable) and moviments both visible on a cicle's own detail page, and
  moviment recording reached from **its own screen**
  (`/cicle/[id]/moviment/nou`), linked via a button next to "Editar" — not
  embedded in the edit form itself. Built:
  - `baixesDelCicle()` / `movimentsDelCicle()` in `queries.ts` — same
    cycle-attribution pattern `v_cicle_resum` already uses for escorxador
    loads (latest `ocupacio_corral.data_entrada` on or before the event's
    date decides which cicle a corral belonged to at that moment — trap #1
    in this file). `movimentsDelCicle` checks **both** origin and
    destination corral against the cicle, so a moviment shows on both sides
    (`sentit: 'surt' | 'entra'`) — needed because a moviment can cross into a
    sala that was never part of this cicle to begin with.
  - **Explicit decision on cross-cicle moviments**: if a moviment's
    destination corral is currently occupied by a *different* cicle,
    `v_ocupacio_actual` still stays correct (it only cares about totals per
    corral), but `v_cicle_resum`'s later escorxador-sale attribution for
    that corral would go entirely to whichever cicle occupied it most
    recently — mixed-cicle stats for that corral could be slightly off.
    **User confirmed this is an accepted edge case, not worth solving now.**
    If it ever needs fixing, the fix point is `v_cicle_resum` in
    `schema.ts`, not `moviment`.
  - `/cicle/[id]/moviment/nou`: one corral → one corral per moviment (matches
    the table's own shape — `CHECK (corral_origen_id <> corral_desti_id)`
    already assumed 1:1). Origin is restricted to this cicle's own corrals
    (`corralsAmbPorcsDelCicle`, already existed); destination is **any**
    corral farm-wide (new `corralsPerMoviment()`), so cross-sala moves work.
    Moving from several origin corrals at once means recording several
    moviments — no batch UI, kept simple on purpose.
  - Verified against real SQLite (throwaway script, not committed): a baixa
    attributes to the right cicle only; a moviment between two of the same
    cicle's own corrals shows once; a moviment crossing into another cicle's
    already-occupied corral shows correctly on **both** cicles with the
    right `sentit`.
- 2026-08-13 (five requests queued, first one — baixes screen — shipped):
  User listed five things after testing photo-scan: (1) a real bug — a
  freshly-recorded delivery for a type with zero prior history didn't show
  its kg anywhere on `/pinso` (fixed below); (2) wants a cicle's room-entry
  history ("veure més" showing which sales a band entered, plus a second
  "veure més" for later room changes) — **done 2026-08-13, see entry above**;
  (3) a farm-wide
  truges (breeding sow) census feature mirroring the Excel's `cens24` sheet,
  with an initial count (from Excel import **and** a manual recount the user
  will do by hand and start counting from a chosen day — both), additions
  from inseminated primals (llavores don't count until first inseminated),
  subtractions from baixes + truges de rebuig, no per-farm split — **not done
  yet, explicitly saved for last since least defined**; (4) recording baixes
  (deaths) that actually subtract pig counts — **done, see below**; (5) a
  worker login limited to room/pig-count viewing + recording baixes, nothing
  else, simple shared PIN not individual accounts — **not done yet**. Agreed
  order: baixes screen → sala/moviment history (moviment recording gets its
  **own screen**, not embedded in the cicle screen, per explicit instruction)
  → worker login → cens de truges last.
  - **Bug fix**: `/pinso/index.tsx`'s single-delivery branch showed the date
    but never the kg (`calculaPrevisio` correctly needs 2+ deliveries for a
    rate, but the UI dropped the one number it did have). Now shows
    "Només hi ha una entrega apuntada: X kg (date)".
  - **Baixes screen shipped** (`/baixa/nova`, linked from home): turned out
    `moviment` and `baixa` tables, and their accounting in
    `v_ocupacio_actual` (subtracts baixes, applies moviments — including
    cross-sala, since `moviment.corral_desti_id` isn't restricted to the
    same room), **already existed in the schema**, just with no screens —
    this was on the "tables with no screens yet" list below. No schema
    change needed. New: `corralsAmbPorcsAra()` (all currently-occupied
    corrals, not scoped to one cicle) and `creaBaixa()` in `queries.ts`. The
    screen deliberately asks for a **sala-level** count only (not per
    corral) per the user's explicit answer — `reparteixProporcional()`
    (already used for escorxador loads) spreads it across that sala's
    corrals behind the scenes, same mechanism, no new distribution logic.
    Verified against real SQLite (throwaway script, not committed): the
    view's totals drop by exactly the recorded count and no corral goes
    negative.
- 2026-08-13 (medicated feed, schema v7): Real photos surfaced a case the
  parser didn't handle: some deliveries come with a veterinary prescription
  printed as "Prescripció: ..." and "Complement medicamentós" directly under
  the article line (`photos-OCR/medicated.jpg`), not as their own line with a
  code. `analitzaAlbara()` now detects those two keywords (`MEDICAMENT`,
  `PRESCRIPCI`, case-insensitive) on any row and attaches them to the nearest
  article line above — handles both cases seen in real photos: the annotation
  as its own OCR row (loose framing) and merged into the article's own row
  (full-page framing, since the lines print close together). New fields
  `medicat`/`prescripcio` flow through `LiniaAlbara` → the review screen
  (`/pinso/foto`, a tap-to-toggle badge since OCR can miss it, plus the
  prescription code shown read-only) → `creaEntregaPinso()` →
  `entrega_pinso.medicat`/`.prescripcio` (schema v7, `scripts/prova-migracio-7.mjs`).
  Deliberately **not stored**: the sitja number (silo, `82`/`1` in
  `PPDGD 82 660988`) and the 6-digit lot number — user confirmed these are
  display-only during review, not meaningful to keep. The user also confirmed
  that the same article code appearing twice in one albarà with different
  sitja (`photos-OCR/diff_code.jpeg`) already works correctly as-is: each row
  is processed independently, so it becomes two separate deliveries of the
  same tipus_pinso — no code change was needed for that part. Verified with a
  new synthetic fixture in `scripts/prova-albara.mjs` (37 checks now, was 27
  this morning) and the new `prova-migracio-7.mjs` (8 checks, both the
  upgrade-from-v6 and fresh-install paths, per this project's hard rule of
  testing migrations against real SQLite).
- 2026-08-13 (photo-scan: first real-device test, two column-detection bugs
  found and fixed): The Android dev build (item 0 below) is built, installed,
  and tested on the phone with real albarà photos — the first time this
  feature has run outside a unit test. Two real bugs found, both in
  `triaColumna()` in `src/lib/albara.ts`, both only reachable with a
  **full-page** photo (the original test photo `docs/pinso-example.jpeg` is
  already fairly wide but happens not to trigger either one): (1) the
  fallback "rightmost plausible column" heuristic could be won by a column
  with a single lucky value — e.g. `CODI CLIENT 5192` where `5192` looks like
  a plausible weight and sits further right than the real kg column — instead
  of the column actually backed by all the article rows; fixed by preferring
  the column with the most matching rows, rightmost only as a tie-break.
  (2) All-caps header words (`MAS`, `CODI`, `EMAS`, `VIC`, from the address
  block, client-code box, and certification logos) coincidentally match the
  article-code pattern and aren't excluded unless they're the article-code
  regex match *and* the first word of their OCR row — codes are always the
  table's leftmost column, headers/logos never are. Both fixes are covered by
  a new fixture (`scripts/fixtures/albara-ocr-pagina-sencera.json`, real OCR
  output from a real full-page photo of this same delivery note) in
  `scripts/prova-albara.mjs` — suite is now 31 checks, was 27. **Total-row
  detection is still broken on full-page photos** (a coincidence of layout:
  "Totals 27.004,00" sits at almost the same photo height as the unrelated
  "Núm. expedició: 223003/1" line, so they merge into one OCR row and the
  larger, wrong number wins) — not fixed, because the column-detection bug
  above no longer depends on it working. Left as a known gap; the app still
  reads the three line-items and the date/number correctly without it, it
  just loses the "does it add up to the printed total" cross-check on
  full-page photos. Also fixed separately: the dev-client's own QR-scan
  connect screen can fail with "Waiting for the Barcode UI module" if the
  phone has no internet for Play Services to fetch it on first use — use
  "enter URL manually" with the Metro/tunnel URL instead, no code change
  needed for that one.
- 2026-08-12 (photo-scan of albarans — code done, waiting on the dev build):
  The whole feature is written and tested except the one step that needs a
  real device. **Target platform switched to Android**: an EAS *iOS* dev build
  needs a paid Apple Developer membership (~$99/yr, no free path from Linux —
  the free Xcode personal-team route needs a Mac), whereas Android dev builds
  are free APKs. The user confirmed **the parents are on Android**, so that is
  now the primary target and the Apple cost is avoided entirely for the
  foreseeable future.
  - **OCR library: `expo-mlkit-ocr`, NOT `@react-native-ml-kit/text-recognition`**
    (which this file previously suggested). The latter is unmaintained and
    untested on the New Architecture, which SDK 54 defaults to. `expo-mlkit-ocr`
    is an Expo Modules API wrapper over ML Kit v2 with a config plugin, and
    crucially returns **element-level bounding boxes**.
  - **Why bounding boxes matter**: the albarà is a table. A bare number is
    meaningless — whether it's kg, preu or import depends on which column it
    sits in. `src/lib/albara.ts` reconstructs rows and columns from geometry.
  - **`src/lib/albara.ts` is pure and tested** (`npm run provar`, 27 checks).
    The main fixture is *real* OCR output from `docs/pinso-example.jpeg`
    (`scripts/fixtures/albara-ocr.json`). It reads that photo correctly:
    albarà 347570, 2026-08-07, 9000/8995/9009 kg — which sum to the 27.004
    printed on the paper, so the result is independently verifiable.
  - **Three things the real photo taught us that guesswork would have missed**,
    all now covered by tests: (1) OCR splits `9.000,00` into two words
    (`9.000,` + `00`) with *different* y and overlapping boxes; (2) the column
    headers and the `Totals` row are often illegible, so column detection
    **cannot** rely on finding "Quantitat" and the total is a bonus check, not
    an input; (3) a permissive number parser turns `07-08-2026` into 7082026
    and the lorry plate `R4952BDM` into 4952, making address rows look like
    line items. `llegeixNumero` is deliberately strict.
  - **Schema v6** (`article_proveidor` + `entrega_pinso.albara`), verified on
    real SQLite (`scripts/prova-migracio-6.mjs`, 17 checks) on both the
    upgrade-from-v5 path and the fresh-install path. The supplier→tipus_pinso
    mapping is **learned, never guessed**: the first albarà asks once per new
    code and remembers it. `albara` exists so the same paper can't be counted
    twice — it's append-only data feeding a forecast, so a duplicate silently
    inflates stock.
  - **Left to do**: run the EAS build, install the APK, and test on the phone
    with a real albarà. Nothing else is blocking.
- 2026-08-11 (photo-scan feed notes, decision only): The father's wishlist also included scanning a photo of a pinso delivery note (albarà) to auto-fill date/type/kg instead of typing them — see `docs/pinso-example.jpeg` for a real example. That photo shows the real complexity: **one albarà has several line items**, each with a supplier article code (`PTCGD`, `PTGGD`, `PPDGD`, …) that has no relation to this app's `tipus_pinso.codi` — any extraction path needs a code→tipus_pinso mapping step, not just OCR text. Asked the user to choose an approach: cloud vision API (simplest, needs internet+API key+cost), on-device OCR (offline, no cost, but needs leaving Expo Go for an EAS development build), or manual entry with an attached photo (no OCR at all). **User chose on-device OCR.** That means item 4 below (the EAS dev build) has to happen *first*, and it needs the user present for the Expo account/login step — deliberately deferred to a separate session. Nothing implemented yet: no library chosen, no EAS project created.
- 2026-08-11 (quarterly summary): New `/resum` screen rebuilds the Excel's per-trimestre totals sheet (`docs/excel-analisi.md:140`) from data already in the database — no schema changes. `resumTrimestral()` in `queries.ts` groups `carrega_escorxador` by year+quarter+`tipus` and `entrada_llavores` by year+quarter, then derives `promigKg` (kg/unitats), `rendiment` (kg_canal/kg, porcs only), and `preuKg` — **deliberately `total_factura / kg`, a weighted average, not `AVG(preu_kg)`** across rows, since a simple average would let a small delivery skew the quarter's price as much as a big one. Verified against real imported data: 74.6% rendiment, ~115-119 kg average slaughter weight, ~1.4 €/kg all landed in plausible ranges; a quarter with unfilled invoice fields correctly shows "—" instead of crashing or showing NaN.
- 2026-08-11 (llavores screen): `entrada_llavores` (truges de reposició que entren, resposta G2) now has screens: `/llavors` (list + "Apuntar una entrada" button), `/llavors/nova` (create), `/llavors/[id]` (view, inline edit, soft delete) — no schema changes needed, the table already had every field. Follows the same "invoice fields can be filled in later" pattern as `carrega_escorxador`: `total_factura`/`preu_kg` are optional at creation. Linked from the home screen's button grid. Verified end-to-end against real imported data on web: list, create, edit, and soft-delete all round-trip correctly.
- 2026-08-11 (history page + a real web-only rendering bug): Home screen now caps "Cicles" and "Últimes càrregues" to the 10 most recent, each with a "Veure'n més ›" link to a new full-history screen (`/cicle`, `/carrega` — new `index.tsx` in each folder; `llistaCicles`/`llistaCarregues` in `queries.ts` grew an optional `limit` param, `LIMIT ?` with `-1` meaning unlimited). Building this surfaced trap #4 above (`Link asChild` + array style crashes on web with real data) — it was **already present** on the two cycle/load edit-button screens, just never triggered because nobody had tested those screens on web with a non-empty database. Fixed all four occurrences. **Lesson applied going forward: test new web screens against imported/real data, not an empty DB** — this class of bug is invisible on native and invisible on an empty database.
- 2026-08-11 (feed notifications, confirmed working): `expo-notifications` added for F4's "notify a few days ahead" ask, closing item 2 from the list below. `src/lib/notificacions.ts` is the new piece: `reprogramaAvisosPinso()` cancels and reschedules one local notification per feed type, fired at (estimated exhaustion date − `DIES_AVIS`), called from the home screen's existing focus effect right after it recomputes the forecast. Deliberately **local only, no push/server** — matches the offline-first constraint. First version only scheduled *future* warnings and skipped anything already inside the urgency window (wrongly assuming the in-app banner already covered that case) — fixed to fire immediately for already-urgent types, de-duped against what's still in the notification tray via `getPresentedNotificationsAsync()` so it doesn't refire on every app open. Also added a `setNotificationHandler` — without it, a notification arriving while the app is foregrounded doesn't display. **User-confirmed working on the phone** after that fix.
- 2026-08-11 (web app fixed): First run of `npm run web` failed with cryptic SQLite errors ("cannot rollback - no transaction is active", then "duplicate column name: importacio_id"). Both were real bugs, only surfaced on web because wa-sqlite (web's SQLite backend) is stricter than native about some things the phone silently tolerated: (1) `seedDatabase()` (`src/db/seed.ts`) had its own `withTransactionAsync` nested inside migration 1's transaction — nested `BEGIN` crashes on web and its own rollback silently ended the outer transaction too, so the outer rollback then failed with "no transaction active". Fixed by removing the inner transaction (seed is only ever called from within migration 1's transaction already). (2) Migration 5 unconditionally `ALTER TABLE ... ADD COLUMN importacio_id`, but `COMUNES` in `schema.ts` already bakes that column into every table from v1 — fine for the phone's DB (upgraded incrementally from before that column existed) but crashes on any brand-new install, web included. Fixed with a `columnaExisteix()` guard before the `ALTER`, mirroring the existing `taulaExisteix()` pattern. Verified clean on a fresh empty web DB and on reload. **Neither bug is web-specific in nature** — they're migration-path bugs that native SQLite happened not to trip over; worth remembering if similar "works on phone, fails on web" reports come up again.
- 2026-08-10 (feed forecast): The third initial-scope feature is in. `src/lib/pinso.ts` is pure, tested logic: consumption rate = kg delivered between the first and last delivery in a 180-day window, divided by the days between them (the last delivery is excluded — it hasn't been eaten yet); days remaining = last delivery's kg ÷ rate, minus days elapsed. Screens: `/pinso` per feed type, plus a home-screen alert, plus `/pinso/nova` to record a delivery — **without which the whole feature decays**, since the forecast needs deliveries entered. Sanity check on real data: per-type rates sum to 6,458 kg/day against 6,589 kg/day computed independently from the 3-year total. **`dadesEndarrerides()` guards the alarm**: if nothing has been recorded for longer than twice the shortest typical delivery interval, the screen says "entries are missing" instead of showing nine silos as empty — which is what the imported (stale) spreadsheet produces. **Not done: OS notifications.** F4 asked for a notification a few days ahead; what exists is an in-app warning. That needs `expo-notifications` and scheduling.
- 2026-08-10 (imported for real): The user ran the import on their phone and it looks right. **A corrected spreadsheet is coming later** — the current one has known gaps (recycled sheets, missing `Nº porc sala`, pigs "leaving" rooms two months after the data says they were emptied). **Do not spend effort chasing those inconsistencies**; they are source-data problems the user will fix at the source. When the corrected file arrives: `npm run importar`, undo the old import from the `/importar` screen, and import again — that path is tested and keeps hand-entered data.
- 2026-08-10 (undo import): The import is now **fully reversible**, added before the user ran it for real. Every data table carries an `importacio_id` (part of `COMUNES`, so all 19 tables have it); undo soft-deletes every row carrying that id and hard-deletes the `importacio` bookkeeping row so the same file can be imported again. **Rows entered by hand are untouched** — they carry no import id. Verified: import → 3,638 pigs, add a manual cycle → 3,738, undo → only the manual 100 remain and all 666 feed rows survive as soft-deleted, re-import → back to 3,738 with no duplicates. Also applied the father's answers H1–H3: room capacity of 11/corral is a grown-pig figure and **not a limit** (the app no longer warns when more go in), feed dates in the wrong sheet get the sheet's year, missing `Nº porc sala` becomes 132, and a room whose recorded exits exceed its entry has its entry raised to match.
- 2026-08-10 (Excel import): `npm run importar` reads `~/Documents/estat granja.xlsm` and writes `assets/import/granja.json` (133 kB, committed); the in-app screen `/importar` loads it once, tracked in the `importacio` table so it can't double-import. Imports all feed history (666 deliveries / 200 invoices, **6,173,821 kg — matches the spreadsheet exactly**), 2026 weanings + transition, 2026 fattening cycles from the numbered sheets, and slaughterhouse loads with per-room lines re-joined to their truck. `analitzaCodiSala()` in `src/lib/corrals.ts` is the inverse of `codiSala()` and decodes the handwritten room codes. **The importer never guesses**: anything it can't read goes to `avisos` and is left out. It refuses cycles whose numbers are impossible (missing `Nº porc sala` in recycled sheets) — importing those produced corrals with negative pigs. Scope stays as agreed (F6): current year + all feed history. **`xlsx` is a devDependency only** (SheetJS has open advisories and no fixed version on npm); it never ships in the app bundle.
- 2026-08-10 (migration hardening): Migration 3 crashed on the user's phone with `table ocupacio_corral_nova already exists`, leaving the DB half-migrated (old table dropped, temp table holding the data, `user_version` still 1). Root cause was the ALTER-TABLE/views trap above; the earlier test missed it because its throwaway DB had no views. Fixed three ways: migration 3 now drops and recreates the views around the rebuild, **detects and recovers from the half-migrated state**, and **every migration runs inside a transaction together with its `user_version` bump**, so a failure can no longer leave the database in a state the app can't fix. Verified on four database shapes: a normal v1, the exact broken one, a deliberately failing migration (rolls back cleanly), and a fresh install.
- 2026-08-10 (edit + delete): Cycles and loads can now be edited and deleted. Deletes are **soft** (`esborrat_el`), so deleting a load returns its pigs to their corrals and nothing is ever lost. Editing a cycle is **blocked once pigs have left** — changing occupancy under saved loads would corrupt them; the screen says to delete the loads first. Confirmation is in-screen, not `Alert`: **React Native Web's `Alert` is a no-op**, so on the web app delete would have silently done nothing. There are now **no `Alert` calls anywhere in `src/`** — keep it that way. Cycle form extracted to `src/components/formulari-cicle.tsx`, shared by create and edit so they can't drift. Two real bugs were found and fixed while testing (see below).
- 2026-08-10 (slaughterhouse loads): **The duplicate-entry problem is solved.** `src/app/carrega/nova.tsx` records a load once: date + type on the truck, and per room only a pig count — the app splits it across that room's corrals with `reparteixProporcional()` (proportional to what each holds, never taking more than is there), and average weight/date are never re-typed. `src/app/carrega/[id].tsx` shows the load and lets the invoice fields be filled in later from the desk (F1). Invoice `unitats` vs the sum of the room lines is compared and any mismatch is surfaced — that reconciliation used to be manual. `truges_rebuig` loads correctly have no corral lines. Verified against real SQLite with the screens' exact SQL, including emptying a cycle and the resulting `v_cicle_resum`.
- 2026-08-10 (first screens): Three screens working — home (`src/app/index.tsx`: pigs on the farm + cycle list), new fattening cycle (`src/app/cicle/nou.tsx`), cycle detail (`src/app/cicle/[id].tsx`). Entry flow is as agreed: pick band → date → tap rooms → tap corrals in a 6+6 grid → type one pig count per room; `reparteix()` splits it across the marked corrals. `src/lib/corrals.ts` also rebuilds the Excel's own room code (`11 1-2-3-4E`, `26 E+5-6D`, `21D`) so the parents recognise what they're looking at. All SQL lives in `src/db/queries.ts`, never in screens. Verified against real SQLite using the screens' exact SQL: distribution loses no pigs, the views update after a slaughterhouse load, ordering is right. Next: recording slaughterhouse exits (the feature that removes the duplicate data entry), then the Excel import.
- 2026-08-10 (schema): **SQLite schema built** in `src/db/` — `schema.ts` (tables + views), `seed.ts` (fixed farm structure), `index.ts` (migration runner keyed on `PRAGMA user_version`). Wired into the app via `SQLiteProvider` in `src/app/_layout.tsx`; `src/app/index.tsx` is a temporary screen showing the row counts so the DB can be verified on the phone. Seeds 27 rooms / 324 corrals / 3,564 places, 7 bands, 7 reproduction locations, 9 feed types. Derived values are **SQL generated columns + views**, never writable: `v_ocupacio_actual` (pigs per corral now), `v_cicle_resum` (deaths by difference, sale ages), `v_consum_pinso` (feed rate for the forecast). Verified by running the whole schema against real SQLite with sample data — calculations correct and all CHECK/FK/unique constraints reject bad input. **To change the schema: bump `VERSIO_ESQUEMA` and add a new migration step; never edit a published one.**
- 2026-08-10 (scaffold): **First code exists.** Expo SDK 57 / React Native 0.86 / React 19, TypeScript, expo-router (file-based routing, `src/app`), demo content stripped via `reset-project`. `expo-sqlite` installed. Verified: `npx tsc --noEmit` clean and `npx expo export --platform web` bundles. Also resolved: corral numbering is **1–6 per half** (`E`/`D`), so `26 E+5-6-D` is one room with uneven halves, not two rooms — `docs/model-dades.md` §1 has the full decoding table for the Excel's room codes. Entry UX decided: type the pig count per room, tap which corrals are occupied, app splits the number across them. Next: SQLite schema from `docs/model-dades.md`, then the first real screen.
- 2026-08-10 (later): Follow-up questions G1–G4 answered too. Notable correction: the `LLAVORES` block in the *Porcs escorxador* sheet is **incoming** replacement gilts, not sales. Feed forecasting is **per feed type** (gestation silo ~25,000 kg, farrowing ~12,000 kg). All 12 corrals per room hold 11 pigs. **Data model written to `docs/model-dades.md`** — entities, calculated-vs-entered fields, Excel→table import mapping. Three things still open before coding: which corral numbers are `E` vs `D`, whether delivery-rate-based feed forecasting is good enough, and Expo SQLite vs WatermelonDB. Next: pick the local DB, then `npx create-expo-app`.
- 2026-08-10: The user + their father answered **all 30 open questions** (raw text in `docs/respostes-pare.md`, folded into `docs/excel-analisi.md` §7, with implications in the new §8). Biggest consequences: the app must reach **corral level** (27 rooms × 12 corrals, 132 pigs/room); **individual health tracking is out of scope** (they keep no such records); "feeding" means **feed-runout forecasting + notification**, not distribution; nothing may ever be overwritten; transition happens **at a different farm**. Import scope narrowed to **current year + full feed history**. Four new questions raised in §8.4 (G1–G4). Next: design the data model / entity schema from §8.2, then scaffold with `npx create-expo-app`. Still no code.
- 2026-08-09: Read the parents' spreadsheet (`~/Documents/estat granja.xlsm`, 42 sheets, in Catalan). Full structural analysis + open-question log written to `docs/excel-analisi.md` — **read that file before any data-model work**. Key finding: the farm runs a **7-band batch system** (weaning every 3 weeks per band); the data model is batch/room-level, not individual-animal. Waiting on the user's answers to the open questions in section 7 of that doc. Still no code scaffolded.
- 2026-08-04: Folder created at ~/Documents/farm-app. No code scaffolded yet. VS Code installed by the user directly. Node/npm/git already present on the machine — no other software installs are blocking. Paused here: the user wants to think through app design first (feature scope, how modular to make it) before scaffolding any code. Next session: pick up with data-model/feature planning (farms, rooms, pigs, health status, feeding — matching the parents' existing Excel structure where possible), then run `npx create-expo-app` once ready.

## Where to pick up (as of 2026-08-10)

All three initial-scope features exist and work: pig counts to corral level,
slaughterhouse loads without duplicate entry, and feed forecasting. The
spreadsheet is imported and the user has seen it on their phone.

**The user has said changes are coming**, so ask before building on top of the
current screens.

Open, roughly in the order that unblocks the most:

0. ~~Photo-scan of pinso delivery notes~~ — done. Built, EAS dev build run,
   APK installed on the parents' Android phone, and **tested on-device with
   real albarans** (two real bugs found and fixed, see the 2026-08-13 entry
   above). `eas.json` and the `app.json` plugin config are committed.
   `android.package` is `com.lluis05.granja` — **change it before any Play
   Store release if you want a different name; it's permanent after that.**
1. **A corrected spreadsheet is coming.** Don't chase data inconsistencies in
   the current one (see the note under Project status). Re-import path:
   `npm run importar` → undo on `/importar` → import.
2. ~~OS notifications for feed~~ — done 2026-08-11 (`src/lib/notificacions.ts`),
   verified working on the phone via Expo Go.
3. **Nothing syncs anywhere.** Supabase is proposed but not set up, so the
   "two surfaces, one dataset" constraint is unmet — the phone and the web
   build each have their own separate database. Every table already carries
   `sincronitzat_el` for this.
4. **Development build (EAS)** exists and is installed on the parents' phone
   (see item 0). Still worth doing eventually: a **new build is needed**
   whenever a native dependency changes (e.g. if worker-login persistence
   gets added via `expo-secure-store`, see the 2026-08-20 entry above) —
   pure-JS changes (screens, queries, most of this session's work) don't
   need a rebuild, `expo start --dev-client --tunnel` picks them up live.
5. ~~Worker login (PIN gate)~~ — done 2026-08-20, see Project status above.
   Was the fourth of the five queued requests; **cens de truges (below) is
   the last one remaining.**
   **Tables still with no screen**: `tractament`, `cens_truges`,
   `factura_pinso`. ~~`entrada_llavores`~~ got one 2026-08-11 (`/llavors`).
   ~~`baixa`~~ got one 2026-08-13 (`/baixa/nova`). ~~`moviment`~~ got one
   2026-08-13 (`/cicle/[id]/moviment/nou`). The rest are imported or
   importable; none can be entered or viewed in the app.
6. **Cens de truges — pick up here next session.** (breeding sow census,
   request 3 from the 2026-08-13 queue) — last of the five queued requests,
   deliberately saved for last since least defined; **explicitly paused on
   2026-08-20** to design "all the missing columns" with the user rather
   than guess at them. Mirrors the Excel's `cens24` sheet: initial count
   from Excel import **and** a manual recount the user does by hand: additions
   from inseminated primals (llavores don't count until first inseminated),
   subtractions from baixes + truges de rebuig, no per-farm split.
7. **Open question in `docs/model-dades.md` §9**: is the delivery-rate
   estimate good enough, or do they want to record the actual silo level now
   and then to correct it?
8. **UI polish, mentioned 2026-08-20, not scoped yet.** The user flagged
   that the app currently looks "vibecodeada" (screens work but look like a
   quick prototype: plain system fonts, the "☰" text character standing in
   for a real icon, ad-hoc spacing) and wants a pass to make it look more
   like a real app. No direction chosen yet — icon library
   (`@expo/vector-icons` isn't installed; adding it is pure JS, no EAS
   rebuild needed), typography, spacing scale, etc. are all open. Lower
   priority than cens de truges; **ask the user for direction before
   picking a visual style**, per this file's usual rule of not assuming
   scope.

## Notes for future sessions
- Always re-read this file at the start of a session in this project.
- Update "Project status" as things change — this is the source of truth for where the project stands between sessions.
- **Verify against real SQLite, not just types.** Every real bug in this project (the cycle-attribution view, the UNIQUE-vs-soft-delete clash, the migration crash, negative corrals, the rounding bias in exits) was caught by running the actual SQL over the actual data in a throwaway `node --experimental-sqlite` script, and none of them by `tsc`. Keep doing that.

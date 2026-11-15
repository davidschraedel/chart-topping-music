# Steering Ladder - Chart-topping Music Data Collection

---

## 1. Problem
Identifying music trends and contrarian creative opportunities requires pairing chart rankings with rich perceptual audio characteristics (BPM, key, mode, energy, danceability, valence). However, official APIs that provide these audio features (specifically Spotify) locked down access for new developer apps in late 2024, open public feeds (like Apple Music RSS) provide rankings with zero audio stats, and unauthenticated APIs (like Deezer) only supply BPM and duration. The only platforms displaying chart rankings alongside full audio features are aggregators like Tunebat and Chosic, which have no public APIs and rely on dynamic client-side rendering.

## 2. Vision
A reliable, automated, and friction-free weekly data collection pipeline that creates the owner's own high-density music dataset—uniting Global 50 chart positions with deep musical features in a single flat, append-only CSV—with zero gated API keys, logins, or imported third-party datasets. Over time, feeding this growing CSV to an LLM reveals what sounds dominate the charts, what sonic spaces are underserved, and where contrarian creative opportunities exist for music producers and songwriters.

## 3. Mission
Build a standalone TypeScript script (`scripts/chart-dataset.ts`, run via `npx tsx scripts/chart-dataset.ts`) that executes weekly to fetch Deezer's public Global 50 chart (Step 1, plain HTTP), enriches new tracks with audio stats from Tunebat via Playwright (Step 2), and appends clean rows to `data/chart_dataset.csv`. The script uses the CSV itself as an in-memory cache so that persistent charting songs are never re-scraped, reducing steady-state Tunebat requests to only ~5–15 per week. Step 2 failure must never break Step 1.

## 4. Strategy (Guiding Policy)
- **Own Dataset, Zero Imports**: Built entirely from scratch via weekly runs. No Kaggle, no Hugging Face, no historical backfill. Current weekly trends matter most.
- **ONE Flat CSV**: All chart and audio data reside together in `data/chart_dataset.csv`. No database, no second table, no joins.
- **Append-Only Immutability**: One row per chart entry per run. Never overwrite old rows. Never duplicate a calendar week unless `--force` is passed.
- **Two-Step Decoupled Pipeline**:
  - *Step 1 (Chart fetch)*: Plain HTTP request to Deezer's public chart (`https://api.deezer.com/chart/0/tracks?limit=50`). No browser overhead. Includes track metadata, duration, ISRC, and `deezer_bpm`.
  - *Step 2 (Enrichment)*: Playwright browser lookup on Tunebat for audio stats. **Step 2 must never block Step 1**. If Tunebat fails or is blocked, chart rows are still written with `enrichment_status = pending` or `error`.
- **The CSV as the Cache**: Load existing CSV rows into memory by `track_id` / `isrc`. If stats exist from an earlier week, copy them into the new row (`enrichment_status = cached`) with zero web requests.
- **Polite Visitor Policy & Bot Defense**:
  - Small enrichment cap per run (default 25).
  - Random 3–8 second pauses between Tunebat lookups.
  - Sequential browser, standard user agent, element waiting (no fixed sleeps).
  - Stop immediately if a CAPTCHA, 403, or block appears. Never bypass or evade anti-bot gates. Mark remaining songs `pending` and write chart rows safely.
- **Source Verification & Trade-off Landscape**:
  | Source | Gives You | Missing | Role in Pipeline |
  | :--- | :--- | :--- | :--- |
  | **Deezer Public API** (`api.deezer.com/chart/0/tracks`) | Global 50 rank, title, artist, duration, ISRC, BPM | Energy, danceability, valence | **Step 1 primary source**. Free, unauthenticated JSON, no browser needed. |
  | **Tunebat** | Audio stats (BPM, key, mode, energy, danceability, valence, acousticness) | Public API | **Step 2 enrichment source**. Scraped via Playwright only for new, uncached tracks. |
  | **Apple Music RSS** | Top songs by country (JSON) | All audio stats | Evaluated; Deezer preferred for Global scope & native BPM/ISRC. |
  | **Billboard** | Rank, artist, title, weeks on chart | All audio stats | Excluded: restrictive terms, anti-bot protection, no audio stats. |
  | **Spotify Web API** | Audio features (historically) | Closed to new apps | Deprecated / returns `403 Forbidden` for new developer apps since Nov 2024. |

## 5. Plan (Phased Milestones)
1. **Phase 1: Feasibility Gates (Report & Wait)**:
   - Gate 1: Inspect Deezer Global 50 endpoint, confirm no auth, print first 5 rows.
   - Gate 2: Confirm Deezer per-track `bpm` and `isrc` presence and quality.
   - Gate 3: Probe Tunebat with 10 songs (test search without login, check if ISRC works, verify stats shown, check for bot challenges).
   - Gate 4: Inspect Tunebat `robots.txt` and terms.
2. **Phase 2: Chart Fetcher & Base CSV**: Fetch Deezer Global 50 and write chart-only rows to `data/chart_dataset.csv`.
3. **Phase 3: Tunebat Parser Probe**: Test Tunebat extraction on 5 songs and verify parsed audio stats.
4. **Phase 4: CSV-as-Cache & Capped Enrichment**: Implement cache lookup and capped Playwright enrichment.
5. **Phase 5: Resilient Error Handling & Diff Report**: Add failure recovery, per-run diff report (movers, new entries, drop-offs), and run summary.
6. **Phase 6: Multi-Run Simulation & Verification**: Verify caching across repeated runs and simulate Step 2 failure.
7. **Phase 7: Scheduling & Cloud Automation**: Set up a free weekly GitHub Actions cron workflow to run the pipeline unattended in the cloud and auto-commit `data/chart_dataset.csv` back to the repository (with local macOS `launchd` / `cron` documented as a fallback).

## 6. State
- **Current Milestone**: Phase 1 - Feasibility Gates
- **Progress**:
  1. **Phase 1 (Feasibility Gates)**: Ready to run Gates 1 & 2 (inspecting Deezer Global 50).
  2. **Phases 2–7**: Queued pending Phase 1 gate approval.
- **Verification**: Architectural decisions approved; Deezer endpoint and Tunebat feasibility tests next.

---

## Understanding Test (5-Year-Old Ladder Diagram)

```text
        ||================================================||
        ||  1. PROBLEM                                    ||
        ||  "We need song rankings AND rich audio stats,  ||
        ||   but APIs are locked and simple feeds lack    ||
        ||   the audio numbers we need."                  ||
        ||================================================||
        ||                       ||                       ||
        ||================================================||
        ||  2. VISION                                     ||
        ||  "Our own growing music table that shows what  ||
        ||   the whole world is listening to every week,  ||
        ||   with zero logins or blocked APIs."           ||
        ||================================================||
        ||                       ||                       ||
        ||================================================||
        ||  3. MISSION                                    ||
        ||  "A script that grabs Deezer's Global 50,      ||
        ||   copies known song stats from our CSV, and    ||
        ||   only asks Tunebat for brand new songs."      ||
        ||================================================||
        ||                       ||                       ||
        ||================================================||
        ||  4. STRATEGY                                   ||
        ||  "One flat table. Chart fetch NEVER breaks.    ||
        ||   CSV is the cache so we only look up 5-15     ||
        ||   songs a week. Polite pauses, no evasion."    ||
        ||================================================||
        ||                       ||                       ||
        ||================================================||
        ||  5. PLAN                                       ||
        ||  "1. Test the gates. 2. Fetch the chart.       ||
        ||   3. Probe Tunebat. 4. Cache & enrich.         ||
        ||   5. Diffs & reports. 6. Double-run test."     ||
        ||================================================||
        ||                       ||                       ||
        ||================================================||
        ||  6. STATE                                      ||
        ||  "Phase 1: Ready to test Deezer Global 50 and  ||
        ||   check Tunebat's doors."                      ||
        ||================================================||
```
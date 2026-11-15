# Steering Ladder - Chart-topping Music Data Collection

---

## 1. Problem
Identifying music trends and contrarian creative opportunities requires pairing chart rankings with rich perceptual audio characteristics (BPM, key, mode, energy, danceability, valence). However, official APIs that provide these audio features (specifically Spotify) locked down access for new developer apps in late 2024, open public feeds (like Apple Music RSS) provide rankings with zero audio stats, and unauthenticated APIs (like Deezer) only supply BPM and duration. The only platforms displaying chart rankings alongside full audio features are aggregators like Tunebat and Chosic, which have no public APIs and rely on dynamic client-side rendering.

## 2. Vision
A reliable, automated, and friction-free weekly data collection pipeline that creates the owner's own high-density music dataset—uniting Global 50 chart positions with deep musical features in a single flat, append-only CSV—with zero gated API keys, logins, or imported third-party datasets. Over time, feeding this growing CSV to an LLM reveals what sounds dominate the charts, what sonic spaces are underserved, and where contrarian creative opportunities exist for music producers and songwriters.

## 3. Mission
Build a standalone TypeScript script (`scripts/chart-dataset.ts`, run via `npm run scrape:charts`) that executes weekly to fetch Deezer's public Global 50 chart (plain HTTP), uses the CSV itself as an in-memory cache to reuse known track metadata (ISRC, duration, BPM) without redundant requests, and appends clean rows to `data/chart_dataset.csv`. The schema preserves audio feature columns for a future direct REST API enrichment phase, while the active pipeline runs browser-free and fully automated via GitHub Actions.

## 4. Strategy (Guiding Policy)
- **Own Dataset, Zero Imports**: Built entirely from scratch via weekly runs. No Kaggle, no Hugging Face, no historical backfill. Current weekly trends matter most.
- **ONE Flat CSV**: All chart and metadata reside together in `data/chart_dataset.csv`. No database, no second table, no joins.
- **Append-Only Immutability**: One row per chart entry per run. Never overwrite old rows. Never duplicate a calendar week unless `--force` is passed.
- **Direct, Browser-Free Pipeline**:
  - *Chart fetch*: Plain HTTP requests to Deezer's public API (`https://api.deezer.com`). No browser overhead, no Cloudflare bottlenecks. Includes track metadata, duration, ISRC, and `deezer_bpm`.
  - *Future-Proof Schema*: Preserves `bpm`, `key`, `energy`, `danceability`, `valence`, `acousticness` columns so a future REST API can plug in without altering table structure.
- **The CSV as the Cache**: Load existing CSV rows into memory by `track_id` / `isrc`. If a song charting this week was already seen, reuse its metadata (`enrichment_status = cached`) with zero extra network requests.
- **Source Verification & Trade-off Landscape**:
  | Source | Gives You | Missing | Role in Pipeline |
  | :--- | :--- | :--- | :--- |
  | **Deezer Public API** (`api.deezer.com/chart/0/tracks`) | Global 50 rank, title, artist, duration, ISRC, BPM | Energy, danceability, valence | **Primary source**. Free, unauthenticated JSON, no browser needed. |
  | **Tunebat / Chosic** | Audio stats | Public API | **Evaluated & dropped**. Blocked by Cloudflare Turnstile bot challenges; scraping abandoned per policy. |
  | **Future REST API** | Audio stats (BPM, key, energy, etc.) | V1 inclusion | **Planned / Optional**. Can plug directly into HTTP pipeline at a later milestone. |
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
- **Current Milestone**: V1 Pipeline Complete (Phases 1–7 Implemented & Verified)
- **Progress**:
  1. **Phase 1 (Feasibility Gates)**: Completed.
  2. **Phase 2 (Chart Fetcher & Base CSV)**: Completed.
  3. **Phase 3 (Tunebat Parser Probe)**: Skipped due to site-wide Cloudflare bot blocks.
  4. **Phase 4 (CSV-as-Cache & Metadata Reuse)**: Completed.
  5. **Phase 5 (Resilient Error Handling & Diff Report)**: Completed.
  6. **Phase 6 (Multi-Run Simulation & Verification)**: Completed.
  7. **Phase 7 (Scheduling & Cloud Automation)**: Completed. Configured `.github/workflows/weekly-chart.yml` with dual-run cron (`0 14 * * 1,3`), automated catch-up logic, and auto-commit back to repository; documented in `README.md`.
- **Verification**: Complete end-to-end pipeline tested locally and ready for GitHub Actions unattended cloud execution.

---

## Understanding Test (5-Year-Old Ladder Diagram)

```text
        ||================================================||
        ||  1. PROBLEM                                    ||
        ||  "We want top song charts every single week,   ||
        ||   without broken scrapers or robot blockers."  ||
        ||================================================||
        ||                       ||                       ||
        ||================================================||
        ||  2. VISION                                     ||
        ||  "Our own growing song catalog saved as a CSV  ||
        ||   that runs smoothly every week forever."      ||
        ||================================================||
        ||                       ||                       ||
        ||================================================||
        ||  3. MISSION                                    ||
        ||  "Fetch Deezer's top 50 songs, track IDs, and  ||
        ||   ISRC codes using fast, free web requests."   ||
        ||================================================||
        ||                       ||                       ||
        ||================================================||
        ||  4. STRATEGY                                   ||
        ||  "No browser bots to get blocked. Direct,      ||
        ||   clean JSON data that works in the cloud."    ||
        ||================================================||
        ||                       ||                       ||
        ||================================================||
        ||  5. PLAN                                       ||
        ||  "1. Gates checked. 2. Build chart collector.  ||
        ||   3. Save weekly CSV. 4. Weekly automation."   ||
        ||================================================||
        ||                       ||                       ||
        ||================================================||
        ||  6. STATE                                      ||
        ||  "V1 pipeline complete! Deezer + cache +       ||
        ||   cloud actions all running smoothly."         ||
        ||================================================||
```
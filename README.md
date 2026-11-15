# Weekly Music Chart Dataset (Own Dataset, Flat CSV)

A standalone TypeScript pipeline that captures weekly snapshots of top music charts into an append-only CSV dataset (`data/chart_dataset.csv`).

The collector gathers chart rankings, song titles, artists, duration, Deezer BPM, and standardized **ISRC** (International Standard Recording Code) identifiers using Deezer's public, unauthenticated API.

The CSV schema includes columns for deep audio characteristics (`bpm`, `key`, `mode`, `energy`, `danceability`, `valence`, `acousticness`), which are preserved for a future direct REST API enrichment phase (such as a music intelligence API), while keeping the current collection pipeline 100% reliable, fast, and browser-free.

This is personal market research. The dataset is created from scratch by running this pipeline.

---

## Decisions Already Made

- **ONE Flat CSV**: No database, no second table, no joins. Each row is self-contained with chart metadata and reserved audio columns together (`data/chart_dataset.csv`).
- **Append-Only Immutability**: One row per chart entry per run. Never overwrite historical rows. Calendar week deduplication prevents duplicate runs unless `--force` is used.
- **Weekly Cadence**: Captures current weekly trends without needing historical backfills.
- **Zero API Keys & Zero Logins**: Uses Deezer's public unauthenticated endpoints (`api.deezer.com`). No logins, passwords, or browser automation required.
- **Browser Scraping Cut**: Probed web aggregators (Tunebat, Chosic) during feasibility gates; both enforce aggressive Cloudflare bot walls. Per project policy (*"Never bypass bot defenses"*), fragile browser scraping was removed to make the pipeline cloud-ready and 100% dependable.
- **Streamlined Execution**: Without browser overhead, each weekly run finishes in **under 2 seconds** and runs smoothly in GitHub Actions.

---

## In-Memory Metadata Cache = The CSV Itself

Song details (ISRC, duration, baseline BPM) do not change once released, and songs often stay on the charts for multiple consecutive weeks:
1. At the start of each run, the pipeline loads `data/chart_dataset.csv` into memory and indexes previously seen songs by `track_id` and `isrc`.
2. For returning songs, metadata is reused instantly (`enrichment_status = cached`) with **zero network requests**.
3. Only songs appearing on the chart for the very first time trigger a lookup to Deezer's track endpoint.
4. Steady-state runs make only **5 to 10 lightweight HTTP requests**, eliminating rate limit risks and finishing near-instantly.

---

## Source & Feasibility Landscape

| Source | Role in Pipeline | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Deezer API** (`api.deezer.com/chart/0/tracks`) | Primary Source | **Active** | Free, unauthenticated JSON. Provides Global Top 50 rank, title, artist, duration, ISRC, and baseline BPM. |
| **Tunebat** | Audio features | **Dropped** | Probed during Gate 3; blocked by site-wide Cloudflare Turnstile challenges. Scraper cut per anti-bot policy. |
| **Chosic** | Audio features | **Dropped** | Probed during Gate 3c; also Cloudflare-protected. Cut to avoid brittle browser workarounds. |
| **Future Data Enrichment** | Audio features | **Planned / Optional** | The CSV schema preserves `bpm`, `key`, `energy`, etc. A free or lightweight REST API (e.g. Sonovault, GetSongBPM, etc.) can be plugged in directly via HTTP in a future milestone. |

---

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- npm

### 2. Environment Setup
Copy the example environment file:

```bash
cp .env.example .env
```

Parameters in `.env`:
```env
CHART_SOURCE="https://api.deezer.com/chart/0/tracks"
CHART_REGION="Global"
MAX_ROWS=50
```

### 3. Install & Run

```bash
# Install dependencies
npm install

# Run weekly chart dataset collector
npm run scrape:charts

# Or run directly with tsx:
npx tsx scripts/chart-dataset.ts

# Bypass week deduplication guard (force re-run on same week):
npx tsx scripts/chart-dataset.ts --force
```

---

## Data & Output

All data is stored locally in the `data/` directory:

- **`data/chart_dataset.csv`**: Append-only master CSV holding all weekly runs.
- **`data/raw/deezer/<YYYY-MM-DD>.json`**: Raw Deezer chart JSON snapshots for auditability.

### Data Schema

Each row in `data/chart_dataset.csv` records:

| Column | Description |
| :--- | :--- |
| `scraped_at` | ISO 8601 timestamp with timezone |
| `chart_source` | Chart provider (e.g. `deezer`) |
| `chart` | Chart name and region (e.g. `Global Top 50`) |
| `rank` | Position on the chart (1–50) |
| `track_id` | Deezer track ID |
| `isrc` | International Standard Recording Code |
| `title` | Song title |
| `artist` | Artist name |
| `duration_seconds` | Song duration in integer seconds |
| `deezer_bpm` | Baseline BPM reported by Deezer (when available) |
| `bpm` | Audio BPM (reserved for future API enrichment) |
| `key` | Musical key (reserved for future API enrichment) |
| `mode` | Modality `Major` / `Minor` (reserved for future API enrichment) |
| `energy` | Energy score (reserved for future API enrichment) |
| `danceability` | Danceability score (reserved for future API enrichment) |
| `valence` | Valence / musical positivity score (reserved for future API enrichment) |
| `acousticness` | Acousticness score (reserved for future API enrichment) |
| `enrichment_status` | `cached` \| `pending` |
| `enrichment_source` | Enrichment provider name (blank in current version) |
| `enrichment_date` | Date enriched (blank in current version) |
| `match_confidence` | `exact_id` \| `normalized_name` \| `fuzzy` (blank in current version) |
| `enrichment_attempts`| Number of enrichment lookup attempts (0 in current version) |

---

## Feasibility Gates (Phase 1 Summary)

1. **Gate 1 — Deezer Global 50 Chart**: PASSED. Returns 50 tracks, no auth, full rank/artist/title/duration.
2. **Gate 2 — Deezer Track Details (ISRC & BPM)**: PASSED. 100% ISRC coverage. BPM field present (often 0 for brand new releases).
3. **Gate 3 / 3c — Aggregator Probes (Tunebat & Chosic)**: CONCLUDED & DROPPED. Both platforms enforce Cloudflare bot walls. Web scraping cut in favor of robust API data.
4. **Gate 4 — Architecture Review**: PASSED. Pipeline locked to clean HTTP data from Deezer + in-memory CSV cache.

---

## Scheduling

### Primary (Recommended): GitHub Actions (Cloud & Free)
Runs completely unattended in the cloud so your local computer can be asleep or turned off:
- **Automatic Dual Schedule**:
  - **Mondays at 14:00 UTC (Primary)**: Captures the new weekly chart snapshot.
  - **Wednesdays at 14:00 UTC (Automatic Catch-Up)**: Acts as a safety net. If Monday's run succeeded, the Wednesday run sees this week is already captured and harmlessly skips (0 duplicate writes). If Monday failed or Deezer had a network outage, Wednesday catches up and commits the missing chart.
- **Auto-Sync to Repo**: Executes the collector and commits the newly appended `data/chart_dataset.csv` and raw JSON snapshots directly back to your repository using `github-actions[bot]`.
- **Failure Notifications**: By default, GitHub automatically emails you if any scheduled workflow fails, and flags the Actions tab with a red failure badge.
- **One-Click Manual Trigger**: You can run the workflow manually at any time by going to **Actions** $\rightarrow$ **Weekly Chart Collector** $\rightarrow$ **Run workflow**.
- **100% Free**: Uses standard Node.js without browser overhead; runs in ~15 seconds per week (using `< 2` of the 2,000 free minutes/month on GitHub private repos).

#### GitHub Repository Variables (Optional)
To customize parameters without modifying code, go to your GitHub repository:
**Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions** $\rightarrow$ **Variables tab** $\rightarrow$ **New repository variable**:
- `CHART_SOURCE`: e.g. `https://api.deezer.com/chart/0/tracks`
- `CHART_REGION`: e.g. `Global`
- `MAX_ROWS`: e.g. `50`

*(If omitted, sensible defaults are automatically used.)*

---

### Backup: Local macOS `cron` or `launchd`
If you prefer running locally on your own machine instead of the cloud:

```cron
# Edit crontab:
crontab -e

# Run every Monday at 9:00 AM:
0 9 * * 1 cd /path/to/chart-topping-music && npm run scrape:charts >> cron.log 2>&1
```

*Note: Your Mac must be awake and powered on at the scheduled run time.*

---

## Data Use Note

This project is intended strictly for personal research. If the dataset is published in the future, review the chart provider's terms regarding data redistribution beforehand.


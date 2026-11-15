# Weekly Music Chart Dataset (Own Dataset, Flat CSV)

A standalone TypeScript script that periodically captures snapshots of top music charts along with song audio characteristics (BPM, key, mode, energy, danceability, valence, acousticness).

Over time, this dataset enables LLM analysis to identify what sounds are currently dominating global charts, what musical elements are missing, and where contrarian creative opportunities exist.

This is personal market research. The dataset is created from scratch by running this script. No Kaggle, Hugging Face, or historical datasets are imported.

---

## Decisions Already Made

- **ONE Flat CSV**: No database, no second table, no joins. Each row is self-contained with chart info and audio stats together (`data/chart_dataset.csv`).
- **Append-Only**: One row per chart entry per run. Never overwrite old rows. Calendar week deduplication prevents duplicate runs unless `--force` is used.
- **Weekly Cadence**: Focuses on current weekly trends without needing historical backfills.
- **Zero API Keys & Zero Logins**: Uses public unauthenticated endpoints (Deezer) and public web pages (Tunebat). No logins, accounts, or cookies.
- **Two-Step Data Flow**: 
  1. Fetch the Global 50 chart from Deezer's public endpoint (plain HTTP fetch).
  2. Enrich uncached songs from Tunebat via Playwright. **Step 2 must never break Step 1.**

---

## Enrichment Cache = The CSV Itself

Audio stats for a track do not change, and songs often stay on charts for weeks:
1. Before querying Tunebat, the script reads `data/chart_dataset.csv` and builds an in-memory cache of `track_id` -> audio stats.
2. For each song already in the CSV, stats are copied instantly (`enrichment_status = cached`) with **zero web requests**.
3. Only new songs with no stats on file hit Tunebat, up to the per-run cap (default 25).
4. Steady-state weekly runs make only **5 to 15 Tunebat requests**, keeping web traffic light and polite.

---

## Source Comparison Landscape

| Source | Gives You | Missing | Role in Pipeline |
| :--- | :--- | :--- | :--- |
| **Deezer API** (`api.deezer.com/chart/0/tracks`) | Rank, title, artist, duration, ISRC, BPM | Energy, danceability, valence | **Step 1 primary source**. Free, unauthenticated JSON, no browser needed. |
| **Tunebat** | Audio stats (BPM, key, mode, energy, danceability, valence, acousticness) | Public API | **Step 2 enrichment source**. Scraped via Playwright only for new, uncached tracks. |
| **Apple Music RSS** | Top songs by country (clean JSON) | All audio stats | Evaluated; Deezer preferred for Global scope & native BPM/ISRC. |
| **Billboard** | Rank, title, artist, weeks on chart, peak | All audio stats | Excluded: restrictive terms, anti-bot protections, and zero audio features. |
| **Spotify Web API** | Full audio features (historically) | Closed to new apps | Deprecated and locked down (`403 Forbidden` on `/v1/audio-features`) for all new developer apps since November 2024. |

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

Configure parameters in `.env`:
```env
CHART_SOURCE="https://api.deezer.com/chart/0/tracks"
CHART_REGION="Global"
MAX_ROWS=50
ENRICHMENT_CAP=25
DELAY_MIN_MS=3000
DELAY_MAX_MS=8000
```
*(The script fails fast if required configuration is missing.)*

### 3. Install & Run

```bash
# Install dependencies
npm install

# Run chart dataset collector
npm run scrape:charts
# or run directly with tsx:
npx tsx scripts/chart-dataset.ts
```

---

## Data & Output

All data is stored locally in the `data/` directory:

- **`data/chart_dataset.csv`**: Append-only master CSV holding all weekly runs.
- **`data/raw/<source>/<date>.json`**: Raw chart JSON responses for verification.
- **`data/raw/<source>/<date>_error.png`**: Screenshots saved if Tunebat encounters an error or bot challenge.

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
| `duration_seconds` | Song duration in seconds |
| `deezer_bpm` | BPM reported by Deezer |
| `bpm` | BPM enriched from Tunebat |
| `key` | Musical key (e.g. `C Major`) |
| `mode` | Modality (e.g. `Major` / `Minor`) |
| `energy` | Energy score |
| `danceability` | Danceability score |
| `valence` | Valence / positivity score |
| `acousticness` | Acousticness score |
| `enrichment_status` | `cached` \| `fetched` \| `pending` \| `not_found` \| `error` |
| `enrichment_source` | `tunebat` (or blank if pending) |
| `enrichment_date` | Date enriched |
| `match_confidence` | `exact_id` \| `normalized_name` \| `fuzzy` |
| `enrichment_attempts`| Number of lookup attempts (max 3) |

---

## Feasibility Gates (Run Before Full Build)

1. **Gate 1**: Confirm Deezer Global 50 chart endpoint, fields, and zero-auth access. Print first 5 rows.
2. **Gate 2**: Confirm Deezer per-track `bpm` and `isrc` lookups.
3. **Gate 3**: Probe Tunebat with 10 songs (test search without login, verify stats display, test bot tolerance).
4. **Gate 4**: Summarize Tunebat terms of service and `robots.txt`.

---

## Scheduling

### Primary (Recommended): GitHub Actions (Cloud & Free)
Runs automatically in the cloud so your computer can be asleep or turned off:
- **100% Free**: Scheduled via a GitHub Actions `cron` workflow (~2–3 minutes/week, using `< 15` of the 2,000 free minutes/month on private repos).
- **Auto-Sync**: Automatically executes the weekly pipeline and commits the newly appended `data/chart_dataset.csv` directly back to your repository.
- **Zero Local Maintenance**: No need to keep your Mac awake or manage local background daemons.

### Backup: Local macOS `cron` or `launchd`
If a target website blocks cloud/datacenter IP addresses, run locally on your own machine instead:
- Scheduled using standard macOS `launchd` or `cron`.
- *Note: Your Mac must be awake and powered on at the scheduled run time.*

---

## Data Use Note

This project is intended strictly for personal research. If the dataset is published in the future, review the chart provider's and Tunebat's terms regarding data redistribution beforehand.


# Weekly Music Chart Dataset

An automated pipeline that captures weekly snapshots of Deezer's Global Top 50 chart into an append-only CSV dataset (`data/chart_dataset.csv`), paired with a dynamic browser dashboard.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Capture this week's chart snapshot
npm run scrape:charts

# 3. View the dashboard locally
npx serve .
# (or open index.html / code.html via any local HTTP server)
```

To re-run within the same calendar week, pass `--force`:
```bash
npx tsx scripts/chart-dataset.ts --force
```

---

## Web Dashboard & GitHub Pages

The repository includes a zero-dependency dynamic web viewer ([index.html](index.html) and styled variant [code.html](code.html)):
- **Dynamic**: Fetches and parses `data/chart_dataset.csv` dynamically on load.
- **Week-by-Week**: Groups entries by calendar week with a quick filter dropdown.
- **Audio Previews**: Audio waveforms link directly to Deezer track previews without external dependencies.
- **GitHub Pages Ready**: Deploys directly from the `main` branch root `/(root)` with `.nojekyll` and cache-busting enabled.

---

## Automated Cloud Scheduling

Runs unattended via GitHub Actions ([.github/workflows/weekly-chart.yml](.github/workflows/weekly-chart.yml)):
- **Schedule**: Mondays at 14:00 UTC (with an automatic catch-up check on Wednesdays).
- **Auto-Commit**: Appends new weekly rows and raw JSON snapshots directly back to `main`.
- **Manual Trigger**: Can be dispatched on demand anytime from GitHub's **Actions** tab.

---

## Dataset Schema (`data/chart_dataset.csv`)

One flat, append-only CSV with in-memory caching. Historical rows are never overwritten.

| Field | Description |
| :--- | :--- |
| `scraped_at` | ISO 8601 timestamp with timezone |
| `chart_source`, `chart` | Source provider (`deezer`) and chart name (`Global Top 50`) |
| `rank` | Chart position (1–50) |
| `track_id`, `isrc` | Deezer track ID and standardized ISRC code |
| `title`, `artist` | Track title and artist name |
| `duration_seconds` | Track duration in integer seconds |
| `deezer_bpm` | Baseline BPM reported by Deezer (when available) |
| `bpm`, `key`, `mode`, `energy`, `danceability`, `valence`, `acousticness` | Reserved for future audio feature REST API enrichment |
| `enrichment_status` | `pending` \| `cached` |

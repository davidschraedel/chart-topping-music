# Chart Snapshot Scraper (Music Trend Research)

A simple TypeScript Playwright script that periodically captures snapshots of top music charts along with song audio characteristics (BPM, key, energy, danceability, etc.). 

Over time, this dataset enables LLM analysis to identify what sounds are currently dominating the charts, what musical elements are missing, and where contrarian creative opportunities exist.

---

## Why Scraping?

- **Zero API keys & Zero logins:** Spotify's audio features API is heavily restricted for new apps. This project reads public web chart pages just like a normal visitor.
- **Personal research:** Focuses on current weekly trends without needing historical backfills.

---

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- npm

### 2. Environment Setup
Copy the example environment file and fill in target chart URLs:

```bash
cp .env.example .env
```

Define the chart URLs in `.env`:
```env
tunebatChartUrl=
chosicChartUrl=
```
*(The script fails fast if required URLs are not set.)*

### 3. Install & Run

```bash
# Install dependencies
npm install

# Run chart scraper
npm run scrape:charts
```

---

## Data & Output

All data is stored locally in the `data/` directory:

- **`data/chart_snapshots.csv`**: Append-only master CSV holding all weekly runs.
- **`data/raw/<source>/<date>.html`**: Raw HTML and debug screenshots for verification and parser recovery.

### Data Schema

Each row in `chart_snapshots.csv` records:

| Column | Description |
| :--- | :--- |
| `scraped_at` | ISO 8601 timestamp with timezone |
| `source` | Source website (e.g. Tunebat, Chosic, Wikipedia) |
| `chart` | Chart name, genre, and region |
| `chart_date` | Date reported by the source (if displayed) |
| `rank` | Chart position |
| `title` | Song title |
| `artist` | Artist name |
| `bpm` | Beats per minute |
| `key` | Musical key |
| `duration_seconds` | Song duration in seconds |
| `energy` | Energy score |
| `danceability` | Danceability score |
| `valence` | Valence / musical positiveness score |
| `acousticness` | Acousticness score |
| `track_url` | Link to track page (optional) |

---

## How It Works

1. **Scrapes Public Charts:** Loads configured URLs via Playwright (Chromium) and waits for table rows to render.
2. **Normalizes Data:** Converts durations to seconds, strips symbols like `%`, and handles missing values cleanly.
3. **Appends to CSV:** Safely appends valid rows to `data/chart_snapshots.csv` without overwriting historical runs.
4. **Run Diffs:** Compares the latest run to the prior snapshot for the same chart and prints new entries, drop-offs, and notable rank movers.
5. **Fails Loudly:** Aborts and writes nothing if a table fails to load or row counts are unexpectedly low, saving HTML and a screenshot for troubleshooting.

---

## Scheduling

### Primary (Recommended): GitHub Actions (Cloud & Free)
Runs automatically in the cloud so your Mac can be asleep or turned off:
- **100% Free:** Scheduled via a GitHub Actions cron workflow (~1–2 minutes/week, using almost none of the 2,000 free minutes/month on private repos).
- **Private:** Chart URLs are stored securely as GitHub Actions Secrets.
- **Auto-Sync:** Runs the scraper and commits the newly appended `data/chart_snapshots.csv` directly back to your repository.

### Backup: Local macOS `cron` or `launchd`
If a target website blocks cloud/datacenter IP addresses, run locally on your own machine instead:
- Scheduled using standard macOS `cron` or `launchd`.
- **Note:** Your Mac must be awake and powered on at the scheduled run time.


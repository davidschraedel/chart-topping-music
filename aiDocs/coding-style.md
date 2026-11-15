# Engineering Conventions & Coding Style

Standards and conventions for the **Chart-topping Music Data Collection** codebase.

---

## 1. General Principles

- **TypeScript Strict Mode**: Enable strict null checks and avoid `any`. Define explicit interfaces for chart entries and enrichment records.
- **Fail-Loud Data Pipelines**: If the chart fetch returns fewer than ~40 rows or has missing critical fields, fail fast and write nothing.
- **Future-Proof Two-Step Architecture**: Any future audio feature enrichment must never block base chart storage. Chart rows are always written to the CSV regardless of enrichment availability.
- **Append-Only Immutability**: Historical rows in `data/chart_dataset.csv` are never overwritten. Runs are deduplicated by calendar week and chart name unless `--force` is provided.

---

## 2. Enrichment & Matching Rules

- **CSV-as-Cache**: Load existing CSV records into memory before triggering any external network lookups. Key cached records by `track_id` and `isrc`.
- **Matching Priority**:
  1. Prefer exact identifier matches (ISRC or Deezer track ID).
  2. Fall back to normalized title and artist comparison (lowercase, strip "feat.", parentheticals, and punctuation).
- **Match Confidence**: Record `match_confidence` (`exact_id`, `normalized_name`, or `fuzzy`). If ambiguous, mark `not_found` and keep the chart row. Wrong stats are worse than empty stats.
- **Retry Cap**: Increment `enrichment_attempts`. Never retry after 3 failed attempts.

---

## 3. Data Schema & Types

```typescript
export type EnrichmentStatus = 'cached' | 'fetched' | 'pending' | 'not_found' | 'error';
export type MatchConfidence = 'exact_id' | 'normalized_name' | 'fuzzy';

export interface ChartEntry {
  // Chart metadata (always populated)
  scraped_at: string;             // ISO 8601 with timezone (e.g. 2026-11-14T14:00:00Z)
  chart_source: string;           // e.g. 'deezer'
  chart: string;                  // e.g. 'Global Top 50'
  rank: number;                   // 1-indexed position (1-50)
  track_id: string;               // Source track ID (e.g. Deezer track ID)
  isrc?: string;                  // International Standard Recording Code
  title: string;                  // Clean song title
  artist: string;                 // Artist name
  duration_seconds: number;       // Duration in integer seconds
  deezer_bpm?: number;            // Baseline BPM from Deezer track lookup

  // Audio stats (reserved for future API enrichment, empty in current V1)
  bpm?: number;                   // BPM reported by enrichment provider
  key?: string;                   // Musical key (e.g. 'C Major', 'F# Minor')
  mode?: string;                  // 'Major' | 'Minor'
  energy?: number;                // Perceptual energy score
  danceability?: number;          // Danceability score
  valence?: number;               // Valence / musical positivity score
  acousticness?: number;          // Acousticness score

  // Enrichment bookkeeping
  enrichment_status: EnrichmentStatus;
  enrichment_source?: string;     // Enrichment provider name (or blank if pending)
  enrichment_date?: string;       // ISO 8601 timestamp of enrichment
  match_confidence?: MatchConfidence;
  enrichment_attempts: number;    // Number of lookup attempts (cap at 3)
}
```

---

## 4. Bot Defense & API Integration Rules

- **Strict No-Evasion Policy**: Do not use stealth plugins, proxy rotation, or CAPTCHA solving. If a platform requires automated access evasion, it is dropped from the pipeline.
- **REST APIs Preferred**: Any future enrichment should integrate via direct, structured REST APIs using standard `fetch()`, avoiding browser automation overhead.
- **Fail-Safe Decoupling**: If an external enrichment API fails or experiences downtime, chart entries must still be safely stored with `enrichment_status = 'pending'`.

---

## 5. Storage & CLI Conventions

- **CSV Serialization**: Use `csv-parse` and `csv-stringify` to handle quotes, commas, and formatting safely.
- **Standalone Execution**: Execute via `npx tsx scripts/chart-dataset.ts` or `npm run scrape:charts`.
- **Configuration**: Load settings via `dotenv` from `.env`. Fail immediately if required parameters are missing.

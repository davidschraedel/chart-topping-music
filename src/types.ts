export type EnrichmentStatus = 'cached' | 'fetched' | 'pending' | 'not_found' | 'error';
export type MatchConfidence = 'exact_id' | 'normalized_name' | 'fuzzy';

export interface ChartEntry {
  // Chart metadata (always populated)
  scraped_at: string;             // ISO 8601 with timezone (e.g. 2026-11-14T14:00:00.000Z)
  chart_source: string;           // e.g. 'deezer'
  chart: string;                  // e.g. 'Global Top 50'
  rank: number;                   // 1-indexed position (1-50)
  track_id: string;               // Source track ID (e.g. Deezer track ID)
  isrc?: string;                  // International Standard Recording Code
  title: string;                  // Clean song title
  artist: string;                 // Artist name
  duration_seconds: number;       // Duration in integer seconds
  deezer_bpm?: number;            // Baseline BPM from Deezer track lookup

  // Audio stats (from enrichment provider when available, else empty)
  bpm?: number;                   // BPM reported by enrichment provider
  key?: string;                   // Musical key (e.g. 'C Major', 'F# Minor')
  mode?: string;                  // 'Major' | 'Minor'
  energy?: number;                // Perceptual energy score
  danceability?: number;          // Danceability score
  valence?: number;               // Valence / musical positivity score
  acousticness?: number;          // Acousticness score

  // Enrichment bookkeeping
  enrichment_status: EnrichmentStatus;
  enrichment_source?: string;     // Enrichment source (or empty if pending)
  enrichment_date?: string;       // ISO 8601 timestamp of enrichment
  match_confidence?: MatchConfidence;
  enrichment_attempts: number;    // Number of lookup attempts (cap at 3)
}

export const CSV_COLUMNS: (keyof ChartEntry)[] = [
  'scraped_at',
  'chart_source',
  'chart',
  'rank',
  'track_id',
  'isrc',
  'title',
  'artist',
  'duration_seconds',
  'deezer_bpm',
  'bpm',
  'key',
  'mode',
  'energy',
  'danceability',
  'valence',
  'acousticness',
  'enrichment_status',
  'enrichment_source',
  'enrichment_date',
  'match_confidence',
  'enrichment_attempts',
];


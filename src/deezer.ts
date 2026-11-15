import * as fs from 'fs';
import * as path from 'path';
import { ChartEntry } from './types';

interface DeezerChartArtist {
  id: number;
  name: string;
}

interface DeezerChartTrack {
  id: number;
  title: string;
  duration: number;
  artist: DeezerChartArtist;
  position?: number;
}

interface DeezerChartResponse {
  data: DeezerChartTrack[];
  total?: number;
}

interface DeezerTrackDetail {
  id: number;
  title: string;
  bpm?: number;
  isrc?: string;
  duration?: number;
}

export interface FetchDeezerOptions {
  chartUrl?: string;
  chartName?: string;
  maxRows?: number;
  rawOutputDir?: string;
}

/**
 * Fetch Deezer Global chart and enrich each entry with per-track details (ISRC, deezer_bpm).
 */
export async function fetchDeezerChart(options?: FetchDeezerOptions): Promise<{
  entries: ChartEntry[];
  rawJson: DeezerChartResponse;
  rawFilePath?: string;
}> {
  let chartUrl = options?.chartUrl || process.env.CHART_SOURCE || 'https://api.deezer.com/chart/0/tracks?limit=50';
  const region = process.env.CHART_REGION || 'Global';
  const chartName = options?.chartName || `${region} Top 50`;
  const maxRows = options?.maxRows || Number(process.env.MAX_ROWS) || 50;

  // Ensure limit parameter is present so Deezer returns full chart rather than defaulting to 10
  if (!chartUrl.includes('limit=')) {
    const separator = chartUrl.includes('?') ? '&' : '?';
    chartUrl = `${chartUrl}${separator}limit=${maxRows}`;
  }

  console.log(`Fetching chart from Deezer: ${chartUrl}`);
  const res = await fetch(chartUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch Deezer chart: HTTP ${res.status} ${res.statusText}`);
  }

  const rawJson = (await res.json()) as DeezerChartResponse;

  if (!rawJson.data || !Array.isArray(rawJson.data)) {
    throw new Error('Deezer chart response missing `data` array');
  }

  const tracks = rawJson.data.slice(0, maxRows);

  // Fail-fast validation
  if (tracks.length < 40) {
    throw new Error(`Fail-fast validation failed: Expected at least 40 tracks, received ${tracks.length}`);
  }

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const rank = i + 1;
    if (!rank || !t.title || !t.artist?.name) {
      throw new Error(`Fail-fast validation failed at row ${rank}: missing critical field (rank=${rank}, title="${t?.title}", artist="${t?.artist?.name}")`);
    }
  }

  const now = new Date();
  const scrapedAt = now.toISOString();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // Save raw response to data/raw/deezer/<YYYY-MM-DD>.json
  const rawDir = options?.rawOutputDir || path.resolve(process.cwd(), 'data', 'raw', 'deezer');
  let rawFilePath: string | undefined;
  try {
    fs.mkdirSync(rawDir, { recursive: true });
    rawFilePath = path.join(rawDir, `${dateStr}.json`);
    fs.writeFileSync(rawFilePath, JSON.stringify(rawJson, null, 2), 'utf8');
    console.log(`Saved raw Deezer JSON capture to ${rawFilePath}`);
  } catch (err) {
    console.warn(`Warning: Could not save raw Deezer capture: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fetch per-track detail (ISRC, BPM) with polite pacing/concurrency
  console.log(`Fetching track details (ISRC, BPM) for ${tracks.length} tracks…`);
  const entries: ChartEntry[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const rank = i + 1;
    let detail: DeezerTrackDetail | undefined;

    try {
      const detailRes = await fetch(`https://api.deezer.com/track/${track.id}`);
      if (detailRes.ok) {
        detail = (await detailRes.json()) as DeezerTrackDetail;
      }
    } catch {
      // Deezer track detail fetch is best-effort per track
    }

    entries.push({
      scraped_at: scrapedAt,
      chart_source: 'deezer',
      chart: chartName,
      rank,
      track_id: String(track.id),
      isrc: detail?.isrc || undefined,
      title: track.title,
      artist: track.artist.name,
      duration_seconds: track.duration,
      deezer_bpm: detail?.bpm && detail.bpm > 0 ? detail.bpm : undefined,

      // Audio stats left undefined for Phase 2 base chart
      bpm: undefined,
      key: undefined,
      mode: undefined,
      energy: undefined,
      danceability: undefined,
      valence: undefined,
      acousticness: undefined,

      enrichment_status: 'pending',
      enrichment_source: undefined,
      enrichment_date: undefined,
      match_confidence: undefined,
      enrichment_attempts: 0,
    });
  }

  return { entries, rawJson, rawFilePath };
}

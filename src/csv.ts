import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { ChartEntry, CSV_COLUMNS } from './types';

/**
 * Returns ISO 8601 week string for a given date, e.g. "2026-W46".
 */
export function getIsoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Checks if a given ISO week and chart source already exist in historical rows.
 */
export function hasDuplicateWeek(
  existingRows: ChartEntry[],
  targetWeekId: string,
  chartSource: string
): boolean {
  return existingRows.some(row => {
    if (row.chart_source !== chartSource) return false;
    const rowDate = new Date(row.scraped_at);
    if (isNaN(rowDate.getTime())) return false;
    return getIsoWeekId(rowDate) === targetWeekId;
  });
}

/**
 * Load existing CSV rows. Returns an empty array if the file does not exist.
 */
export async function loadCsv(filePath: string): Promise<ChartEntry[]> {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) {
    return [];
  }

  return new Promise((resolve, reject) => {
    parse(
      content,
      {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      },
      (err, records: Record<string, string>[]) => {
        if (err) return reject(err);

        const entries: ChartEntry[] = records.map(r => ({
          scraped_at: r.scraped_at || '',
          chart_source: r.chart_source || '',
          chart: r.chart || '',
          rank: Number(r.rank) || 0,
          track_id: r.track_id || '',
          isrc: r.isrc || undefined,
          title: r.title || '',
          artist: r.artist || '',
          duration_seconds: Number(r.duration_seconds) || 0,
          deezer_bpm: r.deezer_bpm ? Number(r.deezer_bpm) : undefined,
          bpm: r.bpm ? Number(r.bpm) : undefined,
          key: r.key || undefined,
          mode: r.mode || undefined,
          energy: r.energy ? Number(r.energy) : undefined,
          danceability: r.danceability ? Number(r.danceability) : undefined,
          valence: r.valence ? Number(r.valence) : undefined,
          acousticness: r.acousticness ? Number(r.acousticness) : undefined,
          enrichment_status: (r.enrichment_status as ChartEntry['enrichment_status']) || 'pending',
          enrichment_source: r.enrichment_source || undefined,
          enrichment_date: r.enrichment_date || undefined,
          match_confidence: (r.match_confidence as ChartEntry['match_confidence']) || undefined,
          enrichment_attempts: Number(r.enrichment_attempts) || 0,
        }));

        resolve(entries);
      }
    );
  });
}

/**
 * Appends rows to CSV file using csv-stringify.
 * Never overwrites historical rows; creates header on first creation.
 */
export async function appendCsv(filePath: string, newRows: ChartEntry[]): Promise<void> {
  if (newRows.length === 0) return;

  const fileExists = fs.existsSync(filePath);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dataToFormat = newRows.map(row => {
    const record: Record<string, string | number> = {};
    for (const col of CSV_COLUMNS) {
      const val = row[col];
      record[col] = val !== undefined && val !== null ? val : '';
    }
    return record;
  });

  return new Promise((resolve, reject) => {
    stringify(
      dataToFormat,
      {
        header: !fileExists,
        columns: CSV_COLUMNS as string[],
      },
      (err, output) => {
        if (err) return reject(err);
        try {
          fs.appendFileSync(filePath, output, 'utf8');
          resolve();
        } catch (writeErr) {
          reject(writeErr);
        }
      }
    );
  });
}


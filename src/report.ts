import { ChartEntry } from './types';
import { getIsoWeekId } from './csv';

export interface DiffReport {
  weekId: string;
  totalWritten: number;
  newEntries: ChartEntry[];
  returning: ChartEntry[];
  dropOffs: { track_id: string; title: string; artist: string; rank?: number }[];
  cacheHits: number;
  freshLookups: number;
}

/**
 * Builds a differential report comparing historical CSV rows against this week's new rows.
 *
 * - New entries: tracks in this run that have never appeared in any prior week.
 * - Returning: tracks in this run that have appeared in an earlier week.
 * - Drop-offs: tracks that were present in the immediate previous week's chart, but are no longer in this week's chart.
 */
export function buildDiffReport(
  prevRows: ChartEntry[],
  newRows: ChartEntry[],
  meta?: { weekId: string; cacheHits: number; freshLookups: number }
): DiffReport {
  const weekId = meta?.weekId || (newRows[0] ? getIsoWeekId(new Date(newRows[0].scraped_at)) : 'Unknown');

  // Set of all historical track IDs ever seen across all previous runs
  const allHistoricalTrackIds = new Set(prevRows.map(r => r.track_id));

  // Determine the most recent previous week ID from prevRows
  const previousWeekIds = Array.from(
    new Set(
      prevRows
        .map(r => {
          const d = new Date(r.scraped_at);
          return isNaN(d.getTime()) ? null : getIsoWeekId(d);
        })
        .filter((w): w is string => Boolean(w) && w !== weekId)
    )
  ).sort();

  const lastWeekId = previousWeekIds.length > 0 ? previousWeekIds[previousWeekIds.length - 1] : null;

  // Tracks present in the immediate previous week
  const lastWeekTracks = lastWeekId
    ? prevRows.filter(r => {
        const d = new Date(r.scraped_at);
        return !isNaN(d.getTime()) && getIsoWeekId(d) === lastWeekId;
      })
    : [];

  const currentTrackIdSet = new Set(newRows.map(r => r.track_id));

  // 1. New entries (never seen in history before)
  const newEntries = newRows.filter(r => !allHistoricalTrackIds.has(r.track_id));

  // 2. Returning entries (seen in at least one prior week)
  const returning = newRows.filter(r => allHistoricalTrackIds.has(r.track_id));

  // 3. Drop-offs (present in last week, but missing this week)
  const dropOffs = lastWeekTracks
    .filter(r => !currentTrackIdSet.has(r.track_id))
    .map(r => ({
      track_id: r.track_id,
      title: r.title,
      artist: r.artist,
      rank: r.rank,
    }));

  return {
    weekId,
    totalWritten: newRows.length,
    newEntries,
    returning,
    dropOffs,
    cacheHits: meta?.cacheHits ?? 0,
    freshLookups: meta?.freshLookups ?? 0,
  };
}

/**
 * Print human-readable summary of the diff report to stdout.
 */
export function printReport(report: DiffReport): void {
  console.log(`\n=== Weekly Chart Run — ${report.weekId} ===`);
  console.log(`Chart rows written: ${report.totalWritten}`);
  console.log(`  ↑ New entries:    ${String(report.newEntries.length).padEnd(4)} (songs not seen in previous runs)`);
  console.log(`  ↔ Returning:      ${String(report.returning.length).padEnd(4)} (songs already in historical dataset)`);
  console.log(`  ↓ Drop-offs:      ${String(report.dropOffs.length).padEnd(4)} (last week's songs no longer on chart)`);
  console.log('Metadata:');
  console.log(`  📋 Cached:        ${String(report.cacheHits).padEnd(4)} (track metadata reused from CSV)`);
  console.log(`  🌐 Fresh lookups: ${String(report.freshLookups).padEnd(4)} (new track details retrieved)`);

  if (report.newEntries.length > 0 && report.newEntries.length <= 10) {
    console.log('\nNew Additions This Week:');
    report.newEntries.forEach(e => {
      console.log(`  + #${e.rank} "${e.title}" — ${e.artist}`);
    });
  }

  if (report.dropOffs.length > 0 && report.dropOffs.length <= 10) {
    console.log('\nSongs Dropped From Last Week:');
    report.dropOffs.forEach(d => {
      console.log(`  - Was #${d.rank ?? '?'} "${d.title}" — ${d.artist}`);
    });
  }
}


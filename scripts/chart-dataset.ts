/**
 * Main Pipeline Entry Point — Chart-Topping Music Data Collector
 *
 * Usage:
 *   npx tsx scripts/chart-dataset.ts
 *   npx tsx scripts/chart-dataset.ts --force
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { fetchDeezerChart } from '../src/deezer';
import { loadCsv, appendCsv, getIsoWeekId, hasDuplicateWeek } from '../src/csv';
import { buildCache } from '../src/cache';
import { buildDiffReport, printReport } from '../src/report';
import { ChartEntry } from '../src/types';

dotenv.config();

const CSV_PATH = path.resolve(process.cwd(), 'data', 'chart_dataset.csv');

async function main(): Promise<void> {
  const isForce = process.argv.includes('--force');
  const now = process.env.SIMULATE_DATE ? new Date(process.env.SIMULATE_DATE) : new Date();
  const currentWeekId = getIsoWeekId(now);
  const chartSource = 'deezer';

  console.log('=== Chart-Topping Music Pipeline ===');
  console.log(`Execution Time: ${now.toISOString()}`);
  console.log(`Target Week ID: ${currentWeekId}`);
  if (isForce) {
    console.log('Mode: --force enabled (week-deduplication guard bypassed)');
  }
  if (process.env.SIMULATE_DATE) {
    console.log(`Simulation: SIMULATE_DATE is active (${process.env.SIMULATE_DATE})`);
  }

  // 1. Load existing CSV data to verify history and enforce deduplication
  const existingRows = await loadCsv(CSV_PATH);
  console.log(`Existing CSV records loaded: ${existingRows.length}`);

  // Build in-memory metadata cache from existing CSV
  const cache = buildCache(existingRows);
  if (cache.size > 0) {
    console.log(`Metadata cache active: ${cache.size} distinct tracks indexed.`);
  }

  // 2. Week-deduplication guard
  if (!isForce && hasDuplicateWeek(existingRows, currentWeekId, chartSource)) {
    console.log(`\n⏸ Run skipped: Chart data for week "${currentWeekId}" from "${chartSource}" is already present in dataset.`);
    console.log('Use "--force" to bypass this check and append anyway.');
    return;
  }

  // 3. Fetch Deezer Chart and per-track details (ISRC, BPM), wrapped for resilient error handling
  console.log('\n--- Step 1: Fetching Chart Data ---');
  let entries: ChartEntry[];
  let rawFilePath: string | undefined;
  let cacheHits = 0;
  let cacheMisses = 0;

  try {
    const result = await fetchDeezerChart({ cache });
    entries = result.entries;
    rawFilePath = result.rawFilePath;
    cacheHits = result.cacheHits;
    cacheMisses = result.cacheMisses;

    // Override scraped_at if simulating a specific date
    if (process.env.SIMULATE_DATE) {
      entries.forEach(e => {
        e.scraped_at = now.toISOString();
      });
    }
  } catch (fetchErr) {
    console.error('\n❌ Step 1 (Deezer Fetch) Failed. Aborting without modifying CSV.');
    console.error(`Error details: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
    process.exit(1);
  }

  console.log(`Successfully retrieved and validated ${entries.length} chart entries.`);

  // 4. Append rows to CSV
  console.log('\n--- Step 2: Storing to Dataset ---');
  try {
    await appendCsv(CSV_PATH, entries);
    console.log(`Appended ${entries.length} rows to ${CSV_PATH}`);
  } catch (csvErr) {
    console.error('\n❌ Step 2 (CSV Storage) Failed.');
    console.error(`Error details: ${csvErr instanceof Error ? csvErr.message : String(csvErr)}`);
    process.exit(1);
  }

  // 5. Output Diff Report and Run Summary
  const diffReport = buildDiffReport(existingRows, entries, {
    weekId: currentWeekId,
    cacheHits,
    freshLookups: cacheMisses,
  });

  printReport(diffReport);

  console.log('\n=== Storage Summary ===');
  console.log(`Status: SUCCESS`);
  console.log(`Raw Capture:      ${rawFilePath || 'n/a'}`);
  console.log(`Total Dataset:    ${existingRows.length + entries.length} rows`);
}

main().catch(err => {
  console.error('\n❌ Unhandled Pipeline Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});



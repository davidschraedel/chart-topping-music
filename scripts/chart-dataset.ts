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

dotenv.config();

const CSV_PATH = path.resolve(process.cwd(), 'data', 'chart_dataset.csv');

async function main(): Promise<void> {
  const isForce = process.argv.includes('--force');
  const now = new Date();
  const currentWeekId = getIsoWeekId(now);
  const chartSource = 'deezer';

  console.log('=== Chart-Topping Music Pipeline ===');
  console.log(`Execution Time: ${now.toISOString()}`);
  console.log(`Target Week ID: ${currentWeekId}`);
  if (isForce) {
    console.log('Mode: --force enabled (week-deduplication guard bypassed)');
  }

  // 1. Load existing CSV data to verify history and enforce deduplication
  const existingRows = await loadCsv(CSV_PATH);
  console.log(`Existing CSV records loaded: ${existingRows.length}`);

  // 2. Week-deduplication guard
  if (!isForce && hasDuplicateWeek(existingRows, currentWeekId, chartSource)) {
    console.log(`\n⏸ Run skipped: Chart data for week "${currentWeekId}" from "${chartSource}" is already present in dataset.`);
    console.log('Use "--force" to bypass this check and append anyway.');
    return;
  }

  // 3. Fetch Deezer Chart and per-track details (ISRC, BPM)
  console.log('\n--- Step 1: Fetching Chart Data ---');
  const { entries, rawFilePath } = await fetchDeezerChart();

  console.log(`Successfully retrieved and validated ${entries.length} chart entries.`);

  // 4. Append rows to CSV
  console.log('\n--- Step 2: Storing to Dataset ---');
  await appendCsv(CSV_PATH, entries);
  console.log(`Appended ${entries.length} rows to ${CSV_PATH}`);

  // 5. Output Run Summary
  console.log('\n=== Run Summary ===');
  console.log(`Status: SUCCESS`);
  console.log(`Week ID:          ${currentWeekId}`);
  console.log(`Timestamp:        ${entries[0]?.scraped_at || now.toISOString()}`);
  console.log(`Rows Written:     ${entries.length}`);
  console.log(`Raw Capture:      ${rawFilePath || 'n/a'}`);
  console.log(`Total Dataset:    ${existingRows.length + entries.length} rows`);

  console.log('\nTop 5 Tracks Written:');
  entries.slice(0, 5).forEach(e => {
    console.log(`  #${e.rank} "${e.title}" — ${e.artist} (ISRC: ${e.isrc || 'n/a'}, Duration: ${e.duration_seconds}s)`);
  });
}

main().catch(err => {
  console.error('\n❌ Pipeline Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});


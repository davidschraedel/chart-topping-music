/**
 * Gate 2 — Deezer Per-Track BPM & ISRC Feasibility Probe
 *
 * Pass criteria:
 *   - `bpm` field is present and non-zero on most tracks (some 0 is acceptable)
 *   - `isrc` field is present on most tracks
 *
 * Fetches the first 10 track IDs from the chart endpoint,
 * then hits https://api.deezer.com/track/{id} for each.
 *
 * Run: npx tsx scripts/feasibility/gate2-deezer-track.ts
 */

const CHART_ENDPOINT = 'https://api.deezer.com/chart/0/tracks?limit=50';
const TRACK_ENDPOINT = (id: number) => `https://api.deezer.com/track/${id}`;
const PROBE_COUNT = 10;

interface DeezerChartTrack {
  id: number;
  title: string;
  artist: { name: string };
}

interface DeezerChartResponse {
  data: DeezerChartTrack[];
}

interface DeezerTrackDetail {
  id: number;
  title: string;
  bpm?: number;
  isrc?: string;
  duration?: number;
  artist?: { name: string };
}

async function fetchChartIds(): Promise<number[]> {
  const res = await fetch(CHART_ENDPOINT);
  if (res.status !== 200) {
    throw new Error(`Chart endpoint returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as DeezerChartResponse;
  if (!json.data || !Array.isArray(json.data)) {
    throw new Error('Chart response missing data array');
  }
  return json.data.slice(0, PROBE_COUNT).map(t => t.id);
}

async function fetchTrackDetail(id: number): Promise<DeezerTrackDetail> {
  const res = await fetch(TRACK_ENDPOINT(id));
  if (res.status !== 200) {
    throw new Error(`Track ${id} returned HTTP ${res.status}`);
  }
  return (await res.json()) as DeezerTrackDetail;
}

async function runGate2(): Promise<void> {
  console.log('=== Gate 2 — Deezer Per-Track BPM & ISRC ===\n');

  console.log(`Fetching first ${PROBE_COUNT} chart track IDs from chart endpoint…`);
  const ids = await fetchChartIds();
  console.log('Track IDs:', ids.join(', '), '\n');

  let bpmPresent = 0;
  let bpmNonZero = 0;
  let isrcPresent = 0;

  console.log('--- Track Detail Results ---');
  for (const id of ids) {
    const track = await fetchTrackDetail(id);

    const hasBpm = track.bpm !== undefined && track.bpm !== null;
    const isNonZeroBpm = hasBpm && track.bpm !== 0;
    const hasIsrc = typeof track.isrc === 'string' && track.isrc.length > 0;

    if (hasBpm) bpmPresent++;
    if (isNonZeroBpm) bpmNonZero++;
    if (hasIsrc) isrcPresent++;

    const bpmLabel = hasBpm ? (isNonZeroBpm ? `${track.bpm}` : '0 (zero)') : 'MISSING';
    const isrcLabel = hasIsrc ? track.isrc! : 'MISSING';

    console.log(
      `  [${id}] "${track.title}" — ${track.artist?.name ?? 'unknown'}` +
        `  |  BPM: ${bpmLabel}  |  ISRC: ${isrcLabel}`
    );
  }

  console.log('\n--- Summary ---');
  console.log(`  BPM field present:   ${bpmPresent}/${PROBE_COUNT}`);
  console.log(`  BPM non-zero:        ${bpmNonZero}/${PROBE_COUNT}`);
  console.log(`  ISRC field present:  ${isrcPresent}/${PROBE_COUNT}`);

  // Pass threshold: "most" = more than half
  const threshold = Math.ceil(PROBE_COUNT / 2);
  const bpmOk = bpmPresent >= threshold;
  const isrcOk = isrcPresent >= threshold;

  if (!bpmOk || !isrcOk) {
    const reasons: string[] = [];
    if (!bpmOk) reasons.push(`bpm present on only ${bpmPresent}/${PROBE_COUNT} tracks`);
    if (!isrcOk) reasons.push(`isrc present on only ${isrcPresent}/${PROBE_COUNT} tracks`);
    throw new Error(`FAIL: ${reasons.join('; ')}`);
  }

  console.log('\n✅  GATE 2 PASSED');
  console.log(`    BPM and ISRC are present on most tracks. Pipeline can rely on these fields.`);
}

runGate2().catch(err => {
  console.error('\n❌  GATE 2 FAILED:', err.message);
  process.exit(1);
});


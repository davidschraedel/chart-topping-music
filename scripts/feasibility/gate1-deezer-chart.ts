/**
 * Gate 1 — Deezer Global 50 Endpoint Feasibility Probe
 *
 * Pass criteria:
 *   - HTTP 200, no authentication required
 *   - Response `data` array has ≥ 40 tracks
 *   - Each track has: id, title, artist.name, duration
 *
 * Run: npx tsx scripts/feasibility/gate1-deezer-chart.ts
 */

const ENDPOINT = 'https://api.deezer.com/chart/0/tracks?limit=50';

interface DeezerArtist {
  id: number;
  name: string;
}

interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  artist: DeezerArtist;
  isrc?: string;
  bpm?: number;
}

interface DeezerChartResponse {
  data: DeezerTrack[];
  total?: number;
  next?: string;
}

async function runGate1(): Promise<void> {
  console.log('=== Gate 1 — Deezer Global 50 Endpoint ===\n');
  console.log(`Fetching: ${ENDPOINT}\n`);

  const res = await fetch(ENDPOINT);

  console.log(`HTTP status: ${res.status} ${res.statusText}`);

  if (res.status !== 200) {
    throw new Error(`FAIL: Expected HTTP 200, got ${res.status}`);
  }

  const json = (await res.json()) as DeezerChartResponse;

  if (!json.data || !Array.isArray(json.data)) {
    throw new Error('FAIL: Response missing `data` array');
  }

  const tracks = json.data;
  console.log(`Track count returned: ${tracks.length}`);

  if (tracks.length < 40) {
    throw new Error(`FAIL: Expected ≥ 40 tracks, got ${tracks.length}`);
  }

  // Validate required fields on every track
  const missingFields: string[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t.id) missingFields.push(`track[${i}]: missing id`);
    if (!t.title) missingFields.push(`track[${i}]: missing title`);
    if (!t.artist?.name) missingFields.push(`track[${i}]: missing artist.name`);
    if (t.duration === undefined || t.duration === null) missingFields.push(`track[${i}]: missing duration`);
  }

  if (missingFields.length > 0) {
    console.error('Field validation issues:');
    missingFields.forEach(m => console.error(' ', m));
    throw new Error('FAIL: One or more tracks are missing required fields');
  }

  // Print first 5 tracks for human review
  console.log('\n--- First 5 Tracks ---');
  tracks.slice(0, 5).forEach((t, i) => {
    console.log(`  ${i + 1}. [id=${t.id}] "${t.title}" — ${t.artist.name} (${t.duration}s)`);
  });

  console.log('\n✅  GATE 1 PASSED');
  console.log(`    ${tracks.length} tracks returned with all required fields (id, title, artist.name, duration).`);
  console.log('\n--- Full Track ID List (for Gate 2) ---');
  const ids = tracks.slice(0, 10).map(t => t.id);
  console.log('First 10 IDs:', ids.join(', '));
}

runGate1().catch(err => {
  console.error('\n❌  GATE 1 FAILED:', err.message);
  process.exit(1);
});


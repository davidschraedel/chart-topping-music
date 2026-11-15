/**
 * Gate 3b — Tunebat /Info/ Direct ISRC Navigation Probe
 *
 * RATIONALE:
 *   Gate 3 (via /Search) hit a Cloudflare bot challenge immediately.
 *   robots.txt Disallows /Search — this is expected and respected.
 *   robots.txt does NOT disallow /Info/ — the detail pages are permitted.
 *   Deezer per-track API supplies ISRC for 10/10 tracks (Gate 2 confirmed).
 *
 *   This probe navigates directly to Tunebat /Info/ pages using ISRCs,
 *   bypassing /Search entirely.
 *
 * URL pattern: https://tunebat.com/Info/{url-slug}/{isrc}
 *   - The slug is a URL-friendly title+artist (Tunebat may ignore it / redirect)
 *   - We'll try a derived slug first; if Tunebat redirects correctly, great.
 *   - We'll also try slug-less variants if needed.
 *
 * Pass criteria (same as Gate 3):
 *   - ≥ 7/10 songs return readable stats (BPM, key, energy, danceability, valence, acousticness)
 *   - No CAPTCHA or 403 at human-paced delays (3–8 s)
 *
 * Run: npx tsx scripts/feasibility/gate3b-tunebat-info-probe.ts
 *
 * IMPORTANT: Runs with a HEADED browser. Stop immediately if bot block appears.
 */

import { chromium, type Browser, type Page } from 'playwright';

const CHART_ENDPOINT = 'https://api.deezer.com/chart/0/tracks?limit=50';
const TRACK_ENDPOINT = (id: number) => `https://api.deezer.com/track/${id}`;
const PROBE_COUNT = 10;
const DELAY_MIN_MS = 3000;
const DELAY_MAX_MS = 8000;
const PASS_THRESHOLD = 7;

// ─── Types ───────────────────────────────────────────────────────────────────

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
  isrc?: string;
  bpm?: number;
  artist?: { name: string };
}

interface TrackWithIsrc {
  id: number;
  title: string;
  artist: string;
  isrc: string;
  bpm?: number;
}

interface TunebatStats {
  bpm?: number;
  key?: string;
  mode?: string;
  energy?: number;
  danceability?: number;
  valence?: number;
  acousticness?: number;
  urlUsed: string;
  slugStrategy: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`    ⏱  Waiting ${(ms / 1000).toFixed(1)}s…`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Derive a URL-safe slug from title + artist, matching Tunebat's observed pattern.
 * e.g. "Blinding Lights" by "The Weeknd" → "blinding-lights-the-weeknd"
 */
function deriveSlug(title: string, artist: string): string {
  return `${title} ${artist}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // strip non-alphanumeric
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-|-$/g, '');          // trim leading/trailing hyphens
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchTracksWithIsrc(): Promise<TrackWithIsrc[]> {
  console.log('Fetching chart + per-track details to get ISRCs…');

  const chartRes = await fetch(CHART_ENDPOINT);
  if (!chartRes.ok) throw new Error(`Chart fetch failed: HTTP ${chartRes.status}`);
  const chartJson = (await chartRes.json()) as DeezerChartResponse;
  const chartTracks = chartJson.data.slice(0, PROBE_COUNT);

  const results: TrackWithIsrc[] = [];

  for (const ct of chartTracks) {
    const detailRes = await fetch(TRACK_ENDPOINT(ct.id));
    if (!detailRes.ok) {
      console.warn(`  ⚠  Track ${ct.id} detail fetch failed (${detailRes.status}) — skipping`);
      continue;
    }
    const detail = (await detailRes.json()) as DeezerTrackDetail;

    if (!detail.isrc) {
      console.warn(`  ⚠  Track ${ct.id} "${ct.title}" has no ISRC — skipping`);
      continue;
    }

    results.push({
      id: ct.id,
      title: ct.title,
      artist: ct.artist.name,
      isrc: detail.isrc,
      bpm: detail.bpm,
    });

    console.log(`  ✓ ${ct.title} — ${ct.artist.name}  ISRC: ${detail.isrc}`);
  }

  return results;
}

// ─── Tunebat /Info/ navigation & stat parsing ─────────────────────────────────

async function probeTunebatInfoPage(page: Page, track: TrackWithIsrc): Promise<TunebatStats | null> {
  const slug = deriveSlug(track.title, track.artist);

  // Strategy 1: derived slug + ISRC
  const urlWithSlug = `https://tunebat.com/Info/${slug}/${track.isrc}`;
  // Strategy 2: ISRC-only (no slug) — some sites accept this
  const urlIsrcOnly = `https://tunebat.com/Info/${track.isrc}`;

  const urlsToTry: Array<{ url: string; strategy: string }> = [
    { url: urlWithSlug, strategy: 'slug+isrc' },
    { url: urlIsrcOnly, strategy: 'isrc-only' },
  ];

  for (const { url, strategy } of urlsToTry) {
    console.log(`    → [${strategy}] ${url}`);

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Check for bot-block signals
      const status = response?.status() ?? 0;
      const finalUrl = page.url();
      const pageTitle = await page.title();

      console.log(`      Status: ${status} | Title: "${pageTitle.slice(0, 60)}"`);

      // Detect Cloudflare / bot challenge
      if (
        status === 403 ||
        pageTitle.toLowerCase().includes('just a moment') ||
        pageTitle.toLowerCase().includes('attention required') ||
        pageTitle.toLowerCase().includes('captcha') ||
        pageTitle.toLowerCase().includes('403') ||
        finalUrl.includes('challenge') ||
        finalUrl.includes('cf-chl')
      ) {
        console.error('    🚫  Bot block / Cloudflare challenge detected! Halting.');
        return null; // signal caller to stop all probing
      }

      // If redirected to home or search, this URL strategy didn't work
      if (finalUrl.includes('/Search') || finalUrl === 'https://tunebat.com/' || finalUrl === 'https://tunebat.com') {
        console.log(`      ↩  Redirected away — strategy "${strategy}" doesn't work.`);
        continue;
      }

      // We're on an /Info/ page — wait for stats to render
      // Try known stat container selectors; Tunebat is a React SPA so stats load async
      const statSelectors = [
        '[class*="TrackAttribute"]',
        '[class*="trackAttribute"]',
        '[class*="AudioFeature"]',
        '[class*="audioFeature"]',
        '[class*="stat"]',
        '[class*="Stat"]',
        '[class*="feature"]',
        '[class*="Feature"]',
      ];

      let statsVisible = false;
      for (const sel of statSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 8000 });
          console.log(`      ✓ Stats container: ${sel}`);
          statsVisible = true;
          break;
        } catch {
          // try next selector
        }
      }

      // Last resort: wait for text "BPM" to appear
      if (!statsVisible) {
        try {
          await page.waitForFunction(
            () => document.body.innerText.includes('BPM'),
            { timeout: 8000 }
          );
          console.log('      ✓ "BPM" text visible on page (fallback)');
          statsVisible = true;
        } catch {
          console.log(`      ⚠  Stats didn't appear on page (strategy: ${strategy})`);
          continue; // try next URL strategy
        }
      }

      // ── Parse stats ──────────────────────────────────────────────────────
      const stats: TunebatStats = { urlUsed: finalUrl, slugStrategy: strategy };

      const pageText = await page.evaluate(() => document.body.innerText);

      // BPM: standalone number 50–250 near "BPM" label
      const bpmMatch = pageText.match(/\b(\d{2,3}(?:\.\d+)?)\s*BPM\b/i) ??
                       pageText.match(/BPM\s*[:\s]\s*(\d{2,3}(?:\.\d+)?)\b/i);
      if (bpmMatch) stats.bpm = parseFloat(bpmMatch[1]);

      // Key + Mode: e.g. "C Major", "F# Minor", "Bb Major"
      const keyMatch = pageText.match(/\b([A-G][b#]?)\s*(Major|Minor)\b/i);
      if (keyMatch) {
        stats.key = `${keyMatch[1]} ${keyMatch[2]}`;
        stats.mode = keyMatch[2];
      }

      // Energy / Danceability / Valence / Acousticness: 0–100 percentage near label
      const extractPercent = (label: string): number | undefined => {
        // Pattern: "Energy 72%" or "Energy\n72" or "72\nEnergy"
        const re1 = new RegExp(`${label}\\D{0,10}(\\d{1,3})\\b`, 'i');
        const re2 = new RegExp(`\\b(\\d{1,3})\\b\\D{0,10}${label}`, 'i');
        const m = pageText.match(re1) ?? pageText.match(re2);
        if (m) {
          const v = parseInt(m[1], 10);
          if (v >= 0 && v <= 100) return v;
        }
        return undefined;
      };

      stats.energy       = extractPercent('Energy');
      stats.danceability = extractPercent('Danceability');
      stats.valence      = extractPercent('Valence');
      stats.acousticness = extractPercent('Acousticness');

      console.log(
        `      📊 BPM: ${stats.bpm ?? '—'} | Key: ${stats.key ?? '—'} | ` +
        `Energy: ${stats.energy ?? '—'} | Dance: ${stats.danceability ?? '—'} | ` +
        `Valence: ${stats.valence ?? '—'} | Acoustic: ${stats.acousticness ?? '—'}`
      );

      return stats;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('403') || msg.includes('blocked')) {
        console.error(`    🚫  Bot-block signal in error: ${msg}`);
        return null;
      }
      console.log(`      ⚠  Error with strategy "${strategy}": ${msg.slice(0, 120)}`);
      // try next strategy
    }
  }

  // All URL strategies exhausted
  return { urlUsed: '', slugStrategy: 'not_found', bpm: undefined };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runGate3b(): Promise<void> {
  console.log('=== Gate 3b — Tunebat /Info/ Direct ISRC Probe ===\n');
  console.log('Strategy: Navigate directly to /Info/{slug}/{isrc} — skipping /Search entirely.');
  console.log('robots.txt: /Search is Disallowed; /Info/ is Allowed.\n');

  // Step 1: Fetch ISRCs from Deezer
  const tracks = await fetchTracksWithIsrc();
  if (tracks.length === 0) throw new Error('No tracks with ISRCs found from Deezer');
  console.log(`\nProbing ${tracks.length} tracks:\n`);

  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    let successCount = 0;
    let notFoundCount = 0;
    let blockedCount = 0;

    const results: Array<{
      track: TrackWithIsrc;
      stats: TunebatStats | null;
      blocked: boolean;
    }> = [];

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      console.log(`\n[${i + 1}/${tracks.length}] "${track.title}" — ${track.artist}  (ISRC: ${track.isrc})`);

      const stats = await probeTunebatInfoPage(page, track);

      if (stats === null) {
        blockedCount++;
        results.push({ track, stats: null, blocked: true });
        console.error('\n🛑  Bot block detected. Halting Gate 3b immediately per policy.');
        break;
      }

      const hasStats =
        stats.bpm !== undefined ||
        stats.key !== undefined ||
        stats.energy !== undefined ||
        stats.danceability !== undefined;

      if (hasStats) successCount++;
      else notFoundCount++;

      results.push({ track, stats, blocked: false });

      if (i < tracks.length - 1) {
        await randomDelay(DELAY_MIN_MS, DELAY_MAX_MS);
      }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n\n=== Gate 3b Summary ===\n');
    console.log(`  Probed:         ${results.length}/${tracks.length} tracks`);
    console.log(`  ✅ Stats found: ${successCount}`);
    console.log(`  ⚠  Not found:  ${notFoundCount}`);
    console.log(`  🚫 Blocked:    ${blockedCount}`);

    if (blockedCount > 0) {
      console.log('\n❌  GATE 3b FAILED: Bot block encountered on /Info/ pages.');
      console.log('    Tunebat cannot be safely automated. Consider alternative data sources.');
      process.exit(1);
    }

    if (successCount < PASS_THRESHOLD) {
      console.log(`\n❌  GATE 3b FAILED: Only ${successCount}/${tracks.length} songs returned stats (need ≥ ${PASS_THRESHOLD}).`);
      process.exit(1);
    }

    console.log(`\n✅  GATE 3b PASSED: ${successCount}/${tracks.length} songs returned stats via /Info/ direct navigation.`);

    // Record findings for the pipeline design
    const successfulResults = results.filter(r => !r.blocked && r.stats && (r.stats.bpm !== undefined || r.stats.key !== undefined));
    if (successfulResults.length > 0) {
      const exampleStats = successfulResults[0].stats!;
      console.log('\n--- Tunebat /Info/ Pattern Notes (record these for Phase 2+) ---');
      console.log(`  Working URL:  ${exampleStats.urlUsed}`);
      console.log(`  Slug strategy: ${exampleStats.slugStrategy}`);
      console.log('  Wait for:     body text includes "BPM"  OR  [class*="TrackAttribute"]');
      console.log('  Key format:   "<Note> <Major|Minor>"');
      console.log('  Rendering:    CSR (React SPA) — waitForFunction/waitForSelector required');
      console.log('  No /Search:   Navigate directly to /Info/{slug}/{isrc}');
    }
  } finally {
    if (browser) await browser.close();
  }
}

runGate3b().catch(err => {
  console.error('\n❌  GATE 3b FAILED (unhandled error):', err.message ?? err);
  process.exit(1);
});


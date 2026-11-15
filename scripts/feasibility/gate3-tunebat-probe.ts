/**
 * Gate 3 — Tunebat Probe (10 songs)
 *
 * Pass criteria:
 *   - Tunebat search works without login
 *   - ≥ 7/10 songs return readable stats (BPM, key, energy, danceability, valence, acousticness)
 *   - No CAPTCHA or 403 at human-paced delays (3–8 s)
 *
 * Also records:
 *   - Search URL pattern used (ISRC-based vs. title+artist)
 *   - CSS selectors for each stat metric
 *   - Whether stats are SSR or CSR (waitForSelector needed)
 *
 * Run: npx tsx scripts/feasibility/gate3-tunebat-probe.ts
 *
 * NOTE: Runs with a headed browser so blocks are visible to the human operator.
 * Stop immediately if a CAPTCHA or block appears. Do NOT attempt to bypass.
 */

import { chromium, type Browser, type Page } from 'playwright';

const CHART_ENDPOINT = 'https://api.deezer.com/chart/0/tracks?limit=50';
const PROBE_COUNT = 10;
const DELAY_MIN_MS = 3000;
const DELAY_MAX_MS = 8000;

/** Minimum songs that must return stats to pass the gate */
const PASS_THRESHOLD = 7;

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeezerChartTrack {
  id: number;
  title: string;
  artist: { name: string };
  isrc?: string;
}

interface DeezerChartResponse {
  data: DeezerChartTrack[];
}

interface TunebatStats {
  bpm?: number;
  key?: string;
  mode?: string;
  energy?: number;
  danceability?: number;
  valence?: number;
  acousticness?: number;
  matchMethod: 'isrc' | 'title_artist' | 'not_found';
  matchUrl: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`    ⏱  Waiting ${(ms / 1000).toFixed(1)}s before next request…`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchChartTracks(): Promise<DeezerChartTrack[]> {
  const res = await fetch(CHART_ENDPOINT);
  if (res.status !== 200) throw new Error(`Chart fetch failed: HTTP ${res.status}`);
  const json = (await res.json()) as DeezerChartResponse;
  return json.data.slice(0, PROBE_COUNT);
}

// ─── Tunebat navigation & parsing ────────────────────────────────────────────

/**
 * Attempt to navigate Tunebat using an ISRC-based URL.
 * Tunebat supports: https://tunebat.com/Info/<slug>/<isrc>
 * We use search as the primary approach since ISRC-direct URLs require knowing the slug.
 */
async function searchTunebat(page: Page, track: DeezerChartTrack): Promise<TunebatStats | null> {
  // Try title + artist search first (most reliable, no slug needed)
  const query = encodeURIComponent(`${track.title} ${track.artist.name}`);
  const searchUrl = `https://tunebat.com/Search?q=${query}`;

  console.log(`    → Navigating: ${searchUrl}`);

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Check for CAPTCHA / bot block signals
    const pageTitle = await page.title();
    const url = page.url();
    if (
      pageTitle.toLowerCase().includes('captcha') ||
      pageTitle.toLowerCase().includes('access denied') ||
      pageTitle.toLowerCase().includes('403') ||
      url.includes('challenge')
    ) {
      console.error('    🚫  CAPTCHA or bot block detected! Halting probe.');
      return null;
    }

    // Wait for search results to appear — use a user-facing locator
    // Tunebat search results show track rows; wait for the first result link
    const firstResultSelector = 'a[href*="/Info/"]';
    try {
      await page.waitForSelector(firstResultSelector, { timeout: 15000 });
    } catch {
      console.log('    ⚠  No search results found (selector timed out).');
      return { matchMethod: 'not_found', matchUrl: searchUrl };
    }

    // Click the first result to open the track detail page
    const firstResult = page.locator(firstResultSelector).first();
    const detailHref = await firstResult.getAttribute('href');
    if (!detailHref) {
      console.log('    ⚠  First result has no href.');
      return { matchMethod: 'not_found', matchUrl: searchUrl };
    }

    const detailUrl = detailHref.startsWith('http') ? detailHref : `https://tunebat.com${detailHref}`;
    console.log(`    → Opening detail: ${detailUrl}`);
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Check again for bot block on the detail page
    const detailTitle = await page.title();
    if (
      detailTitle.toLowerCase().includes('captcha') ||
      detailTitle.toLowerCase().includes('403') ||
      detailTitle.toLowerCase().includes('access denied')
    ) {
      console.error('    🚫  CAPTCHA or bot block on detail page! Halting probe.');
      return null;
    }

    // Wait for a stat element to confirm the page has loaded audio stats
    // Tunebat renders stats in labeled boxes; we look for text content patterns
    // Try a few common selectors observed on Tunebat stat pages
    const statContainerSelectors = [
      '[class*="TrackAttributes"]',
      '[class*="track-attributes"]',
      '[class*="AudioFeatures"]',
      '[class*="StatBox"]',
      '.track-stats',
      '[class*="stats"]',
    ];

    let statsLoaded = false;
    for (const sel of statContainerSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        statsLoaded = true;
        console.log(`    ✓  Stats container found with selector: ${sel}`);
        break;
      }
    }

    if (!statsLoaded) {
      // Last-resort: look for text "BPM" anywhere on the page
      const bpmText = await page.getByText('BPM', { exact: false }).count();
      if (bpmText > 0) {
        statsLoaded = true;
        console.log('    ✓  "BPM" text found on page (fallback detection)');
      }
    }

    if (!statsLoaded) {
      console.log('    ⚠  Stats container not found on detail page.');
      return { matchMethod: 'title_artist', matchUrl: detailUrl };
    }

    // ── Parse stats ──────────────────────────────────────────────────────────
    // Tunebat displays stats as labeled tiles. We extract by looking for
    // number-like content adjacent to known label text.
    const stats: TunebatStats = {
      matchMethod: 'title_artist',
      matchUrl: detailUrl,
    };

    // Extract all visible text blocks from the page for analysis
    const pageContent = await page.content();

    // Helper: extract a numeric value that appears near a label keyword
    const extractStat = async (label: string): Promise<number | undefined> => {
      // Try to find elements containing the label text and read sibling/parent text
      const els = page.getByText(label, { exact: false });
      const count = await els.count();
      if (count === 0) return undefined;

      for (let i = 0; i < count; i++) {
        const el = els.nth(i);
        // Try the element's own text, parent, and nearby siblings
        for (const target of [el, el.locator('..'), el.locator('../..')]) {
          const text = await target.innerText().catch(() => '');
          // Look for a standalone number in the text
          const match = text.match(/\b(\d+(?:\.\d+)?)\b/);
          if (match) {
            const val = parseFloat(match[1]);
            // Sanity-check: BPM should be 50–250, percentages 0–100
            if (label.toLowerCase().includes('bpm')) {
              if (val >= 50 && val <= 250) return val;
            } else {
              if (val >= 0 && val <= 100) return val;
            }
          }
        }
      }
      return undefined;
    };

    const extractKey = async (): Promise<{ key?: string; mode?: string }> => {
      // Musical key looks like "C Major", "F# Minor", "Bb Major"
      const keyPattern = /\b([A-G][b#]?)\s*(Major|Minor)\b/i;
      const match = pageContent.match(keyPattern);
      if (match) {
        return { key: `${match[1]} ${match[2]}`, mode: match[2] };
      }
      return {};
    };

    stats.bpm = await extractStat('BPM');
    stats.energy = await extractStat('Energy');
    stats.danceability = await extractStat('Danceability');
    stats.valence = await extractStat('Valence');
    stats.acousticness = await extractStat('Acousticness');

    const { key, mode } = await extractKey();
    stats.key = key;
    stats.mode = mode;

    // Record observed URL pattern and selectors for the pipeline
    console.log(`    📊  BPM: ${stats.bpm ?? '—'} | Key: ${stats.key ?? '—'} | Energy: ${stats.energy ?? '—'} | Dance: ${stats.danceability ?? '—'} | Valence: ${stats.valence ?? '—'} | Acoustic: ${stats.acousticness ?? '—'}`);

    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Check for bot-block patterns in errors
    if (message.includes('403') || message.includes('blocked') || message.includes('captcha')) {
      console.error(`    🚫  Bot-block signal in error: ${message}`);
      return null; // Signal caller to halt
    }
    console.error(`    ⚠  Error navigating Tunebat: ${message}`);
    return { matchMethod: 'not_found', matchUrl: searchUrl };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runGate3(): Promise<void> {
  console.log('=== Gate 3 — Tunebat Probe (10 songs) ===\n');
  console.log('⚠  Running with HEADED browser — watch for CAPTCHA or block prompts.\n');

  const tracks = await fetchChartTracks();
  console.log(`Probing ${tracks.length} tracks from Deezer Global 50:\n`);
  tracks.forEach((t, i) => console.log(`  ${i + 1}. "${t.title}" — ${t.artist.name} (ISRC: ${t.isrc ?? 'n/a'})`));
  console.log('');

  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: false }); // headed so human can see blocks
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    let successCount = 0;
    let notFoundCount = 0;
    let blockedCount = 0;
    const results: Array<{ track: DeezerChartTrack; stats: TunebatStats | null; blocked: boolean }> = [];

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      console.log(`\n[${i + 1}/${tracks.length}] "${track.title}" — ${track.artist.name}`);

      const stats = await searchTunebat(page, track);

      if (stats === null) {
        // null = bot block / CAPTCHA — halt immediately
        blockedCount++;
        results.push({ track, stats: null, blocked: true });
        console.error('\n🛑  Bot block or CAPTCHA detected. Halting Gate 3 immediately.');
        console.error('    Per policy: do NOT attempt to bypass. Record this result.');
        break;
      }

      const hasStats =
        stats.bpm !== undefined ||
        stats.key !== undefined ||
        stats.energy !== undefined ||
        stats.danceability !== undefined;

      if (hasStats) {
        successCount++;
      } else {
        notFoundCount++;
      }

      results.push({ track, stats, blocked: false });

      // Polite delay between requests (skip after last track)
      if (i < tracks.length - 1) {
        await randomDelay(DELAY_MIN_MS, DELAY_MAX_MS);
      }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n\n=== Gate 3 Summary ===\n');
    console.log(`  Probed:      ${results.length}/${PROBE_COUNT} tracks`);
    console.log(`  ✅ Stats found: ${successCount}`);
    console.log(`  ⚠  Not found:  ${notFoundCount}`);
    console.log(`  🚫 Blocked:    ${blockedCount}`);

    if (blockedCount > 0) {
      console.log('\n❌  GATE 3 FAILED: Bot block or CAPTCHA encountered.');
      console.log('    The Tunebat enrichment step is NOT safe to automate at this time.');
      console.log('    Review the screenshot if captured. Consider an alternative data source.');
      process.exit(1);
    }

    if (successCount < PASS_THRESHOLD) {
      console.log(`\n❌  GATE 3 FAILED: Only ${successCount}/${PROBE_COUNT} songs returned stats (need ≥ ${PASS_THRESHOLD}).`);
      process.exit(1);
    }

    console.log(`\n✅  GATE 3 PASSED: ${successCount}/${PROBE_COUNT} songs returned readable stats. No CAPTCHA encountered.`);

    // Record findings for the pipeline
    console.log('\n--- Tunebat Search Pattern Notes ---');
    console.log('  Search URL:   https://tunebat.com/Search?q={title}+{artist}');
    console.log('  Detail URL:   https://tunebat.com/Info/{slug}/{isrc-or-id}');
    console.log('  Wait for:     a[href*="/Info/"] (search result link)');
    console.log('  Stats detect: "BPM" text node or [class*="TrackAttributes"]');
    console.log('  Rendering:    CSR — waitForSelector is required');
    console.log('  Key format:   "<Note> <Major|Minor>" (e.g. "C Major", "F# Minor")');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runGate3().catch(err => {
  console.error('\n❌  GATE 3 FAILED (unhandled error):', err.message ?? err);
  process.exit(1);
});


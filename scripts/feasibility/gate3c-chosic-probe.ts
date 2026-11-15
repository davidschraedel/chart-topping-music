/**
 * Gate 3c — Chosic Probe (10 songs)
 *
 * Tests Chosic (chosic.com/spotify-song-analyzer/) as an alternative to Tunebat.
 * Uses standard Playwright Chromium (headed) — same setup as Gate 3.
 *
 * Pass criteria:
 *   - ≥ 7/10 songs return readable stats (BPM, key, energy, danceability, valence, acousticness)
 *   - No CAPTCHA or 403 at human-paced delays (3–8 s)
 *
 * Run: npx tsx scripts/feasibility/gate3c-chosic-probe.ts
 */

import { chromium, type Browser, type Page } from 'playwright';

const CHART_ENDPOINT = 'https://api.deezer.com/chart/0/tracks?limit=50';
const TRACK_ENDPOINT = (id: number) => `https://api.deezer.com/track/${id}`;
const PROBE_COUNT = 10;
const DELAY_MIN_MS = 3000;
const DELAY_MAX_MS = 8000;
const PASS_THRESHOLD = 7;

// Chosic song analyzer URL
const CHOSIC_ANALYZER_URL = 'https://www.chosic.com/spotify-song-analyzer/';

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
  artist?: { name: string };
}

interface TrackInfo {
  id: number;
  title: string;
  artist: string;
  isrc?: string;
}

interface ChosicStats {
  bpm?: number;
  key?: string;
  mode?: string;
  energy?: number;
  danceability?: number;
  valence?: number;
  acousticness?: number;
  urlUsed: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  console.log(`    ⏱  Waiting ${(ms / 1000).toFixed(1)}s…`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isBotBlock(title: string, url: string): boolean {
  const t = title.toLowerCase();
  const u = url.toLowerCase();
  return (
    t.includes('just a moment') ||
    t.includes('attention required') ||
    t.includes('captcha') ||
    t.includes('403') ||
    t.includes('access denied') ||
    u.includes('challenge') ||
    u.includes('cf-chl') ||
    u.includes('/cdn-cgi/')
  );
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchTracks(): Promise<TrackInfo[]> {
  console.log('Fetching chart + ISRCs from Deezer…');
  const chartRes = await fetch(CHART_ENDPOINT);
  if (!chartRes.ok) throw new Error(`Chart fetch failed: HTTP ${chartRes.status}`);
  const chartJson = (await chartRes.json()) as DeezerChartResponse;
  const chartTracks = chartJson.data.slice(0, PROBE_COUNT);

  const results: TrackInfo[] = [];
  for (const ct of chartTracks) {
    const detailRes = await fetch(TRACK_ENDPOINT(ct.id));
    const detail = detailRes.ok ? (await detailRes.json()) as DeezerTrackDetail : null;
    results.push({
      id: ct.id,
      title: ct.title,
      artist: ct.artist.name,
      isrc: detail?.isrc,
    });
    console.log(`  ✓ "${ct.title}" — ${ct.artist.name}${detail?.isrc ? `  ISRC: ${detail.isrc}` : ''}`);
  }
  return results;
}

// ─── Chosic search & parse ────────────────────────────────────────────────────

async function probeChosic(page: Page, track: TrackInfo): Promise<ChosicStats | null> {
  const query = `${track.title} ${track.artist}`;
  console.log(`    → Searching Chosic: "${query}"`);

  try {
    // Navigate to the analyzer page (already loaded; just need to submit a new search)
    // Chosic uses a single-page React app — the search box persists across lookups
    const currentUrl = page.url();
    if (!currentUrl.includes('chosic.com')) {
      await page.goto(CHOSIC_ANALYZER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Check for bot block on initial load
    const pageTitle = await page.title();
    const pageUrl = page.url();
    if (isBotBlock(pageTitle, pageUrl)) {
      console.error('    🚫  Bot block / Cloudflare on page load!');
      return null;
    }

    // Find the search input — Chosic's analyzer has a text input for song name or Spotify URL
    const searchSelectors = [
      'input[placeholder*="Search"]',
      'input[placeholder*="search"]',
      'input[placeholder*="song"]',
      'input[placeholder*="Song"]',
      'input[placeholder*="track"]',
      'input[placeholder*="Spotify"]',
      'input[type="search"]',
      'input[type="text"]',
    ];

    let searchInput = null;
    for (const sel of searchSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        searchInput = page.locator(sel).first();
        console.log(`    ✓ Search input found: ${sel}`);
        break;
      }
    }

    if (!searchInput) {
      // Dump what's on the page to help diagnose
      const bodyText = (await page.evaluate(() => document.body.innerText)).slice(0, 300);
      console.log(`    ⚠  No search input found. Page preview: ${bodyText}`);
      return { urlUsed: pageUrl };
    }

    // Clear and type the search query
    await searchInput.click();
    await searchInput.selectText().catch(() => {});
    await searchInput.fill(query);
    await page.keyboard.press('Enter');

    // Wait for search results to appear — look for a song result list or stats panel
    const resultSelectors = [
      '[class*="result"]',
      '[class*="Result"]',
      '[class*="song-item"]',
      '[class*="track-item"]',
      '[class*="search-result"]',
      'li[class*="song"]',
      'ul[class*="songs"]',
    ];

    let resultsAppeared = false;
    for (const sel of resultSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 10000 });
        console.log(`    ✓ Results appeared: ${sel}`);
        resultsAppeared = true;

        // Click the first result
        await page.locator(sel).first().click();
        break;
      } catch {
        // try next
      }
    }

    if (!resultsAppeared) {
      // Maybe Chosic shows stats directly (no intermediate results list)
      // Wait for a BPM indicator to appear anywhere on the page
      try {
        await page.waitForFunction(
          () => document.body.innerText.includes('BPM'),
          { timeout: 12000 }
        );
        console.log('    ✓ Stats appeared directly (no results list needed)');
        resultsAppeared = true;
      } catch {
        console.log('    ⚠  No results or stats appeared after search.');
        return { urlUsed: page.url() };
      }
    }

    // Check for bot block after interaction
    const titleAfter = await page.title();
    const urlAfter = page.url();
    if (isBotBlock(titleAfter, urlAfter)) {
      console.error('    🚫  Bot block after search interaction!');
      return null;
    }

    // ── Wait for stats panel to fully render ────────────────────────────────
    const statPanelSelectors = [
      '[class*="audio-feature"]',
      '[class*="audioFeature"]',
      '[class*="feature"]',
      '[class*="stats"]',
      '[class*="stat"]',
      '[class*="detail"]',
    ];

    for (const sel of statPanelSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 8000 });
        console.log(`    ✓ Stats panel: ${sel}`);
        break;
      } catch {
        // try next
      }
    }

    // ── Parse stats from page text ─────────────────────────────────────────
    const pageText = await page.evaluate(() => document.body.innerText);
    const stats: ChosicStats = { urlUsed: page.url() };

    // BPM: number 50–250 near "BPM"
    const bpmMatch = pageText.match(/\b(\d{2,3}(?:\.\d+)?)\s*BPM\b/i) ??
                     pageText.match(/BPM[^\d]{0,10}(\d{2,3}(?:\.\d+)?)\b/i);
    if (bpmMatch) stats.bpm = parseFloat(bpmMatch[1]);

    // Key + Mode
    const keyMatch = pageText.match(/\b([A-G][b#]?)\s*(Major|Minor)\b/i);
    if (keyMatch) {
      stats.key = `${keyMatch[1]} ${keyMatch[2]}`;
      stats.mode = keyMatch[2];
    }

    // Percentage stats (0–100)
    const extractPct = (label: string): number | undefined => {
      const re1 = new RegExp(`${label}\\D{0,15}(\\d{1,3})\\b`, 'i');
      const re2 = new RegExp(`\\b(\\d{1,3})\\b\\D{0,15}${label}`, 'i');
      const m = pageText.match(re1) ?? pageText.match(re2);
      if (m) {
        const v = parseInt(m[1], 10);
        if (v >= 0 && v <= 100) return v;
      }
      return undefined;
    };

    // Chosic may also show 0.0–1.0 scale (Spotify-style)
    const extractDecimal = (label: string): number | undefined => {
      const re = new RegExp(`${label}\\D{0,15}(0\\.\\d+|1\\.0)`, 'i');
      const m = pageText.match(re);
      if (m) return Math.round(parseFloat(m[1]) * 100);
      return undefined;
    };

    stats.energy       = extractPct('Energy')       ?? extractDecimal('Energy');
    stats.danceability = extractPct('Danceability')  ?? extractDecimal('Danceability');
    stats.valence      = extractPct('Valence')       ?? extractDecimal('Valence');
    stats.acousticness = extractPct('Acousticness')  ?? extractDecimal('Acousticness');

    console.log(
      `    📊 BPM: ${stats.bpm ?? '—'} | Key: ${stats.key ?? '—'} | ` +
      `Energy: ${stats.energy ?? '—'} | Dance: ${stats.danceability ?? '—'} | ` +
      `Valence: ${stats.valence ?? '—'} | Acoustic: ${stats.acousticness ?? '—'}`
    );

    return stats;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('403') || msg.includes('blocked')) {
      console.error(`    🚫  Bot-block signal: ${msg}`);
      return null;
    }
    console.log(`    ⚠  Error: ${msg.slice(0, 120)}`);
    return { urlUsed: page.url() };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runGate3c(): Promise<void> {
  console.log('=== Gate 3c — Chosic Probe (10 songs) ===\n');
  console.log('Using: Standard Playwright Chromium (headed for visibility)');

  const tracks = await fetchTracks();
  console.log(`\nProbing ${tracks.length} tracks:\n`);

  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({
      headless: false,
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });
    const page = await context.newPage();

    // Load Chosic once at the start
    console.log(`Loading ${CHOSIC_ANALYZER_URL}…`);
    await page.goto(CHOSIC_ANALYZER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const initTitle = await page.title();
    const initUrl = page.url();
    console.log(`Page title: "${initTitle}"`);
    if (isBotBlock(initTitle, initUrl)) {
      console.error('\n🚫  Cloudflare bot block on initial Chosic load. Gate 3c FAILED.');
      process.exit(1);
    }
    console.log('✓ Chosic loaded without bot block\n');

    // Give the page a moment to settle
    await new Promise(r => setTimeout(r, 2000));

    let successCount = 0;
    let notFoundCount = 0;
    let blockedCount = 0;

    const results: Array<{ track: TrackInfo; stats: ChosicStats | null; blocked: boolean }> = [];

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      console.log(`\n[${i + 1}/${tracks.length}] "${track.title}" — ${track.artist}`);

      const stats = await probeChosic(page, track);

      if (stats === null) {
        blockedCount++;
        results.push({ track, stats: null, blocked: true });
        console.error('\n🛑  Bot block detected. Halting Gate 3c per policy.');
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
    console.log('\n\n=== Gate 3c Summary ===\n');
    console.log(`  Probed:         ${results.length}/${tracks.length} tracks`);
    console.log(`  ✅ Stats found: ${successCount}`);
    console.log(`  ⚠  Not found:  ${notFoundCount}`);
    console.log(`  🚫 Blocked:    ${blockedCount}`);

    if (blockedCount > 0) {
      console.log('\n❌  GATE 3c FAILED: Cloudflare / bot block encountered on Chosic.');
      console.log('    Consider alternative: GetSongBPM (free API, BPM+key+dance+acoustic, no browser needed).');
      process.exit(1);
    }

    if (successCount < PASS_THRESHOLD) {
      console.log(`\n❌  GATE 3c FAILED: Only ${successCount}/${tracks.length} returned stats (need ≥ ${PASS_THRESHOLD}).`);
      process.exit(1);
    }

    console.log(`\n✅  GATE 3c PASSED: ${successCount}/${tracks.length} songs returned stats from Chosic.`);

    // Document findings for pipeline design
    const successes = results.filter(r => !r.blocked && r.stats &&
      (r.stats.bpm !== undefined || r.stats.key !== undefined));
    if (successes.length > 0) {
      console.log('\n--- Chosic Pattern Notes (record for Phases 2+) ---');
      console.log('  Entry URL:  https://www.chosic.com/spotify-song-analyzer/');
      console.log('  Search:     text input, title+artist, press Enter');
      console.log('  Rendering:  CSR (React) — waitForSelector required');
      console.log('  Stats:      BPM bare number, key as "X Major/Minor", percentages 0–100');
      console.log('  No ISRC URL scheme — text search only');
    }
  } finally {
    if (browser) await browser.close();
  }
}

runGate3c().catch(err => {
  console.error('\n❌  GATE 3c FAILED (unhandled error):', err.message ?? err);
  process.exit(1);
});


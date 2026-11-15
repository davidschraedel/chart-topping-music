/**
 * Gate 4 — Tunebat robots.txt & Terms of Service Review
 *
 * This script fetches:
 *   1. https://tunebat.com/robots.txt  — records all Disallow directives
 *   2. https://tunebat.com/Privacy     — fetches the page text for manual ToS/Privacy review
 *
 * Pass criteria:
 *   - No explicit prohibition on personal, low-rate, non-commercial automated access
 *   - Findings documented to stdout for human operator to review
 *
 * NOTE: Gate 4 requires a human operator to read the output and make a final judgment.
 *       This script surfaces the data; it does NOT make a legal determination.
 *
 * Run: npx tsx scripts/feasibility/gate4-tunebat-terms.ts
 */

const ROBOTS_URL = 'https://tunebat.com/robots.txt';
const TERMS_URL = 'https://tunebat.com/Privacy';

// ─── Robots.txt ──────────────────────────────────────────────────────────────

interface RobotsResult {
  raw: string;
  disallowedPaths: string[];
  allowedPaths: string[];
  crawlDelay?: number;
  sitemaps: string[];
}

function parseRobotsTxt(text: string): RobotsResult {
  const lines = text.split('\n').map(l => l.trim());
  const disallowedPaths: string[] = [];
  const allowedPaths: string[] = [];
  const sitemaps: string[] = [];
  let crawlDelay: number | undefined;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('disallow:')) {
      const path = line.slice('disallow:'.length).trim();
      if (path) disallowedPaths.push(path);
    } else if (line.toLowerCase().startsWith('allow:')) {
      const path = line.slice('allow:'.length).trim();
      if (path) allowedPaths.push(path);
    } else if (line.toLowerCase().startsWith('crawl-delay:')) {
      const val = parseFloat(line.slice('crawl-delay:'.length).trim());
      if (!isNaN(val)) crawlDelay = val;
    } else if (line.toLowerCase().startsWith('sitemap:')) {
      sitemaps.push(line.slice('sitemap:'.length).trim());
    }
  }

  return { raw: text, disallowedPaths, allowedPaths, crawlDelay, sitemaps };
}

// ─── Terms text fetch (plain HTTP, no browser) ───────────────────────────────

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  const html = await res.text();
  // Strip HTML tags to get readable text for review
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Keyword scan ─────────────────────────────────────────────────────────────

function scanForKeywords(text: string, keywords: string[]): Array<{ keyword: string; excerpt: string }> {
  const findings: Array<{ keyword: string; excerpt: string }> = [];
  const lower = text.toLowerCase();

  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx !== -1) {
      // Extract ~200 chars of context around the match
      const start = Math.max(0, idx - 80);
      const end = Math.min(text.length, idx + 120);
      findings.push({ keyword: kw, excerpt: '…' + text.slice(start, end) + '…' });
    }
  }

  return findings;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runGate4(): Promise<void> {
  console.log('=== Gate 4 — Tunebat Terms & robots.txt ===\n');

  // ── 1. robots.txt ────────────────────────────────────────────────────────
  console.log(`Fetching: ${ROBOTS_URL}`);
  let robotsResult: RobotsResult;
  try {
    const res = await fetch(ROBOTS_URL);
    const text = await res.text();
    robotsResult = parseRobotsTxt(text);
  } catch (err) {
    console.error('⚠  Could not fetch robots.txt:', err);
    robotsResult = { raw: '', disallowedPaths: [], allowedPaths: [], sitemaps: [] };
  }

  console.log('\n--- robots.txt — Raw ---');
  console.log(robotsResult.raw || '(empty)');

  console.log('\n--- robots.txt — Parsed ---');
  if (robotsResult.disallowedPaths.length === 0) {
    console.log('  Disallowed paths: (none)');
  } else {
    console.log('  Disallowed paths:');
    robotsResult.disallowedPaths.forEach(p => console.log(`    - ${p}`));
  }

  if (robotsResult.allowedPaths.length > 0) {
    console.log('  Allowed paths:');
    robotsResult.allowedPaths.forEach(p => console.log(`    + ${p}`));
  }

  if (robotsResult.crawlDelay !== undefined) {
    console.log(`  Crawl-Delay: ${robotsResult.crawlDelay}s`);
  }

  if (robotsResult.sitemaps.length > 0) {
    console.log('  Sitemaps:');
    robotsResult.sitemaps.forEach(s => console.log(`    ${s}`));
  }

  // ── 2. Terms / Privacy page ───────────────────────────────────────────────
  console.log(`\nFetching: ${TERMS_URL}`);
  let termsText = '';
  try {
    termsText = await fetchPageText(TERMS_URL);
  } catch (err) {
    console.error('⚠  Could not fetch Privacy/Terms page:', err);
  }

  if (termsText) {
    // Scan for keywords relevant to scraping / automated access
    const keywords = [
      'scrape',
      'scraping',
      'crawl',
      'crawling',
      'automated',
      'bot',
      'robot',
      'commercial',
      'non-commercial',
      'personal',
      'prohibit',
      'prohibited',
      'forbidden',
      'restrict',
      'API',
      'data mining',
      'data collection',
    ];

    const findings = scanForKeywords(termsText, keywords);

    console.log('\n--- Terms / Privacy — Keyword Findings ---');
    if (findings.length === 0) {
      console.log('  (No relevant keywords found in page text)');
    } else {
      findings.forEach(f => {
        console.log(`\n  🔍  Keyword: "${f.keyword}"`);
        console.log(`     Excerpt: ${f.excerpt}`);
      });
    }

    // Print first ~1500 chars of terms text for operator manual review
    console.log('\n--- Terms / Privacy — First 1500 chars (for manual review) ---');
    console.log(termsText.slice(0, 1500));
  }

  // ── 3. Summary & operator checklist ──────────────────────────────────────
  console.log('\n\n=== Gate 4 — Operator Checklist (MANUAL REVIEW REQUIRED) ===\n');
  console.log('  Review the output above and confirm each of the following:\n');

  const isSearchDisallowed = robotsResult.disallowedPaths.some(p =>
    p === '/Search' || p === '/Search/' || p === '/'
  );
  const isInfoDisallowed = robotsResult.disallowedPaths.some(p =>
    p === '/Info' || p === '/Info/' || p.startsWith('/Info/')
  );

  console.log(`  [ ] /Search path is disallowed in robots.txt?  → ${isSearchDisallowed ? '⚠  YES — review carefully' : 'No (or not specified)'}`);
  console.log(`  [ ] /Info path is disallowed in robots.txt?    → ${isInfoDisallowed ? '⚠  YES — review carefully' : 'No (or not specified)'}`);
  console.log('  [ ] ToS explicitly prohibits personal, low-rate, non-commercial automated access?');
  console.log('  [ ] ToS requires an API key for any data access?');
  console.log('\n  ✍  Record your findings and approve or block the pipeline accordingly.');
  console.log('\n  If NO explicit prohibition found → Gate 4 PASSES (personal, low-rate, non-commercial use).');
  console.log('  If explicit prohibition found   → Gate 4 FAILS. Revisit data source strategy.');

  console.log('\n✅  Gate 4 script completed. Awaiting human operator review.\n');
}

runGate4().catch(err => {
  console.error('\n❌  GATE 4 SCRIPT FAILED (unhandled error):', err.message ?? err);
  process.exit(1);
});


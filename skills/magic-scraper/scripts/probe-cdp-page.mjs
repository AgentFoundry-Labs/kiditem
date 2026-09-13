#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

function usage() {
  console.error([
    'Usage: probe-cdp-page.mjs <url> [--endpoint http://127.0.0.1:9222] [--out file] [--scrolls n]',
    '',
    'Connects to an already-running local Chrome CDP endpoint, opens the URL,',
    'and writes a compact page observation JSON for extractor development.',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = {
    url: '',
    endpoint: process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT || 'http://127.0.0.1:9222',
    out: '',
    scrolls: 4,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      usage();
      process.exit(0);
    }
    if (value === '--endpoint') {
      args.endpoint = argv[++index] || '';
      continue;
    }
    if (value === '--out') {
      args.out = argv[++index] || '';
      continue;
    }
    if (value === '--scrolls') {
      args.scrolls = Number(argv[++index] || 0);
      continue;
    }
    if (!args.url) {
      args.url = value;
      continue;
    }
    throw new Error(`Unexpected argument: ${value}`);
  }
  if (!args.url) throw new Error('Missing URL');
  if (!args.endpoint) throw new Error('Missing CDP endpoint');
  if (!Number.isInteger(args.scrolls) || args.scrolls < 0 || args.scrolls > 20) {
    throw new Error('--scrolls must be an integer from 0 to 20');
  }
  return args;
}

function loadPlaywright() {
  const candidates = [
    resolve(process.cwd(), 'package.json'),
    '/Users/dev125/workspace/kiditem/package.json',
  ];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return createRequire(candidate)('playwright');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Cannot load Playwright');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(args.endpoint, { timeout: 20_000 });
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 }).catch(() => undefined);
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
  for (let index = 0; index < args.scrolls; index += 1) {
    const ratio = args.scrolls === 0 ? 1 : (index + 1) / args.scrolls;
    await page.evaluate((value) => {
      window.scrollTo(0, document.documentElement.scrollHeight * value);
    }, ratio);
    await page.waitForTimeout(700);
  }

  const observation = await page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const absolute = (href) => {
      if (!href) return '';
      if (href.startsWith('//')) return `${location.protocol}${href}`;
      try {
        return new URL(href, location.href).href;
      } catch {
        return href;
      }
    };
    const summarizeValue = (value, depth = 0) => {
      if (value == null) return value;
      if (typeof value !== 'object') {
        if (typeof value === 'string') return value.slice(0, 300);
        return value;
      }
      if (depth >= 2) {
        if (Array.isArray(value)) return { type: 'array', length: value.length };
        return { type: 'object', keys: Object.keys(value).slice(0, 30) };
      }
      if (Array.isArray(value)) {
        return {
          type: 'array',
          length: value.length,
          sample: value.slice(0, 3).map((item) => summarizeValue(item, depth + 1)),
        };
      }
      return Object.fromEntries(
        Object.entries(value)
          .slice(0, 30)
          .map(([key, item]) => [key, summarizeValue(item, depth + 1)]),
      );
    };
    const looksLikeDetailLink = (link) => {
      const haystack = `${link.href} ${link.text}`.toLowerCase();
      return /\/(product|products|item|items|detail|details|offer|offers|listing|sku)(\/|\.|$|\?)/.test(haystack)
        || /[?&](id|itemid|productid|offerid|sku)=/.test(haystack);
    };
    const result = window.context && window.context.result;
    const model = result && result.global && result.global.globalData && result.global.globalData.model;
    const data = result && result.data;
    const nextData = document.querySelector('script#__NEXT_DATA__');
    const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => {
        try {
          return JSON.parse(script.textContent || 'null');
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(0, 5);
    const links = Array.from(document.querySelectorAll('a[href]')).map((anchor) => ({
      href: absolute(anchor.getAttribute('href') || ''),
      text: clean(anchor.textContent).slice(0, 300),
      image: (() => {
        const img = anchor.querySelector('img');
        if (!img) return '';
        return absolute(img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '');
      })(),
    }));
    const candidateLinks = links
      .filter(looksLikeDetailLink)
      .slice(0, 50);
    const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
      .map((element) => clean(element.textContent))
      .filter(Boolean)
      .slice(0, 30);

    return {
      observed_at: new Date().toISOString(),
      url: location.href,
      title: document.title,
      body_text_sample: clean(document.body && document.body.innerText).slice(0, 5000),
      html_length: document.documentElement.outerHTML.length,
      link_count: links.length,
      candidate_detail_link_count: candidateLinks.length,
      candidate_detail_links: candidateLinks,
      headings,
      data_signals: {
        has_window_context_result: Boolean(result),
        has_next_data: Boolean(nextData),
        has_nuxt_data: Boolean(window.__NUXT__),
        has_init_data: Boolean(window.__INIT_DATA__),
        has_apollo_state: Boolean(window.__APOLLO_STATE__),
        has_detail_data: Boolean(window.detailData),
        json_ld_count: jsonLdScripts.length,
        result_keys: result ? Object.keys(result) : [],
        model_keys: model ? Object.keys(model) : [],
        data_keys: data ? Object.keys(data).slice(0, 80) : [],
      },
      structured_samples: {
        window_context_model: model ? summarizeValue(model) : null,
        window_context_data: data ? summarizeValue(data) : null,
        next_data: nextData ? clean(nextData.textContent).slice(0, 3000) : null,
        nuxt_data: window.__NUXT__ ? summarizeValue(window.__NUXT__) : null,
        init_data: window.__INIT_DATA__ ? summarizeValue(window.__INIT_DATA__) : null,
        apollo_state: window.__APOLLO_STATE__ ? summarizeValue(window.__APOLLO_STATE__) : null,
        json_ld: jsonLdScripts.map((item) => summarizeValue(item)),
      },
    };
  });

  const json = `${JSON.stringify(observation, null, 2)}\n`;
  if (args.out) {
    await writeFile(args.out, json);
    console.log(args.out);
  } else {
    process.stdout.write(json);
  }
  await browser.close();
}

main().catch((error) => {
  console.error(`probe-cdp-page failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

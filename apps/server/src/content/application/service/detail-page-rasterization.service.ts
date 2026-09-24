import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { type Page } from 'puppeteer';
import type { RenderImageInput } from './detail-page-requests';

const STATIC_ROOT = '/data/products';
const PROCESSED_PREFIX = '/processed/';
const RENDER_TIMEOUT_MS = 120_000;
const ASSET_READY_TIMEOUT_MS = 8_000;
const DEFAULT_VIEWPORT_WIDTH = 720;
const DEFAULT_VIEWPORT_HEIGHT = 1200;
const MAX_RENDER_SCALE = 3;
const MAX_RASTER_OUTPUT_PIXELS = 45_000_000;

interface ScreenshotClip {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RasterConfig {
  viewportWidth: number;
  renderScale: number;
  format: 'png' | 'jpeg';
  quality: number | undefined;
}

interface RasterizedDetailPage {
  buffer: Buffer;
  contentType: 'image/png' | 'image/jpeg';
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  return map[ext.toLowerCase()] || 'image/png';
}

async function toDataUri(src: string): Promise<string | null> {
  try {
    if (src.startsWith('data:')) return src;

    const url = new URL(src, 'http://localhost');
    if (url.pathname.startsWith(PROCESSED_PREFIX)) {
      const relative = url.pathname.slice(PROCESSED_PREFIX.length);
      const filePath = path.join(STATIC_ROOT, relative);
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        const mime = mimeFromExt(path.extname(filePath));
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    }

    if (src.startsWith('/')) {
      const port = Number(process.env.PORT) || 4000;
      const resp = await fetch(`http://localhost:${port}${url.pathname}${url.search}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return null;
      const contentType = resp.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await resp.arrayBuffer());
      return `data:${contentType.split(';')[0]};base64,${buf.toString('base64')}`;
    }

    if (src.startsWith('http://') || src.startsWith('https://')) {
      const resp = await fetch(src, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) return null;
      const contentType = resp.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await resp.arrayBuffer());
      return `data:${contentType.split(';')[0]};base64,${buf.toString('base64')}`;
    }
  } catch {
    // Keep the original source if inlining fails.
  }
  return null;
}

async function inlineImages(html: string): Promise<string> {
  const imgRegex = /<img\s[^>]*src=["']([^"']+)["'][^>]*>/gi;
  const matches = [...html.matchAll(imgRegex)];
  if (matches.length === 0) return html;

  const unique = [...new Set(matches.map((m) => m[1]))];
  const resolved = await Promise.all(unique.map((src) => toDataUri(src)));

  const urlMap = new Map<string, string>();
  unique.forEach((src, i) => {
    if (resolved[i]) urlMap.set(src, resolved[i]!);
  });

  if (urlMap.size === 0) return html;

  return html.replace(imgRegex, (full, src) => {
    const dataUri = urlMap.get(src);
    return dataUri ? full.replace(src, dataUri) : full;
  });
}

async function waitForPageAssets(page: Page): Promise<void> {
  await page.evaluate(async (timeoutMs) => {
    const timeoutTask = new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    });
    const imageTasks = Array.from(document.images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, timeoutMs);
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.addEventListener('load', () => window.clearTimeout(timeout), { once: true });
        img.addEventListener('error', () => window.clearTimeout(timeout), { once: true });
      });
    });

    const fontTask =
      'fonts' in document
        ? (document.fonts.ready as Promise<FontFaceSet>)
            .then(() => undefined)
            .catch(() => undefined)
        : Promise.resolve();

    await Promise.race([
      Promise.all([...imageTasks, fontTask]).then(() => undefined),
      timeoutTask,
    ]);
  }, ASSET_READY_TIMEOUT_MS);
}

async function getContentClip(page: Page, viewportWidth: number): Promise<ScreenshotClip | null> {
  return page.evaluate((width) => {
    const selectors = [
      'section',
      'img',
      'table',
      '[data-section]',
      '[data-container]',
      '[data-field]',
      '[data-role]',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'ul',
      'ol',
      'li',
    ].join(',');
    const contentElements = Array.from(document.body.querySelectorAll(selectors)) as HTMLElement[];
    const candidates = contentElements.length > 0 ? contentElements : Array.from(document.body.children) as HTMLElement[];
    const rects = candidates
      .filter((el) => !el.closest('.gjs-selected, .gjs-selected-parent, .gjs-hovered'))
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);

    if (rects.length === 0) {
      const scrollWidth = Math.max(
        width,
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      );
      const scrollHeight = Math.max(
        window.innerHeight,
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      return {
        x: 0,
        y: 0,
        width: Math.max(1, Math.min(width, Math.ceil(scrollWidth))),
        height: Math.max(1, Math.ceil(scrollHeight)),
      };
    }

    const left = Math.max(0, Math.floor(Math.min(...rects.map((rect) => rect.left))));
    const top = Math.max(0, Math.floor(Math.min(...rects.map((rect) => rect.top))));
    const right = Math.min(width, Math.ceil(Math.max(...rects.map((rect) => rect.right))));
    const bottom = Math.ceil(Math.max(...rects.map((rect) => rect.bottom)));
    const clipWidth = Math.max(1, right - left);
    const clipHeight = Math.max(1, bottom - top);

    return {
      x: left,
      y: top,
      width: clipWidth,
      height: clipHeight,
    };
  }, viewportWidth);
}

function resolveRasterConfig(body: RenderImageInput): RasterConfig {
  const viewportWidth = body.viewportWidth ?? DEFAULT_VIEWPORT_WIDTH;
  const renderScale = body.outputWidth
    ? body.outputWidth / viewportWidth
    : body.renderScale ?? 1;
  if (!Number.isFinite(renderScale) || renderScale <= 0 || renderScale > MAX_RENDER_SCALE) {
    throw new BadRequestException('render scale too large');
  }
  const format = body.format ?? 'png';
  return {
    viewportWidth,
    renderScale,
    format,
    quality: format === 'jpeg' ? body.quality ?? 92 : undefined,
  };
}

function assertRasterPixelBudget(
  clip: ScreenshotClip | null,
  config: RasterConfig,
): void {
  const width = clip?.width ?? config.viewportWidth;
  const height = clip?.height ?? DEFAULT_VIEWPORT_HEIGHT;
  const outputPixels = Math.ceil(width * height * config.renderScale * config.renderScale);
  if (outputPixels > MAX_RASTER_OUTPUT_PIXELS) {
    throw new BadRequestException('render output too large');
  }
}

@Injectable()
export class DetailPageRasterizationService {
  private readonly logger = new Logger(DetailPageRasterizationService.name);

  async render(body: RenderImageInput): Promise<RasterizedDetailPage> {
    const config = resolveRasterConfig(body);
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const inlinedHtml = await inlineImages(body.html);
      this.logger.log(`Inlined images in HTML (${body.html.length} -> ${inlinedHtml.length} bytes)`);

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(RENDER_TIMEOUT_MS);
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.setViewport({
        width: config.viewportWidth,
        height: DEFAULT_VIEWPORT_HEIGHT,
        deviceScaleFactor: config.renderScale,
      });
      await page.setContent(inlinedHtml, {
        waitUntil: 'domcontentloaded',
        timeout: RENDER_TIMEOUT_MS,
      });
      await page.addStyleTag({
        content: `
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body > div:first-child {
            background: #fff !important;
          }

          body > div:first-child > .py-10 {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }

          body > div:first-child > .py-10 > div {
            width: 100% !important;
            max-width: none !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            box-shadow: none !important;
          }
        `,
      });
      await waitForPageAssets(page);
      const clip = await getContentClip(page, config.viewportWidth);
      assertRasterPixelBudget(clip, config);
      const buffer = await page.screenshot({
        ...(clip ? { clip } : { fullPage: true }),
        type: config.format,
        omitBackground: false,
        quality: config.quality,
      });
      return {
        buffer: Buffer.from(buffer),
        contentType: config.format === 'jpeg' ? 'image/jpeg' : 'image/png',
      };
    } finally {
      await browser.close();
    }
  }
}

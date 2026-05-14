import { Body, Controller, HttpCode, Logger, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { type Page } from 'puppeteer';
import { RenderImageBodyDto } from './dto';

const STATIC_ROOT = '/data/products';
const PROCESSED_PREFIX = '/processed/';
const RENDER_TIMEOUT_MS = 120_000;
const ASSET_READY_TIMEOUT_MS = 8_000;
const DEFAULT_VIEWPORT_WIDTH = 720;

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
    if (src.startsWith('data:')) {
      return src;
    }

    // 로컬 /processed/ 경로 → 파일시스템에서 직접 읽기
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

    // 외부 URL → HTTP fetch
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const resp = await fetch(src, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) return null;
      const contentType = resp.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await resp.arrayBuffer());
      return `data:${contentType.split(';')[0]};base64,${buf.toString('base64')}`;
    }
  } catch {
    // 변환 실패 시 원본 유지
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

async function getContentClip(page: Page, viewportWidth: number) {
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

    if (rects.length === 0) return null;

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

@Controller('render-image')
export class RenderImageController {
  private readonly logger = new Logger(RenderImageController.name);

  @Post()
  @HttpCode(200)
  async render(@Body() body: RenderImageBodyDto, @Res() res: Response): Promise<void> {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const inlinedHtml = await inlineImages(body.html);
      this.logger.log(`Inlined images in HTML (${body.html.length} → ${inlinedHtml.length} bytes)`);

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(RENDER_TIMEOUT_MS);
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      const viewportWidth = body.viewportWidth ?? DEFAULT_VIEWPORT_WIDTH;
      const renderScale = body.outputWidth
        ? body.outputWidth / viewportWidth
        : body.renderScale ?? 1;
      await page.setViewport({
        width: viewportWidth,
        height: 1200,
        deviceScaleFactor: renderScale,
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
      const format = body.format ?? 'png';
      const clip = await getContentClip(page, viewportWidth);
      const buffer = await page.screenshot({
        ...(clip ? { clip } : { fullPage: true }),
        type: format,
        omitBackground: false,
        quality: format === 'jpeg' ? body.quality ?? 92 : undefined,
      });
      res.setHeader('Content-Type', format === 'jpeg' ? 'image/jpeg' : 'image/png');
      res.send(buffer);
    } finally {
      await browser.close();
    }
  }
}

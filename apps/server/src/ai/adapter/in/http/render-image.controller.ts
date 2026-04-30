import { Body, Controller, HttpCode, Logger, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { RenderImageBodyDto } from './dto';

const STATIC_ROOT = '/data/products';
const PROCESSED_PREFIX = '/processed/';

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
      await page.setViewport({ width: 860, height: 1200 });
      await page.setContent(inlinedHtml, { waitUntil: 'networkidle0' });
      const pngBuffer = await page.screenshot({ fullPage: true });
      res.setHeader('Content-Type', 'image/png');
      res.send(pngBuffer);
    } finally {
      await browser.close();
    }
  }
}

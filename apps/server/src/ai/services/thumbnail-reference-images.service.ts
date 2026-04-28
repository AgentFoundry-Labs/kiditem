import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

type InlinePart = { inlineData: { data: string; mimeType: string } };
type TextPart = { text: string };
type Part = InlinePart | TextPart;

const ALLOWED_EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Loads thumbnail-reference assets at module init and exposes the resulting
 * inline-data parts for Gemini generation/compliance prompts. The references
 * help the model imitate compliant Coupang thumbnail composition without
 * supplying a specific style.
 *
 * Asset locations are resolved in this order so that both `npm run dev`
 * (cwd = repo root) and `node dist/main` (cwd = apps/server) work without
 * configuration:
 *   1. {cwd}/assets/thumbnail-references
 *   2. {cwd}/apps/server/assets/thumbnail-references
 *
 * Missing directory or file read errors are tolerated — generation still
 * works, callers just receive an empty parts array.
 */
@Injectable()
export class ThumbnailReferenceImagesService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailReferenceImagesService.name);
  private readonly parts: InlinePart[] = [];

  onModuleInit(): void {
    this.warm();
  }

  generationParts(header: string): Part[] {
    if (this.parts.length === 0) return [];
    return [{ text: header }, ...this.parts];
  }

  complianceParts(header: string): Part[] {
    if (this.parts.length === 0) return [];
    return [{ text: header }, ...this.parts];
  }

  private warm(): void {
    const candidates = [
      join(process.cwd(), 'assets/thumbnail-references'),
      join(process.cwd(), 'apps/server/assets/thumbnail-references'),
    ];
    const dir = candidates.find((c) => existsSync(c));
    if (!dir) {
      this.logger.log(`thumbnail reference images directory not found; tried ${candidates.join(', ')}`);
      return;
    }
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      this.logger.warn(
        `failed to read thumbnail reference dir ${dir}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    for (const name of entries) {
      const ext = extname(name).toLowerCase();
      const mimeType = ALLOWED_EXT_TO_MIME[ext];
      if (!mimeType) continue;
      try {
        const data = readFileSync(join(dir, name)).toString('base64');
        this.parts.push({ inlineData: { data, mimeType } });
      } catch (err) {
        this.logger.warn(
          `failed to read reference image ${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(`thumbnail reference images warmed: ${this.parts.length}`);
  }
}

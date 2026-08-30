import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response as ExpressResponse } from 'express';

const SAFE_HEADERS = new Set([
  'cache-control',
  'content-encoding',
  'content-length',
  'content-type',
  'etag',
  'last-modified',
  'x-accel-buffering',
]);
const MAX_HEADER_VALUE_BYTES = 8_192;

/** Adapts one self-contained fetch response without carrying MCP headers or state. */
export class McpHttpResponseAdapter {
  async write(response: Response, target: ExpressResponse, signal: AbortSignal): Promise<void> {
    target.status(safeStatus(response.status));
    response.headers.forEach((value, name) => {
      const normalized = name.toLowerCase();
      if (SAFE_HEADERS.has(normalized) && Buffer.byteLength(value, 'utf8') <= MAX_HEADER_VALUE_BYTES) {
        target.setHeader(normalized, value);
      }
    });
    if (!response.body) {
      target.end();
      return;
    }
    await pipeline(Readable.fromWeb(response.body as never), target, { signal });
  }
}

function safeStatus(status: number): number {
  return Number.isInteger(status) && status >= 200 && status <= 599 ? status : 500;
}

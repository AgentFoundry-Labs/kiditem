import { Injectable } from '@nestjs/common';
import { StorageService } from '../../../../common/storage/storage.service';
import type {
  SalesProductImageMirrorOutcome,
  SalesProductImageMirrorPort,
} from '../../../application/port/out/storage/sales-product-image-mirror.port';
import { isMirrorableImageUrl } from '../../../domain/sales-product-images';

const FETCH_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** 받은 내용의 첫 바이트로 사진 형식을 가린다. 주소의 확장자나 서버가 말한 형식은 믿지 않는다. */
function detectImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

@Injectable()
export class SalesProductImageMirrorAdapter implements SalesProductImageMirrorPort {
  constructor(private readonly storage: StorageService) {}

  urlFor(key: string): string {
    return this.storage.getUrl(key);
  }

  isOwnedUrl(url: string): boolean {
    return this.storage.extractKey(url) !== null;
  }

  async mirror(input: { sourceUrl: string; key: string }): Promise<SalesProductImageMirrorOutcome> {
    if (!isMirrorableImageUrl(input.sourceUrl)) {
      return { ok: false, reason: '허용되지 않은 원본 주소' };
    }
    let response: Response;
    try {
      // 다른 곳으로 돌려보내면 따라가지 않는다 — 받는 곳은 도메인이 고른 주소뿐이다.
      response = await fetch(input.sourceUrl, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (error) {
      return { ok: false, reason: (error as Error).name === 'TimeoutError' ? '시간 초과' : '받지 못함' };
    }
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_IMAGE_BYTES) return { ok: false, reason: '15MB 넘음' };
    let bytes: Buffer;
    try {
      bytes = Buffer.from(await response.arrayBuffer());
    } catch {
      return { ok: false, reason: '사진을 읽지 못함' };
    }
    if (bytes.length === 0) return { ok: false, reason: '빈 파일' };
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: '15MB 넘음' };
    const mimeType = detectImageMime(bytes);
    if (!mimeType) return { ok: false, reason: '사진 파일이 아님' };
    try {
      return { ok: true, url: await this.storage.save(input.key, bytes, mimeType) };
    } catch {
      return { ok: false, reason: '사진 저장 실패' };
    }
  }
}

import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';

/**
 * 몰 대량등록 사진 올리기(KID-366, 옛 `orders/mall-utility-actions.js` `hostPublicImages` 이식). 우리 사진 저장소(로컬·사무실
 * MinIO) 사진을 우리 상점 첨부 저장소(키즈노트 `/_manage/`)에 관리자 쿠키로 올리고, 첨부 목록에 생긴 카카오 CDN 주소를 공개
 * 주소로 돌려준다. 창을 열지 않고 상품을 만들지도 않는다 — `pno`는 등록 화면이 발급하는 빈 번호일 뿐이다.
 */
export const PUBLIC_IMAGE_SOURCE_ORIGINS = ['http://localhost:9000', 'http://kiditem-office:9000'] as const;
/** 한 번 부를 때 올리는 사진 수. 웹이 나눠 부르며 진행을 보인다. */
export const PUBLIC_IMAGE_BATCH = 20;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const KIDSNOTE_ORIGIN = 'https://shop.kidsnote.com';
const REGISTER_PATH = '/_manage/?body=product@product_register';
const UPLOAD_PATH = '/_manage/';
const LIST_PATH = '/_manage/?body=product@product_file.frm&filetype=3&stat=1&content_id=content2';
const HOSTED_URL = /https?:\/\/[A-Za-z0-9.-]*kakaocdn\.net\/dn\/[^"'\s<>()]+/g;

export interface HostedImage {
  sourceUrl: string;
  publicUrl: string | null;
  error: string | null;
}

class NeedsLogin extends Error {}

/** 올릴 주소 — 우리 저장소 주소만, 겹치지 않게, 한 묶음까지. 아니면 읽지도 않고 거절한다. */
function sources(urls: readonly string[]): string[] {
  if (urls.length === 0 || urls.length > PUBLIC_IMAGE_BATCH) {
    throw new RuntimeError('VALIDATION_FAILED', `사진은 한 번에 1장부터 ${PUBLIC_IMAGE_BATCH}장까지 올립니다.`, { fields: ['urls'] });
  }
  const unique: string[] = [];
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new RuntimeError('VALIDATION_FAILED', '사진 주소가 올바르지 않습니다.', { fields: ['urls'] });
    }
    if (!(PUBLIC_IMAGE_SOURCE_ORIGINS as readonly string[]).includes(url.origin)) {
      throw new RuntimeError('VALIDATION_FAILED', '우리 사진 저장소 주소만 올립니다.', { fields: ['urls'] });
    }
    if (!unique.includes(url.href)) unique.push(url.href);
  }
  return unique;
}

function fileNameFor(sourceUrl: string, mime: string): string {
  let base = 'detail';
  try {
    base = new URL(sourceUrl).pathname.split('/').pop() || base;
  } catch {
    // 주소가 아니면 기본 이름.
  }
  if (/\.(jpe?g|png|gif|webp)$/i.test(base)) return base;
  return `${base}.${mime.includes('png') ? 'png' : 'jpg'}`;
}

async function hostOne(fetch: (url: string, init?: RequestInit) => Promise<Response>, sourceUrl: string): Promise<string> {
  const decode = (buffer: ArrayBuffer) => new TextDecoder('euc-kr').decode(buffer);
  const source = await fetch(sourceUrl);
  if (!source.ok) throw new Error(`사진을 읽지 못했습니다(HTTP ${source.status}).`);
  const blob = await source.blob();
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('사진이 8MB를 넘습니다.');
  if (!/^image\//i.test(blob.type || '')) throw new Error('사진 파일이 아닙니다.');
  const read = async (path: string) => {
    const response = await fetch(KIDSNOTE_ORIGIN + path, { credentials: 'include' });
    if (!response.ok) throw new Error(`첨부 저장소가 HTTP ${response.status}로 답했습니다.`);
    return decode(await response.arrayBuffer());
  };
  const pno = (await read(REGISTER_PATH)).match(/name=["']?pno["']?[^>]*value=["']?(\d+)/i)?.[1];
  // 번호가 없는 건 거의 언제나 로그인 화면이 온 것이다.
  if (!pno) throw new NeedsLogin();
  const body = new FormData();
  body.append('body', 'product@product_file.exe');
  body.append('pno', pno);
  body.append('upload_one', 'Y');
  body.append('filetype', '3');
  body.append('ino', '');
  body.append('upfile', blob, fileNameFor(sourceUrl, blob.type));
  const upload = await fetch(KIDSNOTE_ORIGIN + UPLOAD_PATH, { method: 'POST', body, credentials: 'include' });
  if (!upload.ok) throw new Error(`올리기가 HTTP ${upload.status}로 끝났습니다.`);
  await upload.arrayBuffer();
  // 주소는 응답이 아니라 첨부 목록에 생긴다.
  const found = (await read(`${LIST_PATH}&pno=${pno}`)).match(HOSTED_URL);
  if (!found || found.length === 0) throw new Error('올라간 주소를 찾지 못했습니다.');
  return found[found.length - 1]!;
}

/**
 * 사진마다 결과를 따로 돌려준다(못 올린 사진은 `error`). 키즈노트 관리자에서 로그아웃이면 나머지도 안 되니 멈추고
 * `SITE_LOGIN_REQUIRED`(details: 그때까지 올린 수)로 알린다. 받은 주소를 우리 서버에 저장하는 것은 웹이 한다.
 */
export async function hostPublicImages(deps: { fetch(url: string, init?: RequestInit): Promise<Response> }, urls: readonly string[]): Promise<HostedImage[]> {
  const images: HostedImage[] = [];
  for (const sourceUrl of sources(urls)) {
    try {
      images.push({ sourceUrl, publicUrl: await hostOne(deps.fetch, sourceUrl), error: null });
    } catch (error) {
      if (error instanceof NeedsLogin) {
        throw new RuntimeError(SITE_LOGIN_REQUIRED, '키즈노트 관리자에 로그인되어 있지 않습니다.', { site: 'kidsnote', done: images.length });
      }
      images.push({ sourceUrl, publicUrl: null, error: (error instanceof Error && error.message ? error.message : String(error)).slice(0, 200) });
    }
  }
  return images;
}

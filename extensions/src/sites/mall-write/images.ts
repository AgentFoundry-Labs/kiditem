/**
 * 몰 쓰기의 사진 옮기기(옛 `mall-form-register.js` `toDataUrls`·`hostDetailImage` 이식, KID-256). 서비스워커가 우리 저장소
 * 사진을 읽어 data URL로 건넨다 — 몰 화면에서 우리 저장소(`localhost:9000`)를 부르면 CORS로 막힌다. 상세 사진이 몰이 읽을 수
 * 없는 주소면 우리 상점 첨부 저장소(키즈노트)나 몰 자기 서버(온채널)에 먼저 올려 공개 주소를 받는다(창을 열지 않는다).
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** 페이지 호출로 넘기는 사진 하나(옛 모양 그대로). 못 읽었으면 `error`. */
export interface LoadedImage {
  name: string;
  dataUrl?: string;
  fileName?: string;
  error?: string;
}

/** 상세 사진을 올릴 곳(옛 `DETAIL_HOSTS`). */
export interface DetailHost {
  origin: string;
  label: string;
  /** 응답이 곧 주소인 업로더(온채널). */
  uploadPath: string;
  uploadField?: string;
  /** 첨부 목록으로 주소를 찾는 저장소(키즈노트). */
  registerPath?: string;
  listPath?: string;
  filetype?: string;
  loginLabel?: string;
}

export const DETAIL_HOSTS: Record<string, DetailHost> = {
  /** 온채널 자기 서버. 상품등록 화면 안의 `img_form`이 쏘는 곳이고 응답이 곧 공개 주소다(라이브 확인 2026-09-10). */
  onch: {
    origin: 'https://www.onch3.co.kr',
    uploadPath: '/access/img_upload_access.php',
    uploadField: 'img',
    label: '온채널 이미지 서버',
  },
  /**
   * 우리 키즈노트 상점의 상품 첨부 저장소. 등록화면이 발급하는 빈 상품번호(`pno`)에 파일을 붙이고 첨부 목록에서 공개 CDN
   * 주소를 읽는다 — 상품은 만들어지지 않는다(라이브 확인 2026-09-10). 키즈노트 관리자 세션으로만 열린다.
   */
  kidsnote: {
    origin: 'https://shop.kidsnote.com',
    registerPath: '/_manage/?body=product@product_register',
    uploadPath: '/_manage/',
    listPath: '/_manage/?body=product@product_file.frm&filetype=3&stat=1&content_id=content2',
    filetype: '3',
    label: '키즈노트 첨부 저장소',
    loginLabel: '키즈노트 관리자',
  },
};

/** 첨부 목록에서 올라간 파일 주소를 집는 자리. */
const HOSTED_URL = /https?:\/\/[A-Za-z0-9.-]*kakaocdn\.net\/dn\/[^"'\s<>()]+/g;

/** 로그인이 풀려 상품번호를 받지 못했다(대개 로그인 화면이 왔다). */
export class DetailHostLoginError extends Error {
  readonly needsLogin = true;
}

/** 이미 몰이 읽을 수 있는 주소인가. */
export function isMallReadable(url: string): boolean {
  return /kakaocdn\.net|diskn\.com|onch3\.co\.kr|coupangcdn\.com/.test(url);
}

/**
 * 상세설명에 넣을 이미지 한 줄. `referrerpolicy="no-referrer"`가 핵심이다 — 카카오 CDN은 리퍼러로 핫링크를 막는다
 * (라이브 확인 2026-09-10). 이 속성은 에디터 제출을 거쳐 그대로 남는다.
 */
export function detailImageHtml(url: string, paragraph: boolean): string {
  const img = `<img referrerpolicy="no-referrer" src="${url}">`;
  return paragraph ? `<center><p>${img}</p></center>` : `<center>${img}</center>`;
}

/** 올릴 때 쓸 파일명. 저장소가 확장자를 보므로 없으면 붙여 준다. */
export function detailFileName(sourceUrl: string, mime: string): string {
  let base = 'detail';
  try {
    base = new URL(sourceUrl).pathname.split('/').pop() || base;
  } catch {
    // 주소가 아니면 기본값.
  }
  if (/\.(jpe?g|png|gif|webp)$/i.test(base)) return base;
  return `${base}.${mime.includes('png') ? 'png' : 'jpg'}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

/** 우리 저장소 사진을 data URL로(8MB 상한). 못 읽은 사진은 버리지 않고 까닭을 남긴다 — 빠진 채로 "채웠다"고 하지 않는다. */
export async function toDataUrls(fetchApi: Fetch, uploads: Array<{ name: string; url: string }>): Promise<LoadedImage[]> {
  const images: LoadedImage[] = [];
  for (const upload of uploads) {
    try {
      const response = await fetchApi(upload.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size > MAX_IMAGE_BYTES) throw new Error('이미지가 8MB 를 넘습니다.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const dataUrl = `data:${blob.type || 'image/jpeg'};base64,${toBase64(bytes)}`;
      const fileName = new URL(upload.url).pathname.split('/').pop() || 'image';
      images.push({ name: upload.name, dataUrl, fileName });
    } catch (error) {
      // 어느 주소에서 막혔는지 남긴다. 'Failed to fetch' 만으로는 권한 문제인지 알 수 없다.
      let host = '';
      try {
        host = new URL(upload.url).host;
      } catch {
        // 주소가 아니면 비워 둔다.
      }
      const message = error instanceof Error ? error.message : String(error);
      images.push({ name: upload.name, error: host ? `${message} (${host})` : message });
    }
  }
  return images;
}

/**
 * 상세 이미지를 올려 공개 주소를 받는다(옛 `hostDetailImage`). 응답이 곧 주소인 업로더(온채널)는 한 번, 첨부 저장소
 * (키즈노트)는 빈 상품번호 받기 → 올리기 → 첨부 목록 읽기. 둘 다 euc-kr 화면이다.
 */
export async function hostDetailImage(fetchApi: Fetch, host: DetailHost, sourceUrl: string, options: { imageOnly?: boolean } = {}): Promise<string> {
  const decode = (buffer: ArrayBuffer) => new TextDecoder('euc-kr').decode(buffer);
  const source = await fetchApi(sourceUrl);
  if (!source.ok) throw new Error(`상세 이미지를 읽지 못했습니다 — HTTP ${source.status}`);
  const blob = await source.blob();
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('상세 이미지가 8MB 를 넘습니다.');
  if (options.imageOnly && !/^image\//i.test(blob.type || '')) throw new Error('사진 파일이 아닙니다.');

  if (host.uploadField) {
    const body = new FormData();
    body.append(host.uploadField, blob, detailFileName(sourceUrl, blob.type));
    const response = await fetchApi(host.origin + host.uploadPath, { method: 'POST', body, credentials: 'include' });
    if (!response.ok) throw new Error(`업로드 응답 HTTP ${response.status}`);
    const url = decode(await response.arrayBuffer()).trim();
    if (!/^https?:\/\//.test(url)) throw new Error('업로드 결과가 주소가 아닙니다.');
    return url;
  }
  const read = async (path: string) => {
    const response = await fetchApi(host.origin + path, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return decode(await response.arrayBuffer());
  };
  // 1) 빈 상품번호를 받는다. 번호가 없는 건 거의 언제나 로그인 화면이 온 것이다.
  const page = await read(host.registerPath ?? '');
  const pno = (page.match(/name=["']?pno["']?[^>]*value=["']?(\d+)/i) || [])[1];
  if (!pno) throw new DetailHostLoginError('상품번호를 받지 못했습니다.');
  // 2) 우리가 렌더한 이미지를 그대로 올린다.
  const body = new FormData();
  body.append('body', 'product@product_file.exe');
  body.append('pno', pno);
  body.append('upload_one', 'Y');
  body.append('filetype', host.filetype ?? '');
  body.append('ino', '');
  body.append('upfile', blob, detailFileName(sourceUrl, blob.type));
  const upload = await fetchApi(host.origin + host.uploadPath, { method: 'POST', body, credentials: 'include' });
  if (!upload.ok) throw new Error(`업로드 응답 HTTP ${upload.status}`);
  await upload.arrayBuffer();
  // 3) 주소는 응답이 아니라 첨부 목록에 생긴다.
  const list = await read(`${host.listPath ?? ''}&pno=${pno}`);
  const found = list.match(HOSTED_URL);
  if (!found || found.length === 0) throw new Error('올라간 주소를 찾지 못했습니다.');
  return found[found.length - 1]!;
}

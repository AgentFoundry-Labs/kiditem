import { describe, expect, it } from 'vitest';
import { hostPublicImages, PUBLIC_IMAGE_BATCH } from './image-host';

const text = (body: string, status = 200) => new Response(new TextEncoder().encode(body), { status });

/** 키즈노트 쪽은 등록화면(빈 상품번호) → 첨부 업로드 → 첨부 목록 세 번이고, 창을 열지 않는다. */
function harness({ signedIn = true, contentType = 'image/jpeg' } = {}) {
  const calls: string[] = [];
  let uploads = 0;
  const fetch = async (url: string, init: RequestInit = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url}`);
    if (url.startsWith('http://localhost:9000/') || url.startsWith('http://kiditem-office:9000/')) {
      return new Response(new Blob(['jpeg-bytes'], { type: contentType }), { status: 200 });
    }
    if (url.includes('product@product_register')) {
      return text(signedIn ? '<form><input type="hidden" name="pno" value="9001"></form>' : '<form id="login"></form>');
    }
    if (init.method === 'POST') {
      uploads += 1;
      expect(init.credentials).toBe('include');
      return text('');
    }
    if (url.includes('product@product_file.frm')) return text(`<img src="https://kids-wi.kakaocdn.net/dn/aa/bb/${uploads}.jpg">`);
    throw new Error(`예상하지 않은 요청 ${url}`);
  };
  return { fetch, calls };
}

describe('몰 사진 호스팅(KID-366 hostPublicImages, 옛 mall-utility-actions 이식)', () => {
  it('우리 저장소 사진을 키즈노트 첨부 저장소에 올려 사진마다 공개 주소를 돌려준다(같은 사진은 한 번)', async () => {
    const { fetch, calls } = harness();
    const images = await hostPublicImages({ fetch }, [
      'http://localhost:9000/kiditem/candidates/a/1.jpg',
      'http://kiditem-office:9000/kiditem/candidates/a/2.jpg',
      'http://localhost:9000/kiditem/candidates/a/1.jpg',
    ]);
    expect(images).toEqual([
      { sourceUrl: 'http://localhost:9000/kiditem/candidates/a/1.jpg', publicUrl: 'https://kids-wi.kakaocdn.net/dn/aa/bb/1.jpg', error: null },
      { sourceUrl: 'http://kiditem-office:9000/kiditem/candidates/a/2.jpg', publicUrl: 'https://kids-wi.kakaocdn.net/dn/aa/bb/2.jpg', error: null },
    ]);
    expect(calls.filter((call) => call.startsWith('POST ')).length).toBe(2);
  });

  it('우리 사진 저장소가 아닌 주소와 한 묶음을 넘는 요청은 읽지도 않고 VALIDATION_FAILED로 거절한다', async () => {
    const { fetch, calls } = harness();
    await expect(hostPublicImages({ fetch }, ['https://shop.kidsnote.com/_manage/?body=member@list'])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const many = Array.from({ length: PUBLIC_IMAGE_BATCH + 1 }, (_, index) => `http://localhost:9000/kiditem/${index}.jpg`);
    await expect(hostPublicImages({ fetch }, many)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(PUBLIC_IMAGE_BATCH).toBe(20);
    expect(calls).toEqual([]);
  });

  it('사진이 아닌 파일은 올리지 않고 그 사진만 실패로 돌려준다', async () => {
    const { fetch, calls } = harness({ contentType: 'text/html' });
    const [image] = await hostPublicImages({ fetch }, ['http://localhost:9000/kiditem/a.jpg']);
    expect(image).toMatchObject({ publicUrl: null, error: '사진 파일이 아닙니다.' });
    expect(calls.some((call) => call.startsWith('POST '))).toBe(false);
  });

  it('키즈노트 관리자에서 로그아웃이면 첫 사진에서 멈추고 SITE_LOGIN_REQUIRED로 알린다', async () => {
    const { fetch } = harness({ signedIn: false });
    await expect(hostPublicImages({ fetch }, ['http://localhost:9000/kiditem/a.jpg', 'http://localhost:9000/kiditem/b.jpg'])).rejects.toMatchObject({
      code: 'SITE_LOGIN_REQUIRED',
      message: '키즈노트 관리자에 로그인되어 있지 않습니다.',
      details: { site: 'kidsnote', done: 0 },
    });
  });
});

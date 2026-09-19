import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(repoRoot, 'extensions/kiditem-os/background/orders/mall-form-register.js');

function loadModule() {
  const context = {
    self: {}, console, URL, URLSearchParams, TextDecoder, TextEncoder,
    FormData, Blob, File, Promise, Date, setTimeout, clearTimeout,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

const text = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  arrayBuffer: async () => new TextEncoder().encode(body).buffer,
});

/**
 * 몰 대량등록 사진 올리기 — 우리 저장소 사진을 키즈노트 첨부 저장소에 올려 공개 주소를 받는다.
 * 키즈노트 쪽은 등록화면(빈 상품번호) → 첨부 업로드 → 첨부 목록 세 번이고, 창을 열지 않는다.
 */
function harness({ signedIn = true, contentType = 'image/jpeg' } = {}) {
  const calls = [];
  let uploads = 0;
  const fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push(`${init.method ?? 'GET'} ${target}`);
    if (target.startsWith('http://localhost:9000/') || target.startsWith('http://kiditem-office:9000/')) {
      return { ok: true, status: 200, blob: async () => new Blob(['jpeg-bytes'], { type: contentType }) };
    }
    if (target.includes('product@product_register')) {
      return text(signedIn ? '<form><input type="hidden" name="pno" value="9001"></form>' : '<form id="login"></form>');
    }
    if (init.method === 'POST') {
      uploads += 1;
      return text('');
    }
    if (target.includes('product@product_file.frm')) {
      return text(`<img src="https://kids-wi.kakaocdn.net/dn/aa/bb/${uploads}.jpg">`);
    }
    throw new Error(`예상하지 않은 요청 ${target}`);
  };
  const api = loadModule().create({
    chrome: { runtime: {}, scripting: {}, tabs: {} },
    fetch,
    interactiveTabs: { createTab: async () => { throw new Error('창을 열면 안 된다'); } },
    tabReason: 'test',
  });
  return { api, calls };
}

test('⭐ 우리 저장소 사진을 첨부 저장소에 올리고 사진마다 공개 주소를 돌려준다(창을 열지 않는다)', async () => {
  const { api, calls } = harness();
  const result = await api.hostPublicImages({
    urls: [
      'http://localhost:9000/kiditem/candidates/a/1.jpg',
      'http://kiditem-office:9000/kiditem/candidates/a/2.jpg',
      'http://localhost:9000/kiditem/candidates/a/1.jpg',
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.images)), [
    { sourceUrl: 'http://localhost:9000/kiditem/candidates/a/1.jpg', publicUrl: 'https://kids-wi.kakaocdn.net/dn/aa/bb/1.jpg' },
    { sourceUrl: 'http://kiditem-office:9000/kiditem/candidates/a/2.jpg', publicUrl: 'https://kids-wi.kakaocdn.net/dn/aa/bb/2.jpg' },
  ]);
  assert.equal(calls.filter((call) => call.startsWith('POST ')).length, 2, '같은 사진은 한 번만 올린다');
});

test('⭐ 우리 사진 저장소가 아닌 주소와 한 묶음을 넘는 요청은 읽지도 않고 거절한다', async () => {
  const { api, calls } = harness();
  await assert.rejects(
    api.hostPublicImages({ urls: ['https://shop.kidsnote.com/_manage/?body=member@list'] }),
    /우리 사진 저장소 주소만/,
  );
  await assert.rejects(api.hostPublicImages({ urls: [] }), /올릴 사진 주소가 없습니다/);
  const many = Array.from({ length: 21 }, (_, index) => `http://localhost:9000/kiditem/${index}.jpg`);
  await assert.rejects(api.hostPublicImages({ urls: many }), /20장까지/);
  assert.deepEqual(calls, []);
});

test('사진이 아닌 파일은 올리지 않고 그 사진만 실패로 돌려준다', async () => {
  const { api, calls } = harness({ contentType: 'text/html' });
  const result = await api.hostPublicImages({ urls: ['http://localhost:9000/kiditem/a.jpg'] });
  assert.equal(result.ok, true);
  assert.match(result.images[0].error, /사진 파일이 아닙니다/);
  assert.equal(calls.some((call) => call.startsWith('POST ')), false);
});

test('키즈노트 관리자에서 로그아웃이면 첫 사진에서 멈추고 로그인이 필요하다고 답한다', async () => {
  const { api } = harness({ signedIn: false });
  const result = await api.hostPublicImages({
    urls: ['http://localhost:9000/kiditem/a.jpg', 'http://localhost:9000/kiditem/b.jpg'],
  });
  assert.equal(result.ok, false);
  assert.equal(result.needsLogin, true);
  assert.equal(result.images.length, 1);
  assert.match(result.images[0].error, /키즈노트 관리자에 로그인되어 있지 않습니다/);
});

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import { spawnPlaywriter } from './playwriter-process';
import type { RepresentativeImageRunnerPort } from '../../../application/port/out/automation/representative-image-runner.port';

const WING_BASE =
  'https://wing.coupang.com/vendor-inventory/list?salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1';

const PLAYWRITER_TIMEOUT_MS = 120_000;
const PLAYWRITER_RUN_TIMEOUT_MS = 90_000;
const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

/**
 * 개발 서버의 Playwriter 로 Wing 대표이미지를 올린다(Agent 경로 전용). 운영(`NODE_ENV=production`)
 * 에서는 막혀 있고, 막힘은 호출자가 503 으로 알린다. 받은 data URL 을 임시 파일로 쓰고
 * Wing 상품 수정 화면의 대표 dropzone 에 넣는다.
 */
@Injectable()
export class WingThumbnailRunnerAdapter implements RepresentativeImageRunnerPort {
  private readonly logger = new Logger(WingThumbnailRunnerAdapter.name);

  isBlocked(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  async upload(input: Parameters<RepresentativeImageRunnerPort['upload']>[0]): Promise<
    | { outcome: 'uploaded_pending_save'; screenshotPath: string | null }
    | { outcome: 'definitive_failure'; error: string }
  > {
    if (this.isBlocked()) {
      return { outcome: 'definitive_failure', error: '스테이징/운영 Wing 등록은 Chrome 확장 프로그램으로만 실행할 수 있습니다.' };
    }
    const parsed = DATA_URL_PATTERN.exec(input.image.dataUrl);
    if (!parsed) return { outcome: 'definitive_failure', error: '대표이미지 데이터가 없습니다' };
    const safeName = input.image.filename.replace(/[^A-Za-z0-9._-]/g, '_');
    const imagePath = `/tmp/wing-upload-input-${safeName}`;
    const screenshotPath = `/tmp/wing-upload-${safeName.replace(/\.[^.]+$/, '')}.png`;
    await fs.promises.writeFile(imagePath, Buffer.from(parsed[2]!, 'base64'));

    const { productName } = input.listing;
    this.logger.log(`Wing 자동화 시작: ${productName}`);
    return new Promise((resolve, reject) => {
      const code = this.buildScript(productName, imagePath, screenshotPath);
      const proc = spawnPlaywriter(['-s', '1', '--timeout', String(PLAYWRITER_RUN_TIMEOUT_MS), '-e', code], {
        timeout: PLAYWRITER_TIMEOUT_MS,
      });

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('close', () => {
        this.logger.log(`playwriter stdout: ${stdout.trim()}`);
        if (stdout.includes('SUCCESS')) {
          resolve({ outcome: 'uploaded_pending_save', screenshotPath });
          return;
        }
        // 스크립트가 스스로 말한 실패(`ERROR:`)만 아무것도 올라가지 않았다는 증거다. 죽음 · 신호 ·
        // setInputFiles 뒤의 시간 초과는 사진이 이미 칸에 들어갔을 수 있으니 결과를 모른다.
        const explicit = stdout.match(/ERROR:(.+)/)?.[1]?.trim();
        if (explicit) {
          resolve({ outcome: 'definitive_failure', error: explicit });
          return;
        }
        reject(new Error(stderr.trim() || stdout.trim() || 'Playwriter exited without a result'));
      });

      proc.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  private buildScript(productName: string, imagePath: string, screenshotPath: string): string {
    const wingUrl = WING_BASE + `&searchKeywordType=ALL&searchKeywords=${encodeURIComponent(productName)}`;

    return `
(async () => {
  const PRODUCT_NAME = ${JSON.stringify(productName)};
  const IMAGE_PATH   = ${JSON.stringify(imagePath)};
  const SS_PATH      = ${JSON.stringify(screenshotPath)};

  let wingPage = context.pages().find(p => p.url().includes('vendor-inventory/list'));
  if (!wingPage) {
    wingPage = context.pages().find(p => p.url() === 'about:blank') ?? (await context.newPage());
  }
  await wingPage.goto(${JSON.stringify(wingUrl)}, { waitUntil: 'domcontentloaded' });
  state.wingPage = wingPage;

  const productRow = wingPage.locator('table tbody tr', { hasText: PRODUCT_NAME });
  await productRow.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (await productRow.count() === 0) { console.log('ERROR:상품을 찾을 수 없습니다'); return; }
  const editLink = productRow.first().locator('role=link[name="상품수정"]');

  const [modifyPage] = await Promise.all([
    context.waitForEvent('page', { timeout: 8000 }),
    editLink.click(),
  ]).catch(async () => {
    await new Promise(r => setTimeout(r, 2000));
    return [context.pages()[context.pages().length - 1]];
  });
  state.modifyPage = modifyPage;
  await state.modifyPage.waitForLoadState('domcontentloaded');
  await state.modifyPage.locator('.customdropzone').first().waitFor({ state: 'visible', timeout: 20000 });

  const sellerProductName = await state.modifyPage.evaluate(() => {
    const el = document.querySelector('input[placeholder*="등록상품명"]');
    return el ? (el.value || '') : '';
  });
  if (sellerProductName && sellerProductName !== PRODUCT_NAME) {
    console.log('ERROR:상품명 불일치 / 판매자관리용: ' + sellerProductName.slice(0, 40) + ' / 기대: ' + PRODUCT_NAME.slice(0, 40));
    return;
  }

  const repDzIdx = await state.modifyPage.evaluate(() => {
    const allDz = Array.from(document.querySelectorAll('.customdropzone'));
    const optionIdx = allDz.findIndex(el =>
      el.parentElement?.parentElement?.className?.includes('item-rep-cell')
    );
    if (optionIdx >= 0) return { mode: 'option', idx: optionIdx };
    return { mode: 'basic', idx: 0 };
  });
  console.log('등록 방식:', repDzIdx.mode);

  let repDz = state.modifyPage.locator('.customdropzone').nth(repDzIdx.idx);
  const repPreview = repDz.locator('.dz-preview').first();
  if (await repPreview.count() > 0) {
    await repPreview.hover();
    await new Promise(r => setTimeout(r, 500));
    const deleteBtn = repPreview.locator('a.dz-action.dz-action-remove').first();
    await deleteBtn.click({ force: true });
    const confirmBtn = state.modifyPage.locator('button', { hasText: '네, 삭제합니다' });
    await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
    await new Promise(r => setTimeout(r, 1500));
    await confirmBtn.click();
    await new Promise(r => setTimeout(r, 1000));
    await state.modifyPage.waitForFunction(
      (dzIdx) => {
        const allDz = Array.from(document.querySelectorAll('.customdropzone'));
        const dz = allDz[dzIdx]?.dropzone;
        return !dz || dz.files.length === 0;
      },
      repDzIdx.idx,
      { timeout: 15000 },
    );
  }

  const repInputIdx = await state.modifyPage.evaluate((dzIdx) => {
    const allDz = Array.from(document.querySelectorAll('.customdropzone'));
    const repDzEl = allDz[dzIdx];
    if (!repDzEl?.dropzone?.hiddenFileInput) return dzIdx;
    const allInputs = Array.from(document.querySelectorAll('input.dz-hidden-input'));
    const idx = allInputs.indexOf(repDzEl.dropzone.hiddenFileInput);
    return idx < 0 ? dzIdx : idx;
  }, repDzIdx.idx);
  const fileInput = state.modifyPage.locator('input.dz-hidden-input').nth(repInputIdx);
  await fileInput.setInputFiles(IMAGE_PATH);
  await repDz.locator('.dz-preview').first().waitFor({ state: 'visible', timeout: 15000 });
  await state.modifyPage.waitForFunction(
    (dzIdx) => {
      const allDz = Array.from(document.querySelectorAll('.customdropzone'));
      const preview = allDz[dzIdx]?.querySelector('.dz-preview');
      if (!preview) return true;
      return !preview.classList.contains('dz-processing') && !preview.classList.contains('dz-uploading');
    },
    repDzIdx.idx,
    { timeout: 30000 },
  ).catch(() => null);

  await state.modifyPage.screenshot({ path: SS_PATH, scale: 'css', fullPage: false });
  console.log('SUCCESS');
})();
    `.trim();
  }
}


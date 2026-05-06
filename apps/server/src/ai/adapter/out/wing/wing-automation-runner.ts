import { Injectable, Logger } from '@nestjs/common';
import { spawnPlaywriter } from './playwriter-cli';

const WING_BASE =
  'https://wing.coupang.com/vendor-inventory/list?salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1';

const PLAYWRITER_TIMEOUT_MS = 120_000;
const PLAYWRITER_RUN_TIMEOUT_MS = 90_000;
const PLAYWRITER_STATUS_TIMEOUT_MS = 5_000;

export interface WingUploadInput {
  productName: string;
  imagePath: string;
  screenshotPath: string;
}

export interface WingUploadResult {
  success: boolean;
  error?: string;
}

export interface PlaywriterStatus {
  connected: boolean;
  error?: string;
}

/**
 * External automation adapter for Coupang Wing thumbnail uploads.
 *
 * Encapsulates the Playwriter `spawn` lifecycle, the dynamic Wing search URL,
 * and the inline browser-automation script. No Prisma access, no tenant
 * concept — the service decides which generation/master/attempt to register
 * and hands this adapter the resolved product name + image path.
 */
@Injectable()
export class WingAutomationRunner {
  private readonly logger = new Logger(WingAutomationRunner.name);

  runWingUpload(input: WingUploadInput): Promise<WingUploadResult> {
    const { productName, imagePath, screenshotPath } = input;
    return new Promise((resolve) => {
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
          resolve({ success: true });
        } else {
          const message =
            stdout.match(/ERROR:(.+)/)?.[1]?.trim() || stderr.trim() || 'Unknown error';
          resolve({ success: false, error: message });
        }
      });

      proc.on('error', (err: Error) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  checkPlaywriterStatus(): Promise<PlaywriterStatus> {
    return new Promise((resolve) => {
      const proc = spawnPlaywriter(['session', 'list'], { timeout: PLAYWRITER_STATUS_TIMEOUT_MS });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve({ connected: false, error: stderr.trim() || 'playwriter not found' });
          return;
        }
        const lines = stdout
          .split('\n')
          .filter((line) => line.trim() && !line.startsWith('-') && !line.startsWith('ID'));
        resolve({ connected: lines.length > 0 });
      });
      proc.on('error', (err: Error) => {
        resolve({ connected: false, error: err.message });
      });
    });
  }

  private buildScript(productName: string, imagePath: string, screenshotPath: string): string {
    const wingUrl =
      WING_BASE +
      `&searchKeywordType=ALL&searchKeywords=${encodeURIComponent(productName)}`;

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

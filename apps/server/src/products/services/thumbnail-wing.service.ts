import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { spawn } from 'child_process';
import * as path from 'path';

const WING_BASE =
  'https://wing.coupang.com/vendor-inventory/list?salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1';

@Injectable()
export class ThumbnailWingService {
  private readonly logger = new Logger(ThumbnailWingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerToWing(generationId: string): Promise<{
    success: boolean;
    screenshotPath: string | null;
    error?: string;
  }> {
    const gen = await this.prisma.thumbnailGeneration.findUnique({
      where: { id: generationId },
      include: { product: { select: { name: true } } },
    });

    if (!gen?.selectedUrl) {
      throw new NotFoundException('Generation not found or no selected image');
    }

    const productName = gen.product.name;
    // selectedUrl이 http://... URL이면 경로만 추출, 아니면 그대로 사용
    const urlPath = gen.selectedUrl.startsWith('http')
      ? new URL(gen.selectedUrl).pathname
      : gen.selectedUrl;
    const imagePath = path.join(process.cwd(), urlPath);
    const screenshotPath = `/tmp/wing-upload-${generationId}.png`;

    this.logger.log(`Wing 자동화 시작: ${productName}`);
    const result = await this.runAutomation(productName, imagePath, screenshotPath);
    return {
      ...result,
      screenshotPath: result.success ? screenshotPath : null,
    };
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

  // 1. Wing 인벤토리 탭 재사용 or 신규 열기
  let wingPage = context.pages().find(p => p.url().includes('vendor-inventory/list'));
  if (!wingPage) {
    wingPage = context.pages().find(p => p.url() === 'about:blank') ?? (await context.newPage());
  }
  await wingPage.goto(${JSON.stringify(wingUrl)}, { waitUntil: 'domcontentloaded' });
  state.wingPage = wingPage;

  // 2. 상품명 일치 행 탐색 — 해당 상품명이 포함된 행이 실제로 나타날 때까지 대기
  const productRow = wingPage.locator('table tbody tr', { hasText: PRODUCT_NAME });
  await productRow.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (await productRow.count() === 0) { console.log('ERROR:상품을 찾을 수 없습니다'); return; }
  const editLink = productRow.first().locator('role=link[name="상품수정"]');

  // 3. 상품수정 클릭 → 새 탭
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

  // 4. 상품명 검증 — 등록상품명(판매자관리용) 필드와 DB 상품명 완전 일치
  const sellerProductName = await state.modifyPage.evaluate(() => {
    const el = document.querySelector('input[placeholder*="등록상품명"]');
    return el ? (el.value || '') : '';
  });
  if (sellerProductName && sellerProductName !== PRODUCT_NAME) {
    console.log('ERROR:상품명 불일치 / 판매자관리용: ' + sellerProductName.slice(0, 40) + ' / 기대: ' + PRODUCT_NAME.slice(0, 40));
    return;
  }

  // 5. 기본 등록 vs 옵션별 등록 판단
  // item-rep-cell 부모를 가진 dropzone = 옵션별 등록의 대표이미지
  // 없으면 = 기본 등록
  const repDzIdx = await state.modifyPage.evaluate(() => {
    const allDz = Array.from(document.querySelectorAll('.customdropzone'));
    // 옵션별 등록: grandParent에 item-rep-cell 포함
    const optionIdx = allDz.findIndex(el =>
      el.parentElement?.parentElement?.className?.includes('item-rep-cell')
    );
    if (optionIdx >= 0) return { mode: 'option', idx: optionIdx };
    // 기본 등록: 첫번째 customdropzone
    return { mode: 'basic', idx: 0 };
  });
  console.log('등록 방식:', repDzIdx.mode);

  // 6. 대표이미지 기존 이미지 삭제 (hover → 삭제 아이콘 → 확인 다이얼로그)
  let repDz = state.modifyPage.locator('.customdropzone').nth(repDzIdx.idx);
  const repPreview = repDz.locator('.dz-preview').first();
  if (await repPreview.count() > 0) {
    await repPreview.hover();
    await new Promise(r => setTimeout(r, 500));
    const deleteBtn = repPreview.locator('a.dz-action.dz-action-remove').first();
    await deleteBtn.click({ force: true });
    const confirmBtn = state.modifyPage.locator('button', { hasText: '네, 삭제합니다' });
    await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
    // 모달 애니메이션 완료 대기 (충분히 길게)
    await new Promise(r => setTimeout(r, 1500));
    console.log('STEP6: 삭제 확인 다이얼로그 감지, 클릭');
    await confirmBtn.click();
    // 클릭 후 모달 상태 확인
    await new Promise(r => setTimeout(r, 1000));
    const modalCount = await confirmBtn.count();
    console.log('STEP6: 클릭 후 모달 버튼 count =', modalCount, '(0이면 모달 닫힘)');
    // dz.files 비워짐 = 삭제 완료 신호 (Wing이 dz.removeFile 호출 시)
    await state.modifyPage.waitForFunction(
      (dzIdx) => {
        const allDz = Array.from(document.querySelectorAll('.customdropzone'));
        const dz = allDz[dzIdx]?.dropzone;
        return !dz || dz.files.length === 0;
      },
      repDzIdx.idx,
      { timeout: 15000 },
    );
    console.log('STEP6: 대표이미지 삭제 완료 (dz.files 비워짐)');
  }

  // 7. 대표이미지 Dropzone input에 PNG 파일 직접 주입
  // hiddenFileInput 인덱스 확인
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
  // 업로드 시작 확인 (preview 생성 대기)
  await repDz.locator('.dz-preview').first().waitFor({ state: 'visible', timeout: 15000 });
  // 업로드 완료 대기: processing/uploading 상태 종료까지
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

  // 8. 미리보기 스크린샷
  await state.modifyPage.screenshot({ path: SS_PATH, scale: 'css', fullPage: false });
  console.log('SUCCESS');
})();
    `.trim();
  }

  async checkPlaywriterStatus(): Promise<{ connected: boolean; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn('playwriter', ['session', 'list'], { timeout: 5000 });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve({ connected: false, error: stderr.trim() || 'playwriter not found' });
          return;
        }
        // session list 헤더 제외 실제 세션 행이 있으면 연결됨
        const lines = stdout.split('\n').filter((l) => l.trim() && !l.startsWith('-') && !l.startsWith('ID'));
        resolve({ connected: lines.length > 0 });
      });
      proc.on('error', (err: Error) => {
        resolve({ connected: false, error: err.message });
      });
    });
  }

  private runAutomation(
    productName: string,
    imagePath: string,
    screenshotPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const code = this.buildScript(productName, imagePath, screenshotPath);

      // spawn — array 인자로 전달하므로 shell 이스케이프 불필요
      const proc = spawn('playwriter', ['-s', '1', '--timeout', '90000', '-e', code], { timeout: 120000 });

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', () => {
        this.logger.log(`playwriter stdout: ${stdout.trim()}`);
        if (stdout.includes('SUCCESS')) {
          resolve({ success: true });
        } else {
          const msg = stdout.match(/ERROR:(.+)/)?.[1]?.trim() || stderr.trim() || 'Unknown error';
          resolve({ success: false, error: msg });
        }
      });

      proc.on('error', (err: Error) => {
        resolve({ success: false, error: err.message });
      });
    });
  }
}

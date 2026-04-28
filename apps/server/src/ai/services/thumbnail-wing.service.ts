import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailImageFetcherService } from './thumbnail-image-fetcher.service';

const WING_BASE =
  'https://wing.coupang.com/vendor-inventory/list?salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1';

@Injectable()
export class ThumbnailWingService {
  private readonly logger = new Logger(ThumbnailWingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageFetcher: ThumbnailImageFetcherService,
  ) {}

  async registerToWing(
    generationId: string,
    companyId: string,
  ): Promise<{ success: boolean; screenshotPath: string | null; error?: string }> {
    const gen = await this.prisma.thumbnailGeneration.findFirst({
      where: { id: generationId, companyId },
      include: {
        candidates: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        master: {
          select: {
            name: true,
            listings: {
              where: { channel: 'coupang', isDeleted: false },
              select: { channelName: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });
    if (!gen) throw new NotFoundException(`ThumbnailGeneration ${generationId} not found`);

    const selectedUrl =
      gen.selectedUrl ??
      (gen.candidates.length === 1 ? gen.candidates[0]?.url ?? null : null);
    if (!selectedUrl) {
      throw new NotFoundException('Generation not found or no selected image');
    }

    const attempt = await this.prisma.thumbnailRegistrationAttempt.create({
      data: {
        companyId,
        generationId,
        status: 'uploaded',
        startedAt: new Date(),
      },
      select: { id: true },
    });

    const coupangName = gen.master?.listings?.[0]?.channelName?.trim();
    const productName = coupangName || gen.master?.name || '';
    if (!productName) {
      const message = '쿠팡 등록 상품명을 찾을 수 없습니다';
      await this.markAttemptFailed(attempt.id, companyId, message);
      throw new BadRequestException(message);
    }

    try {
      const imagePath = await this.materializeImage(selectedUrl, generationId);
      const screenshotPath = `/tmp/wing-upload-${generationId}.png`;

      this.logger.log(`Wing 자동화 시작: ${productName}`);
      const result = await this.runAutomation(productName, imagePath, screenshotPath);
      await this.updateRegistrationAttemptOrThrow(attempt.id, companyId, {
        status: result.success ? 'uploaded' : 'failed',
        errorMessage: result.success ? null : result.error ?? 'Unknown error',
        screenshotUrl: result.success ? screenshotPath : null,
        finishedAt: new Date(),
      });

      return {
        ...result,
        screenshotPath: result.success ? screenshotPath : null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markAttemptFailed(attempt.id, companyId, message);
      throw err;
    }
  }

  async batchRegister(
    generationIds: string[],
    companyId: string,
  ): Promise<{
    results: Array<{ id: string; success: boolean; screenshotPath: string | null; error?: string }>;
  }> {
    const results: Array<{ id: string; success: boolean; screenshotPath: string | null; error?: string }> = [];
    for (const id of generationIds) {
      try {
        const result = await this.registerToWing(id, companyId);
        results.push({ id, ...result });
      } catch (err) {
        results.push({
          id,
          success: false,
          screenshotPath: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { results };
  }

  async clearRegistrationError(id: string, companyId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);

    await this.prisma.thumbnailRegistrationAttempt.deleteMany({
      where: { generationId: id, companyId, status: 'failed' },
    });
    return { ok: true };
  }

  async verifyRegistration(
    id: string,
    companyId: string,
  ): Promise<{ registered: boolean; detectedUrl: string | null; error?: string }> {
    const gen = await this.prisma.thumbnailGeneration.findFirst({
      where: { id, companyId },
      include: {
        registrationAttempts: {
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    });
    if (!gen) throw new NotFoundException(`ThumbnailGeneration ${id} not found`);

    const latest = gen.registrationAttempts[0] ?? null;
    if (latest) {
      await this.updateRegistrationAttemptOrThrow(latest.id, companyId, {
        finishedAt: new Date(),
      });
    }

    const registered = latest?.status === 'registered';
    const result: { registered: boolean; detectedUrl: string | null; error?: string } = {
      registered,
      detectedUrl: registered ? gen.selectedUrl ?? null : null,
    };
    if (latest?.errorMessage) result.error = latest.errorMessage;
    return result;
  }

  async checkPlaywriterStatus(): Promise<{ connected: boolean; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn('playwriter', ['session', 'list'], { timeout: 5000 });
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

  private async materializeImage(source: string, generationId: string): Promise<string> {
    const dataUrlMatch = source.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      this.imageFetcher.assertSupportedMime(dataUrlMatch[1]);
      const ext = this.imageFetcher.extForMime(dataUrlMatch[1]);
      const destPath = `/tmp/wing-upload-input-${generationId}.${ext}`;
      await fs.promises.writeFile(destPath, Buffer.from(dataUrlMatch[2], 'base64'));
      return destPath;
    }

    const fetched = await this.imageFetcher.fetchTrustedStorageImage(source);
    const ext = this.imageFetcher.extForMime(fetched.mimeType);
    const destPath = `/tmp/wing-upload-input-${generationId}.${ext}`;
    await fs.promises.writeFile(destPath, fetched.buffer);
    return destPath;
  }

  private async markAttemptFailed(
    attemptId: string,
    companyId: string,
    message: string,
  ): Promise<void> {
    await this.updateRegistrationAttemptOrThrow(attemptId, companyId, {
      status: 'failed',
      errorMessage: message,
      finishedAt: new Date(),
    });
  }

  private async updateRegistrationAttemptOrThrow(
    id: string,
    companyId: string,
    data: Prisma.ThumbnailRegistrationAttemptUpdateManyMutationInput,
  ): Promise<void> {
    const result = await this.prisma.thumbnailRegistrationAttempt.updateMany({
      where: { id, companyId },
      data,
    });
    if (result.count === 0) {
      throw new NotFoundException(`ThumbnailRegistrationAttempt ${id} not found`);
    }
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

  private runAutomation(
    productName: string,
    imagePath: string,
    screenshotPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const code = this.buildScript(productName, imagePath, screenshotPath);
      const proc = spawn('playwriter', ['-s', '1', '--timeout', '90000', '-e', code], {
        timeout: 120000,
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
}

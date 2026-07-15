import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';

const execFileAsync = promisify(execFile);

// 쿠팡 발주 상세(품목)와 센터주소를 확장이 수집해 넘긴다. 백엔드는 원본 템플릿 서식(색/볼드/시트5개)을
// 유지해야 해서 Node(SheetJS) 대신 Python xlutils(generate.py)로 .xls 를 생성한다.
export interface CoupangDirectItem {
  skuId?: string;
  barcode?: string;
  name?: string;
  qty?: number;
  amount?: number; // 총발주매입금 = 결제금액
}
export interface CoupangDirectPo {
  seq?: string | number; // 발주번호
  center?: string; // 발주센터명(수령자)
  transport?: string; // SHIPMENT | MILKRUN
  edd?: string; // 입고예정일
  reg?: string; // 발주등록일시
  status?: string; // PA | 발주확정 (없으면 legacy 입력으로 허용)
  items?: CoupangDirectItem[];
}
export interface CoupangDirectCenter {
  addr?: string;
  zip?: string | number;
  contact?: string;
}
export interface CoupangDirectInput {
  pos?: CoupangDirectPo[];
  centers?: Record<string, CoupangDirectCenter>;
  transport?: string; // 'SHIPMENT' | 'MILKRUN'
}

export interface CoupangDirectResult {
  buffer: Buffer;
  fileName: string;
  poCount: number;
  rowCount: number;
}

const TRANSPORT_LABEL: Record<string, string> = { SHIPMENT: '쉽먼트', MILKRUN: '밀크런' };

interface GenerateOptions {
  signal?: AbortSignal;
}

@Injectable()
export class CoupangDirectshipService {
  private readonly logger = new Logger(CoupangDirectshipService.name);

  async generate(
    input: CoupangDirectInput,
    options: GenerateOptions = {},
  ): Promise<CoupangDirectResult> {
    const transport = String(input?.transport ?? '').toUpperCase();
    if (transport !== 'SHIPMENT' && transport !== 'MILKRUN') {
      throw new BadRequestException('운송유형(transport)은 SHIPMENT 또는 MILKRUN 이어야 합니다.');
    }
    const pos = Array.isArray(input?.pos) ? input.pos.filter(isConfirmedPurchaseOrder) : [];
    const matching = pos.filter((p) => String(p?.transport ?? '').toUpperCase() === transport);
    if (matching.length === 0) {
      throw new BadRequestException(`${TRANSPORT_LABEL[transport]} 발주확정 신규 주문이 없습니다.`);
    }

    const tplPath = join(__dirname, 'template.xls');
    const scriptPath = join(__dirname, 'generate.py');
    const workDir = mkdtempSync(join(tmpdir(), 'coupang-ds-'));
    const inputPath = join(workDir, 'input.json');
    const outPath = join(workDir, 'output.xls');
    try {
      writeFileSync(
        inputPath,
        JSON.stringify({ pos, centers: input?.centers ?? {} }),
        'utf8',
      );
      let stdout = '';
      try {
        const res = await execFileAsync(
          resolvePythonBin(),
          [scriptPath, tplPath, inputPath, outPath, transport],
          {
            timeout: 120_000,
            maxBuffer: 8 * 1024 * 1024,
            signal: options.signal,
          },
        );
        stdout = res.stdout ?? '';
      } catch (err) {
        const message = childProcessErrorMessage(err);
        this.logger.error(`Coupang direct-shipment workbook generation failed: ${message}`);
        if (/ModuleNotFoundError|No module named|ENOENT/.test(message)) {
          throw new BadRequestException(
            '쿠팡직배송 Python 런타임이 준비되지 않았습니다. 서버 개발 환경을 다시 시작해주세요.',
          );
        }
        throw new BadRequestException(
          '쿠팡직배송 엑셀 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
        );
      }
      const buffer = readFileSync(outPath);
      let rowCount = matching.reduce((sum, p) => sum + (Array.isArray(p.items) ? p.items.length : 0), 0);
      try {
        const meta = JSON.parse(stdout.trim().split('\n').pop() ?? '{}') as { rows?: number };
        if (typeof meta.rows === 'number') rowCount = meta.rows;
      } catch {
        /* stdout 파싱 실패 — 추정 rowCount 사용 */
      }
      const stamp = dayStamp(new Date());
      const fileName = `쿠팡직배송_${TRANSPORT_LABEL[transport]}_${stamp}.xls`;
      return { buffer, fileName, poCount: matching.length, rowCount };
    } finally {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* 임시폴더 정리 실패 — 무시 */
      }
    }
  }
}

function resolvePythonBin(): string {
  return process.env.PYTHON_BIN || join(__dirname, '../../../.venv/bin/python');
}

function childProcessErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const stderr = String(error.stderr ?? '').trim();
    if (stderr) return stderr;
  }
  return error instanceof Error ? error.message : String(error);
}

function isConfirmedPurchaseOrder(po: CoupangDirectPo): boolean {
  const status = String(po?.status ?? '').trim();
  if (!status) return true;
  return status.toUpperCase() === 'PA' || /발주\s*확정/.test(status);
}

function dayStamp(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

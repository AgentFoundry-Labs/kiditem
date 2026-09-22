import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { CoupangCatalogPlanResult } from '@kiditem/shared/sales-product';
import {
  applyCoupangCatalogEdits,
  planCoupangCatalogEdits,
  readCoupangCatalogSheet,
  type CoupangCatalogPlan,
  type CoupangCatalogSheet,
} from '../../domain/mall-bulk-sheet/coupang-catalog-edit';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductRepositoryPort,
} from '../port/out/persistence/sales-product.repository.port';

/** 화면에 보여 줄 줄 수. 전부 보내면 1,000 줄짜리 파일에서 응답이 쓸데없이 커진다. */
const SAMPLE_LIMIT = 50;

const CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface CoupangCatalogFile {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  changedCells: number;
  changedRows: number;
}

/**
 * 쿠팡 윙 **쿠팡상품정보 수정요청** 엑셀. 윙이 내려준 파일을 받아 우리가 아는 값으로 흰 칸을 채워
 * 돌려준다. 몰에 올리지 않는다 — 사람이 윙 업로드 화면에 올리고, 윙의 업로드 목록이 결과다.
 *
 * 쿠팡 신규 등록 엑셀(`coupang-wing.sheet.ts`)과 둘 다 쓴다(사장님 2026-09-22). 저쪽은 없는
 * 상품을 새로 올리고, 이쪽은 이미 올라간 상품을 고쳐 달라고 제안한다.
 */
@Injectable()
export class SalesProductCoupangCatalogService {
  constructor(
    @Inject(SALES_PRODUCT_REPOSITORY_PORT)
    private readonly repository: SalesProductRepositoryPort,
  ) {}

  /** 무엇이 채워지는지만 본다. 파일은 만들지 않는다. */
  async plan(organizationId: string, file: Buffer | undefined): Promise<CoupangCatalogPlanResult> {
    const { plan } = await this.read(organizationId, file);
    return summarize(plan);
  }

  /** 채운 파일. 사람이 이 파일을 윙에 올린다. */
  async file(organizationId: string, file: Buffer | undefined, fileName?: string): Promise<CoupangCatalogFile> {
    const { sheet, plan } = await this.read(organizationId, file);
    const result = applyCoupangCatalogEdits(sheet, plan.edits);
    return {
      buffer: result.bytes,
      fileName: editedFileName(fileName),
      contentType: CONTENT_TYPE,
      changedCells: result.changed,
      changedRows: plan.edits.length,
    };
  }

  private async read(
    organizationId: string,
    file: Buffer | undefined,
  ): Promise<{ sheet: CoupangCatalogSheet; plan: CoupangCatalogPlan }> {
    if (!file?.length) {
      throw new BadRequestException('윙에서 내려받은 쿠팡상품정보 엑셀 파일이 필요합니다.');
    }
    let sheet: CoupangCatalogSheet;
    try {
      sheet = readCoupangCatalogSheet(file);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '엑셀을 읽지 못했습니다.');
    }
    if (sheet.rows.length === 0) {
      throw new BadRequestException('이 파일에는 옵션 줄이 없습니다. 윙에서 파일 생성이 끝난 뒤 내려받으세요.');
    }
    const facts = await this.repository.readCoupangCatalogFacts(
      organizationId,
      sheet.rows.map((row) => row.optionId),
    );
    return { sheet, plan: planCoupangCatalogEdits(sheet, facts) };
  }
}

function summarize(plan: CoupangCatalogPlan): CoupangCatalogPlanResult {
  const changedRows = plan.rows.filter((row) => row.changes.length > 0);
  const conflictRows = plan.rows.filter((row) => row.changes.length === 0 && row.conflicts.length > 0);
  return {
    rows: plan.rows.length,
    linked: plan.rows.filter((row) => !row.unlinked).length,
    changedRows: changedRows.length,
    changedCells: changedRows.reduce((sum, row) => sum + row.changes.length, 0),
    conflicts: plan.rows.reduce((sum, row) => sum + row.conflicts.length, 0),
    byColumn: { ...plan.byColumn },
    samples: [...changedRows, ...conflictRows].slice(0, SAMPLE_LIMIT).map((row) => ({
      optionId: row.optionId,
      listingName: row.listingName,
      optionName: row.optionName,
      salesProductCode: row.salesProductCode,
      unlinked: row.unlinked,
      changes: row.changes.map((change) => ({ ...change })),
      conflicts: row.conflicts.map((change) => ({ ...change })),
    })),
  };
}

/** 올린 파일 이름 옆에 우리가 채웠다고 적는다 — 윙 다운로드 원본과 섞이지 않게. */
function editedFileName(original: string | undefined): string {
  const base = (original ?? '').replace(/\.[^.]+$/, '').trim();
  return `${base || 'Coupang_detailinfo'}_수정요청.xlsx`;
}

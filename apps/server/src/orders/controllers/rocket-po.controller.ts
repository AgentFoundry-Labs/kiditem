import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import type { MulterFile } from '../../common/types';
import {
  RocketPoConfirmService,
  type ConfirmComputedRow,
  type ConfirmSourceRow,
  type ConfirmPreviewResult,
  type RocketConfirmCommitResult,
  type RocketConfirmFillResult,
  type RocketSavedPoSummary,
} from '../services/rocket-po-confirm.service';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(xls|xlsx)$/i;

@Controller('orders/rocket')
export class RocketPoController {
  constructor(private readonly rocketPoConfirmService: RocketPoConfirmService) {}

  /** 쿠팡 발주 업로드 양식(.xlsx) → 셀피아 재고로 확정수량/사유 채워서 반환 */
  @Post('confirm-fill')
  @Header(
    'Access-Control-Expose-Headers',
    ['Content-Disposition', 'X-Rocket-Total', 'X-Rocket-Confirmed', 'X-Rocket-Short', 'X-Rocket-Matched'].join(', '),
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_EXTENSIONS.test(file.originalname)) return cb(null, true);
        cb(new BadRequestException('xlsx 발주 양식만 업로드 가능합니다.'), false);
      },
    }),
  )
  async confirmFill(
    @UploadedFile() file: MulterFile,
    @CurrentOrganization() organizationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!file) {
      throw new BadRequestException('파일이 필요합니다.');
    }
    const result = await this.rocketPoConfirmService.fillConfirmTemplate(file, organizationId);
    setConfirmHeaders(result, response);
    return new StreamableFile(result.buffer);
  }

  /** 발주리스트(거래처확인요청) SKU 행 → 양식을 처음부터 직접 생성 */
  @Post('confirm-generate')
  @Header(
    'Access-Control-Expose-Headers',
    ['Content-Disposition', 'X-Rocket-Total', 'X-Rocket-Confirmed', 'X-Rocket-Short', 'X-Rocket-Matched'].join(', '),
  )
  async confirmGenerate(
    @CurrentOrganization() organizationId: string,
    @Body() body: { rows?: ConfirmSourceRow[] },
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const rows = body?.rows ?? [];
    if (!rows.length) {
      throw new BadRequestException('생성할 발주 행이 없습니다.');
    }
    const result = await this.rocketPoConfirmService.generateConfirmFile(rows, organizationId);
    setConfirmHeaders(result, response);
    return new StreamableFile(result.buffer);
  }

  /** 발주리스트 SKU 행 → 확정수량/사유 계산(편집 미리보기용 JSON) */
  @Post('confirm-preview')
  async confirmPreview(
    @CurrentOrganization() organizationId: string,
    @Body() body: { rows?: ConfirmSourceRow[] },
  ): Promise<ConfirmPreviewResult> {
    const rows = body?.rows ?? [];
    if (!rows.length) {
      throw new BadRequestException('미리볼 발주 행이 없습니다.');
    }
    return this.rocketPoConfirmService.previewConfirmRows(rows, organizationId);
  }

  /** 저장된 로켓 발주(rocket_purchase_orders)를 입고예정일 범위로 조회 — 달력/목록용(재수집 없음) */
  @Post('saved-pos')
  async savedPos(
    @CurrentOrganization() organizationId: string,
    @Body() body: { from?: string; to?: string },
  ): Promise<RocketSavedPoSummary[]> {
    return this.rocketPoConfirmService.listSavedRocketPos(
      { from: body?.from, to: body?.to },
      organizationId,
    );
  }

  /** 저장된 발주 중 특정 입고예정일 하루치 → 셀피아 재고 매칭 미리보기(재수집 없음) */
  @Post('confirm-preview-saved')
  async confirmPreviewSaved(
    @CurrentOrganization() organizationId: string,
    @Body() body: { date?: string },
  ): Promise<ConfirmPreviewResult> {
    const date = String(body?.date ?? '').trim();
    if (!date) {
      throw new BadRequestException('입고예정일이 필요합니다.');
    }
    return this.rocketPoConfirmService.previewSavedByDate({ date }, organizationId);
  }

  /** 저장된 발주 전체(입고예정일 범위) → 상품별 총 매칭 현황(중복제거·재수집 없음) */
  @Post('match-status')
  async matchStatus(
    @CurrentOrganization() organizationId: string,
    @Body() body: { from?: string; to?: string },
  ): Promise<ConfirmPreviewResult> {
    return this.rocketPoConfirmService.matchStatusByRange(
      { from: body?.from, to: body?.to },
      organizationId,
    );
  }

  /** 미리보기에서 확정한 쿠팡 로켓 수량 → 로켓 예약(RocketPoReservation) 기록 */
  @Post('confirm-commit')
  async confirmCommit(
    @CurrentOrganization() organizationId: string,
    @Body() body: { rows?: ConfirmComputedRow[] },
  ): Promise<RocketConfirmCommitResult> {
    const rows = body?.rows ?? [];
    if (!rows.length) {
      throw new BadRequestException('예약 처리할 발주 행이 없습니다.');
    }
    return this.rocketPoConfirmService.commitReservations(rows, organizationId);
  }
}

function setConfirmHeaders(result: RocketConfirmFillResult, response: Response): void {
  response.setHeader('Content-Disposition', contentDispositionAttachment(result.fileName));
  response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  response.setHeader('X-Rocket-Total', String(result.totalRows));
  response.setHeader('X-Rocket-Confirmed', String(result.fullyConfirmed));
  response.setHeader('X-Rocket-Short', String(result.shortRows));
  response.setHeader('X-Rocket-Matched', String(result.matchedSkus));
}

function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

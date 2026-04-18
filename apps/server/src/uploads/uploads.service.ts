import { Injectable, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { MulterFile } from '../common/types';

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CSV 광고 업로드 처리.
   * @deprecated 본문은 Plan B2b 에서 stub 으로 대체됨.
   *
   * 3-layer schema (ADR-0013) 전환 이후 listingId 기반 매칭 로직이 필요하며,
   * 샘플 CSV 포맷 재검토가 선행되어야 함. Plan B3 에서 재구현 예정.
   * 현재는 HTTP 501 Not Implemented 반환 — UI 는 보존 (라우트 + DTO + 호출 경로 유지).
   */
  async processAdCsv(_file: MulterFile, _reportDate?: string) {
    throw new NotImplementedException(
      'CSV 광고 업로드는 추후 재구현 예정입니다 (Plan B3+). 현재는 익스텐션 동기화만 지원합니다.',
    );
  }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SourceRecordRepositoryAdapter } from './adapter/out/repository/source-record.repository.adapter';
import { SOURCE_RECORD_PORT } from './application/port/in/source-record.port';
import { SOURCE_RECORD_REPOSITORY_PORT } from './application/port/out/repository/source-record.repository.port';

/**
 * 원본 기록 owner(KID-313). Sourcing 모듈과 Channels 판매상품 모듈이 함께 가져온다 — 초안 삭제가
 * `SourceRecordPort.deleteForDraft` 를 부르고, Sourcing 은 판매상품 모듈의 초안 계약을 부르므로 두
 * 모듈이 서로를 가져오지 않도록 원본 기록 저장소만 따로 둔다. 이 모듈은 Prisma 말고 아무것도 가져오지
 * 않는다.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    SourceRecordRepositoryAdapter,
    { provide: SOURCE_RECORD_PORT, useExisting: SourceRecordRepositoryAdapter },
    { provide: SOURCE_RECORD_REPOSITORY_PORT, useExisting: SourceRecordRepositoryAdapter },
  ],
  exports: [SOURCE_RECORD_PORT, SOURCE_RECORD_REPOSITORY_PORT],
})
export class SourcingSourceRecordModule {}

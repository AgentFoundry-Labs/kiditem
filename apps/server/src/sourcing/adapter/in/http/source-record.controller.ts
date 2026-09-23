import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  SOURCE_RECORD_PORT,
  type SourceRecordPort,
  type SourceRecordView,
} from '../../../application/port/in/source-record.port';

/**
 * 원본 기록 한 줄 읽기(KID-313). 초안 화면이 원본 사실(원본 사진 · 원가 · 원문 · 출처)을 여기서
 * 읽는다. 원본 기록은 운영자가 고치거나 지우지 않으니 쓰는 길은 없다.
 */
@Controller('sourcing/source-records')
export class SourceRecordController {
  constructor(@Inject(SOURCE_RECORD_PORT) private readonly records: SourceRecordPort) {}

  @Get(':id')
  async read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganization() organizationId: string,
  ): Promise<SourceRecordView> {
    const record = await this.records.read({ organizationId, sourceRecordId: id });
    if (!record) throw new NotFoundException('원본 기록을 찾지 못했습니다.');
    return record;
  }
}

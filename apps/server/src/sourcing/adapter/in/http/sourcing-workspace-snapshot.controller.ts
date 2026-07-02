import { BadRequestException, Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SourcingWorkspaceSnapshotService } from '../../../application/service/sourcing-workspace-snapshot.service';
import {
  SaveSourcingWorkspaceSnapshotDto,
  SourcingWorkspaceSnapshotRecentQueryDto,
  SourcingWorkspaceSnapshotParamsDto,
} from './dto';

const CLIENT_WRITABLE_SOURCING_WORKSPACE_SNAPSHOT_SCOPES = new Set([
  'keyword_analysis',
  'today_recommendations',
  'interest_tracking',
  '1688_new_products',
]);

@Controller('sourcing/workspace-snapshots')
export class SourcingWorkspaceSnapshotController {
  constructor(private readonly snapshots: SourcingWorkspaceSnapshotService) {}

  @Get(':scope/today')
  async getToday(
    @Param() params: SourcingWorkspaceSnapshotParamsDto,
    @CurrentOrganization() organizationId: string,
  ) {
    const snapshot = await this.snapshots.getToday(organizationId, params.scope);
    return { snapshot: snapshot ? toResponse(snapshot) : null };
  }

  @Get(':scope/recent')
  async getRecent(
    @Param() params: SourcingWorkspaceSnapshotParamsDto,
    @Query() query: SourcingWorkspaceSnapshotRecentQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    const snapshots = await this.snapshots.getRecent(organizationId, params.scope, query.days);
    return { snapshots: snapshots.map(toResponse) };
  }

  @Put(':scope/today')
  async saveToday(
    @Param() params: SourcingWorkspaceSnapshotParamsDto,
    @Body() body: SaveSourcingWorkspaceSnapshotDto,
    @CurrentOrganization() organizationId: string,
  ) {
    assertClientWritableScope(params.scope);

    const snapshot = await this.snapshots.saveToday(organizationId, params.scope, body.payload);
    return { snapshot: toResponse(snapshot) };
  }
}

function assertClientWritableScope(scope: string): void {
  if (!CLIENT_WRITABLE_SOURCING_WORKSPACE_SNAPSHOT_SCOPES.has(scope)) {
    throw new BadRequestException('서버 생성 소싱 작업 스냅샷은 직접 저장할 수 없습니다.');
  }
}

function toResponse(snapshot: {
  id: string;
  scope: string;
  businessDate: Date;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: snapshot.id,
    scope: snapshot.scope,
    businessDate: snapshot.businessDate.toISOString().slice(0, 10),
    payload: snapshot.payload,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}

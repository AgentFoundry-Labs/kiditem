import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { kstDayStart } from '../../../common/kst';
import {
  SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
  SOURCING_WORKSPACE_SNAPSHOT_SCOPES,
  type SourcingWorkspaceSnapshotRepositoryPort,
  type SourcingWorkspaceSnapshotRow,
  type SourcingWorkspaceSnapshotScope,
} from '../port/out/repository/sourcing-workspace-snapshot.repository.port';

@Injectable()
export class SourcingWorkspaceSnapshotService {
  constructor(
    @Inject(SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: SourcingWorkspaceSnapshotRepositoryPort,
  ) {}

  async getToday(organizationId: string, rawScope: string): Promise<SourcingWorkspaceSnapshotRow | null> {
    const scope = parseSnapshotScope(rawScope);
    return this.snapshots.find({
      organizationId,
      scope,
      businessDate: kstDayStart(new Date()),
    });
  }

  async saveToday(
    organizationId: string,
    rawScope: string,
    payload: Record<string, unknown>,
  ): Promise<SourcingWorkspaceSnapshotRow> {
    const scope = parseSnapshotScope(rawScope);
    return this.snapshots.upsert({
      organizationId,
      scope,
      businessDate: kstDayStart(new Date()),
      payload,
    });
  }
}

function parseSnapshotScope(scope: string): SourcingWorkspaceSnapshotScope {
  if (SOURCING_WORKSPACE_SNAPSHOT_SCOPES.includes(scope as SourcingWorkspaceSnapshotScope)) {
    return scope as SourcingWorkspaceSnapshotScope;
  }
  throw new BadRequestException('지원하지 않는 소싱 작업 스냅샷 종류입니다.');
}

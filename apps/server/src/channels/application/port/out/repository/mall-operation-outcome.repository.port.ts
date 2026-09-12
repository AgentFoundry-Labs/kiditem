export const MALL_OPERATION_OUTCOME_REPOSITORY_PORT = Symbol('MALL_OPERATION_OUTCOME_REPOSITORY_PORT');

/** 몰 작업 결과 한 줄. Prisma 타입이 아니라 이 레인의 모양이다. */
export interface MallOperationOutcomeRow {
  id: string;
  mallKey: string;
  operation: string;
  outcome: string;
  reasonCode: string | null;
  message: string | null;
  itemCount: number | null;
  failedCount: number | null;
  warningCount: number | null;
  trigger: string | null;
  runId: string | null;
  occurredAt: Date;
}

export interface RecordMallOperationOutcomeInput {
  organizationId: string;
  actorUserId: string | null;
  idempotencyKey: string;
  mallKey: string;
  operation: string;
  outcome: string;
  reasonCode: string | null;
  message: string | null;
  itemCount: number | null;
  failedCount: number | null;
  warningCount: number | null;
  trigger: string | null;
  runId: string | null;
}

export interface MallOperationOutcomeCountRow {
  mallKey: string;
  operation: string;
  outcome: string;
  count: number;
}

export interface MallOperationOutcomeRepositoryPort {
  /** 같은 (조직, idempotencyKey) 는 한 번만 쓴다. 이미 있으면 있던 줄을 돌려준다. */
  record(input: RecordMallOperationOutcomeInput): Promise<MallOperationOutcomeRow>;
  listRecent(input: {
    organizationId: string;
    limit: number;
    mallKey?: string;
    operation?: string;
  }): Promise<MallOperationOutcomeRow[]>;
  /** 기간 안의 (몰, 작업, 결과)별 건수. */
  countSince(input: { organizationId: string; since: Date }): Promise<MallOperationOutcomeCountRow[]>;
  /** 기간 안에서 (몰, 작업)마다 가장 최근 한 줄. */
  latestSince(input: { organizationId: string; since: Date }): Promise<MallOperationOutcomeRow[]>;
}

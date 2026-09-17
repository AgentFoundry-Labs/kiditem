import type {
  RocketSavedPoSnapshot,
  RocketSavedPoSummary,
  RocketPoSourceBegin,
  RocketPoSourceControl,
  RocketPoSource,
  RocketPoSourceSubmission,
} from '@kiditem/shared/rocket-purchase-preview';
import type {
  RocketPoCatalogIdentity,
  RocketPoCompleteCollection,
} from '../../../read/rocket-po-catalog.reader';

/** The complete collection `read/rocket-po-catalog.reader.ts` returns. */
export type { RocketPoCatalogIdentity, RocketPoCompleteCollection };
export interface RocketPoCatalogPort {
  begin(input: {
    organizationId: string;
    userId: string;
    idempotencyKey: string;
    request: RocketPoSourceBegin;
  }): Promise<RocketPoSourceControl>;
  readAttempt(input: { organizationId: string; attemptId: string }): Promise<RocketPoSourceControl>;
  readSource(input: { organizationId: string; channelAccountId: string }): Promise<RocketPoSource>;
  complete(input: {
    organizationId: string;
    attemptId: string;
    token: string;
    submission: RocketPoSourceSubmission;
  }): Promise<RocketPoSourceControl>;
  fail(input: {
    organizationId: string;
    attemptId: string;
    token: string;
    code: string;
    message: string;
  }): Promise<RocketPoSourceControl>;
  /** Operator stop without the attempt token; a terminal attempt is returned unchanged. */
  cancel(input: { organizationId: string; attemptId: string }): Promise<RocketPoSourceControl>;
  readComplete(input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
  }): Promise<RocketPoCompleteCollection>;
  listSavedPos(input: {
    organizationId: string;
    channelAccountId: string;
    from: string;
    to: string;
    status?: string;
  }): Promise<RocketSavedPoSummary[]>;
  loadSavedCollection(input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
  }): Promise<RocketSavedPoSnapshot | null>;
}
export const ROCKET_PO_CATALOG_PORT = Symbol('ROCKET_PO_CATALOG_PORT');

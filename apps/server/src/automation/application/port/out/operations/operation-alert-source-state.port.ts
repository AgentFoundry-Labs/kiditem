export const OPERATION_ALERT_SOURCE_STATE_PORT = Symbol(
  'OPERATION_ALERT_SOURCE_STATE_PORT',
);

export interface OperationAlertSourceStatePort {
  find(input: {
    organizationId: string;
    sourceType: string;
    sourceId: string;
  }): Promise<{
    state: string;
    errorCode: string | null;
    errorMessage: string | null;
  } | null>;
}

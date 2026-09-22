export const SALES_PRODUCT_WORKSPACE_ARCHIVE_PORT = Symbol('SALES_PRODUCT_WORKSPACE_ARCHIVE_PORT');

/**
 * 초안을 더 쓰지 않기로 하면 그 콘텐츠 작업공간도 함께 보관한다(KID-310). 작업공간은 AI 소유라
 * Channels 가 행을 쓰지 않고 이 계약으로만 부탁한다.
 */
export interface SalesProductWorkspaceArchivePort {
  archiveSalesProductWorkspace(input: {
    organizationId: string;
    salesProductId: string;
    archivedAt: Date;
  }): Promise<void>;
}

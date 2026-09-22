export const SALES_PRODUCT_OWNER_READ_PORT = Symbol('SALES_PRODUCT_OWNER_READ_PORT');

/**
 * The narrowest thing AI needs from Channels: is this sales-product draft a real
 * row of this organization?
 *
 * A content workspace names its owner by id with no foreign key (ADR-0013), so
 * without this a request could open a workspace on any UUID it invented. AI
 * asks the owner instead of reading the `sales_products` table.
 */
export interface SalesProductOwnerReadPort {
  /** Throws `NotFoundException` when the draft is absent or owned by another organization. */
  assertOwner(input: { organizationId: string; salesProductId: string }): Promise<void>;
}

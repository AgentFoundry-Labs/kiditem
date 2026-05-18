import type { ProductsRepositoryTransaction } from './products-transaction.port';

export const MASTER_CODE_PORT = Symbol('MASTER_CODE_PORT');

export interface MasterCodePort {
  generate(tx?: ProductsRepositoryTransaction): Promise<string>;
}

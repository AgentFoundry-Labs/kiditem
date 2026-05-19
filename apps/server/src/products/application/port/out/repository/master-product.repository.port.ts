import type { ListMastersQuery } from '../../../../dto/list-masters.query';
import type { ProductsRepositoryTransaction } from '../transaction/products-transaction.port';

export const MASTER_PRODUCT_REPOSITORY_PORT = Symbol('MASTER_PRODUCT_REPOSITORY_PORT');

export interface MasterProductImageRow {
  id: string;
  url: string;
  storageKey: string | null;
  role: string;
  label: string | null;
  sortOrder: number;
  source: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  isPrimary: boolean;
}

export interface MasterImageWriteInput {
  url: string;
  storageKey?: string | null;
  role: string;
  label?: string | null;
  sortOrder: number;
  source?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
  isPrimary?: boolean;
}

export interface MasterWithImageRows {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  legacyCode: string | null;
  barcode: string | null;
  description: string;
  category: string | null;
  brand: string | null;
  tags: unknown;
  optionCounter: number;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  abcGrade: string | null;
  profitTag: string | null;
  adTier: string | null;
  adBudgetLimit: number | null;
  healthScore: number | null;
  healthUpdatedAt: Date | null;
  sourceUrl?: string | null;
  sourcePlatform?: string | null;
  costCny?: unknown;
  marginRate?: unknown;
  rawData?: unknown;
  pipelineStep?: string | null;
  detailPageUrl: string | null;
  thumbnailStrategy: string;
  isDeleted: boolean;
  deletedAt: Date | null;
  isTemporary: boolean;
  lifecycleState: string;
  temporaryReason: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
  draftContent?: unknown;
  processedData?: unknown;
  images: MasterProductImageRow[];
}

export interface ProductContentCardRow {
  id: string;
  generatedTitle: string | null;
  status: string;
  generationInput: unknown;
  generationResult: unknown;
  errorMessage: string | null;
  editedHtmlSavedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  generationGroup: {
    targetMaster: {
      id: string;
      code: string;
      name: string;
      thumbnailUrl: string | null;
      imageUrl: string | null;
      isTemporary: boolean;
      images: Array<{ url: string }>;
    } | null;
  };
}

export interface ProductBoundContentCardRow extends ProductContentCardRow {
  generationGroup: {
    targetMaster: NonNullable<ProductContentCardRow['generationGroup']['targetMaster']>;
  };
}

export interface GenerationHistoryRow {
  id: string;
  generatedTitle: string | null;
  status: string;
  generationResult: unknown;
  errorMessage: string | null;
  createdAt: Date;
}

export interface MasterBarcodeOwnerRow {
  id: string;
  code: string;
  name: string;
}

export interface MasterProductRepositoryPort {
  create(input: {
    organizationId: string;
    data: Record<string, unknown>;
    images: MasterImageWriteInput[];
    tx: ProductsRepositoryTransaction;
  }): Promise<MasterWithImageRows>;
  createPromoted(input: {
    organizationId: string;
    data: Record<string, unknown>;
    images: MasterImageWriteInput[];
    tx: ProductsRepositoryTransaction;
  }): Promise<{ id: string }>;
  list(
    organizationId: string,
    query: ListMastersQuery,
  ): Promise<{ items: MasterWithImageRows[]; nextCursor: string | null }>;
  findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<MasterWithImageRows | null>;
  findByCode(organizationId: string, code: string): Promise<MasterWithImageRows | null>;
  findByLegacy(organizationId: string, legacyCode: string): Promise<MasterWithImageRows | null>;
  findActiveBarcodeOwners(input: {
    organizationId: string;
    barcode: string;
    tx: ProductsRepositoryTransaction;
  }): Promise<MasterBarcodeOwnerRow[]>;
  update(input: {
    organizationId: string;
    id: string;
    data: Record<string, unknown>;
    images?: unknown;
    tx: ProductsRepositoryTransaction;
  }): Promise<MasterWithImageRows>;
  findImageRows(organizationId: string, masterId: string): Promise<MasterProductImageRow[]>;
  updateImages(input: {
    organizationId: string;
    id: string;
    images: unknown;
  }): Promise<MasterWithImageRows>;
  createUploadedImage(input: {
    organizationId: string;
    masterId: string;
    url: string;
    storageKey: string;
    mimeType: string;
    fileSize: number;
  }): Promise<MasterProductImageRow>;
  findPreviewData(
    organizationId: string,
    id: string,
  ): Promise<{ processedData: unknown; draftContent: unknown } | null>;
  findDraftContent(organizationId: string, id: string): Promise<{ draftContent: unknown } | null>;
  saveDraftContent(organizationId: string, id: string, draftContent: unknown): Promise<number>;
  listProductContentCards(input: {
    organizationId: string;
    productId?: string | null;
    page: number;
    limit: number;
    templateIds: readonly string[];
  }): Promise<{ total: number; rows: ProductContentCardRow[] }>;
  findGenerationHistoryRows(input: {
    organizationId: string;
    masterId: string;
    limit: number;
  }): Promise<GenerationHistoryRow[]>;
  deleteGenerationHistory(input: {
    organizationId: string;
    masterId: string;
    generationId: string;
  }): Promise<number>;
  softDelete(
    organizationId: string,
    id: string,
    tx?: ProductsRepositoryTransaction,
  ): Promise<number>;
  restore(
    organizationId: string,
    id: string,
    tx?: ProductsRepositoryTransaction,
  ): Promise<number>;
}

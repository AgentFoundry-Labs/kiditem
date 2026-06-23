export const SOURCING_1688_IMAGE_SEARCH_PORT = Symbol('SOURCING_1688_IMAGE_SEARCH_PORT');

export interface Search1688ImageInput {
  imageUrl: string;
  keyword?: string;
  maxResults?: number;
}

export interface Search1688ImageItem {
  title: string;
  priceCny: number | null;
  sourceUrl: string;
  imageUrl: string | null;
  score: number;
  salesText?: string | null;
  salesNum?: number | null;
  supplierName?: string | null;
  supplierFactoryUrl?: string | null;
  supplierTags?: string[];
  purchaseTags?: string[];
  minOrderQuantity?: number | null;
  shippingFulfillmentRate?: string | null;
  shippingPickupRate?: string | null;
  shipFrom?: string | null;
  serviceScore?: number | null;
  repurchaseRate?: string | null;
}

export interface Search1688ImageResult {
  imageUrl: string;
  convertedImageUrl: string | null;
  items: Search1688ImageItem[];
}

export interface Search1688ImageStatus {
  configured: boolean;
  baseUrl: string;
}

export interface Sourcing1688ImageSearchPort {
  getStatus(): Search1688ImageStatus;
  searchByImage(input: Search1688ImageInput): Promise<Search1688ImageResult>;
}

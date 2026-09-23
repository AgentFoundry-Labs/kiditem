import type {
  SalesProductCertification,
  SalesProductDeliveryFeeType,
  SalesProductKcStatus,
  SalesProductStatus,
  SalesProductTaxType,
} from '@kiditem/shared/sales-product';

/** 판매상품 기본 칸(옵션 제외). 저장소는 값을 그대로 쓴다 — 검증은 서비스가 끝낸다. */
export interface SalesProductBasicsRecord {
  name: string;
  ownCode: string | null;
  shortName: string | null;
  englishName: string | null;
  printName: string | null;
  modelName: string | null;
  modelNo: string | null;
  brand: string | null;
  manufacturer: string | null;
  originCountry: string | null;
  originRegion: string | null;
  keywords: string[];
  standardCategory: string | null;
  description: string;
  targetAudience: string | null;
  ageGroup: string | null;
  productSize: string | null;
  colorVariantNames: string[];
  boxSetQuantity: number | null;
  registrationDefaults: Record<string, unknown> | null;
  status: SalesProductStatus;
  taxType: SalesProductTaxType;
  deliveryFeeType: SalesProductDeliveryFeeType | null;
  deliveryFee: number | null;
  stockManaged: boolean;
  imageUrls: string[];
  detailHtml: string | null;
  extraDetailHtml: string[];
  noticeCategory: string | null;
  noticeValues: string[];
  certifications: SalesProductCertification[];
  /** KC 가 이 상품에 걸리는 방식. '해당 없음'을 말하는 자리다. */
  kcStatus: SalesProductKcStatus;
  importDeclarationNo: string | null;
  adminMemo: string | null;
}

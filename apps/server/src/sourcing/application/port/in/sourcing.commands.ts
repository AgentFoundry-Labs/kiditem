export interface RegisterManualProductCommand {
  title: string;
  category?: string;
  description?: string;
  target?: string;
  thumbnailUrl?: string;
  thumbnailUrls?: string[];
  imageUrls: string[];
  optionNames?: string[];
  keywords?: string[];
  ageGroup?: 'age-8-plus' | 'age-14-plus';
  kcCertificationStatus?: 'unknown' | 'none' | 'exists';
  kcCertificationNumber?: string;
  productSize?: string;
  colorVariantStatus?: string;
  colorVariantNames?: string;
  boxSetStatus?: string;
  boxSetQuantity?: string;
  // 사방넷 신규등록의 가격정보 · 기본정보와 같은 칸. 수집상품을 거쳐 판매상품까지 간다.
  salePrice?: number;
  tagPrice?: number;
  /** 사방넷 `원가`(공급가). */
  costPrice?: number;
  brand?: string;
  manufacturer?: string;
  originCountry?: string;
  modelName?: string;
  ownCode?: string;
  /** `taxable` 과세 · `tax_free` 면세. */
  taxType?: string;
  deliveryFee?: number;
  /** `free` · `prepay` · `collect` · `collect_or_prepay`. */
  deliveryFeeType?: string;
  certificationIssuer?: string;
  certificationField?: string;
}

export interface CreateProductGenerationCommand extends RegisterManualProductCommand {
  /**
   * 이미 있는 상세페이지 이미지. 차 있으면 AI 생성을 돌리지 않고 이걸 그대로 건다
   * (사장님 2026-09-22). 순서가 곧 상세페이지에 쌓이는 순서다.
   */
  detailPageImageUrls?: string[];
  templateId?: 'kids-playful' | 'bold-vertical';
  detailImageCount?: '2' | '3' | '4' | '5' | '6';
  usageSectionMode?: 'include' | 'exclude';
}

interface ProductInfoItem {
  key: string;
  value: string;
}

interface FeatureItem {
  title: string;
  description: string;
}

export interface ProductEditState {
  name: string;
  category: string;
  originalPrice: number;
  salePrice: number;
  discountRate: number;
  thumbnails: string[];
  tags: string[];
  rating: number;
  reviewCount: number;
  productInfo: ProductInfoItem[];
  features: FeatureItem[];
}

export const PLACEHOLDER_DATA: ProductEditState = {
  name: '',
  category: '',
  originalPrice: 0,
  salePrice: 0,
  discountRate: 0,
  thumbnails: [],
  tags: [],
  rating: 0,
  reviewCount: 0,
  productInfo: [],
  features: [],
};

export function mapProcessedData(processed: Record<string, unknown>): ProductEditState {
  const title = typeof processed.title === 'string' ? processed.title : '';
  const imagesList = Array.isArray(processed.images) ? (processed.images as string[]) : [];
  const price = typeof processed.price === 'number' ? processed.price : 0;
  const specs = Array.isArray(processed.specs) ? (processed.specs as ProductInfoItem[]) : [];
  const feats = Array.isArray(processed.features) ? (processed.features as FeatureItem[]) : [];

  return {
    name: title,
    category: '',
    originalPrice: 0,
    salePrice: price,
    discountRate: 0,
    thumbnails: imagesList,
    tags: [],
    rating: 0,
    reviewCount: 0,
    productInfo: specs,
    features: feats,
  };
}

export const CATEGORIES = [
  '생활/건강 > 세제/세정제 > 세탁세제 > 액상세제',
  '생활/건강 > 세제/세정제 > 세탁세제 > 캡슐세제',
  '뷰티 > 스킨케어 > 에센스/세럼 > 비타민세럼',
  '식품 > 건강식품 > 비타민/미네랄 > 종합비타민',
  '가전디지털 > 생활가전 > 청소기 > 로봇청소기',
  '패션의류 > 여성의류 > 원피스 > 미디원피스',
];

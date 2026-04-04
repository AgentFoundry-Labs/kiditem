'use client';

import dynamic from 'next/dynamic';
import TabLayout from '@/components/ui/TabLayout';
import { Package, Layers, Star, Trash2, Image, FolderTree } from 'lucide-react';

const ProductsPage = dynamic(() => import('@/app/products/page'), { ssr: false });
const BundlePage = dynamic(() => import('@/app/product-hub/components/BundleProducts'), { ssr: false });
const CorePage = dynamic(() => import('@/app/product-hub/components/CoreProducts'), { ssr: false });
const CleanupPage = dynamic(() => import('@/app/product-hub/components/CleanupProducts'), { ssr: false });
const ThumbPage = dynamic(() => import('@/app/thumbnails/page'), { ssr: false });
const CategoriesPage = dynamic(() => import('@/app/product-hub/components/Categories'), { ssr: false });

export default function ProductHubPage() {
  return (
    <TabLayout
      title="상품 관리"
      titleIcon={Package}
      tabs={[
        { id: 'all', label: '전체 상품', icon: Package, content: <ProductsPage /> },
        { id: 'bundle', label: '세트 상품', icon: Layers, content: <BundlePage /> },
        { id: 'core', label: '핵심상품', icon: Star, content: <CorePage /> },
        { id: 'cleanup', label: '정리 대상', icon: Trash2, content: <CleanupPage /> },
        { id: 'thumb', label: '썸네일', icon: Image, content: <ThumbPage /> },
        { id: 'categories', label: '카테고리', icon: FolderTree, content: <CategoriesPage /> },
      ]}
    />
  );
}

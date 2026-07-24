'use client';

import { useState } from 'react';
import { PackageSearch } from 'lucide-react';

export function MasterProductImage({
  imageUrl,
  productName,
  className,
  loading = 'lazy',
}: {
  imageUrl: string | null | undefined;
  productName: string;
  className: string;
  loading?: 'eager' | 'lazy';
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const normalizedUrl = imageUrl?.trim() ?? '';
  if (!normalizedUrl || failedUrl === normalizedUrl) {
    return <PackageSearch size={22} aria-hidden="true" />;
  }
  return (
    <img
      src={normalizedUrl}
      alt={`${productName} 상품 이미지`}
      className={className}
      loading={loading}
      onError={() => setFailedUrl(normalizedUrl)}
    />
  );
}

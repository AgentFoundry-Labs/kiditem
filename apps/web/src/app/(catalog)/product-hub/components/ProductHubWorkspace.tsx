'use client';

import { useSearchParams } from 'next/navigation';
import ProductsPageContent from './ProductsPageContent';
import { ProductOptionsWorkspace } from './ProductOptionsWorkspace';

export function ProductHubWorkspace() {
  const view = useSearchParams().get('view');

  if (view === 'options') {
    return <ProductOptionsWorkspace headingLevel={1} />;
  }

  return <ProductsPageContent headingLevel={1} />;
}

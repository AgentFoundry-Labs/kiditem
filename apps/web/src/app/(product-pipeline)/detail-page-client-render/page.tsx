import { Suspense } from 'react';
import { DetailPageClientRenderSurface } from './DetailPageClientRenderSurface';

export default function DetailPageClientRenderPage() {
  return (
    <Suspense fallback={null}>
      <DetailPageClientRenderSurface />
    </Suspense>
  );
}

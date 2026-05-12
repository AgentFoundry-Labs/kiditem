'use client';

import { useEffect, useState } from 'react';
import type { SourcingCandidateStatus } from '@kiditem/shared/sourcing';
import { isInProgress } from '../lib/sourcing-api';

interface ProductLike {
  id: string;
  status: SourcingCandidateStatus;
}

/**
 * Tracks optimistic processing ids for the sourcing list page.
 *
 * Phase 7 (#192): the list endpoint filters to `status='sourced'`, so the
 * polling-driven removal path now consumes the 3-state candidate machine.
 * Optimistic adds remain client-only (no external API exposed here); rows
 * naturally fall out of the list when the server flips them to
 * `promoted`/`rejected`.
 */
export function useProcessingIds(products: ProductLike[]) {
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setProcessingIds((prev) => {
      if (prev.size === 0) return prev;
      const productMap = new Map(products.map((p) => [p.id, p]));
      const next = new Set(prev);
      let changed = false;
      Array.from(prev).forEach((id) => {
        const product = productMap.get(id);
        if (!product || !isInProgress(product.status)) {
          next.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [products]);

  return { processingIds };
}

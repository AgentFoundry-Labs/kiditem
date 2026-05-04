'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProductListItem as Product } from '../lib/product-types';
import type { GradeMap } from '../lib/abc-grading';
import { gradeOf, scoreOf } from '../lib/abc-grading';

export type ProductGrade = 'A' | 'B' | 'C';
export type ProductGradeChangeDirection = 'upgrade' | 'downgrade' | 'flat';
export type ProductGradeChangeKey = 'all' | `${ProductGrade}->${ProductGrade}`;

export interface ProductGradeChange {
  id: string;
  productId: string;
  productName: string;
  fromGrade: ProductGrade;
  toGrade: ProductGrade;
  score: number;
  direction: ProductGradeChangeDirection;
  changedAt: string;
}

interface GradeSnapshot {
  grade: ProductGrade;
  score: number;
  name: string;
}

const MAX_RECENT_CHANGES = 18;
const GRADE_WEIGHT: Record<ProductGrade, number> = { A: 3, B: 2, C: 1 };

export function productGradeChangeKey(change: ProductGradeChange): ProductGradeChangeKey {
  return `${change.fromGrade}->${change.toGrade}`;
}

export function useProductGradeChanges(products: Product[], gradeMap: GradeMap) {
  const previousRef = useRef<Map<string, GradeSnapshot> | null>(null);
  const [changes, setChanges] = useState<ProductGradeChange[]>([]);

  useEffect(() => {
    const current = new Map<string, GradeSnapshot>();
    for (const product of products) {
      current.set(product.id, {
        grade: normalizeGrade(gradeOf(product, gradeMap)),
        score: scoreOf(product, gradeMap),
        name: product.name,
      });
    }

    const previous = previousRef.current;
    if (previous === null) {
      previousRef.current = current;
      return;
    }

    const detected: ProductGradeChange[] = [];
    const now = new Date().toISOString();
    for (const [productId, snapshot] of current.entries()) {
      const before = previous.get(productId);
      if (!before || before.grade === snapshot.grade) continue;
      detected.push({
        id: createClientId(),
        productId,
        productName: snapshot.name,
        fromGrade: before.grade,
        toGrade: snapshot.grade,
        score: snapshot.score,
        direction: gradeDirection(before.grade, snapshot.grade),
        changedAt: now,
      });
    }

    if (detected.length > 0) {
      setChanges((prev) => mergeRecentChanges(detected, prev));
      notifyGradeChanges(detected);
    }

    previousRef.current = current;
  }, [gradeMap, products]);

  return { gradeChanges: changes };
}

function normalizeGrade(grade: string | null | undefined): ProductGrade {
  if (grade === 'A' || grade === 'B') return grade;
  return 'C';
}

function gradeDirection(fromGrade: ProductGrade, toGrade: ProductGrade): ProductGradeChangeDirection {
  const diff = GRADE_WEIGHT[toGrade] - GRADE_WEIGHT[fromGrade];
  if (diff > 0) return 'upgrade';
  if (diff < 0) return 'downgrade';
  return 'flat';
}

function mergeRecentChanges(incoming: ProductGradeChange[], previous: ProductGradeChange[]) {
  const seen = new Set<string>();
  const merged: ProductGradeChange[] = [];
  for (const change of [...incoming, ...previous]) {
    const key = `${change.productId}:${change.fromGrade}:${change.toGrade}:${change.changedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(change);
    if (merged.length >= MAX_RECENT_CHANGES) break;
  }
  return merged;
}

function notifyGradeChanges(changes: ProductGradeChange[]) {
  const downgrades = changes.filter((change) => change.direction === 'downgrade');
  const message = summarizeChanges(changes);

  if (downgrades.length > 0) toast.warning(message);
  else toast.info(message);
}

function summarizeChanges(changes: ProductGradeChange[]): string {
  const counts = new Map<ProductGradeChangeKey, number>();
  for (const change of changes) {
    const key = productGradeChangeKey(change);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => `${key.replace('->', '->')} ${count}건`)
    .join(' · ');
}

function createClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `grade-change-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

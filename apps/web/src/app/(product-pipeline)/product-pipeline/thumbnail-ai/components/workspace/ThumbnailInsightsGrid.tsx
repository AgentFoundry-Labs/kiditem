'use client';

import type { ComponentProps } from 'react';
import { GradeDistributionDonut } from '../GradeDistributionDonut';
import { AiActionCenter } from '../AiActionCenter';
import { ComplianceCard } from '../ComplianceCard';
import { AnalyticsCard } from '../AnalyticsCard';

type GradeDistribution = ComponentProps<typeof GradeDistributionDonut>['gradeDistribution'];

interface ThumbnailInsightsGridProps {
  analyzedCount: number;
  avgScore: number;
  healthGrade: string;
  gradeDistribution: GradeDistribution;
  unclassifiedWithImageCount: number;
  needsRegenCount: number;
  noImageCount: number;
  batchAnalyzing: boolean;
  editJobsPending: boolean;
  failCount: number;
  warnCount: number;
  passCount: number;
  appliedCount: number;
  reviewedCount: number;
  onSelectGrade: (grade: string) => void;
  onClassify: () => void;
  onEdit: () => void;
  onShowNoImage: () => void;
  onShowCompliance: () => void;
  onShowHistory: () => void;
}

export function ThumbnailInsightsGrid({
  analyzedCount,
  avgScore,
  healthGrade,
  gradeDistribution,
  unclassifiedWithImageCount,
  needsRegenCount,
  noImageCount,
  batchAnalyzing,
  editJobsPending,
  failCount,
  warnCount,
  passCount,
  appliedCount,
  reviewedCount,
  onSelectGrade,
  onClassify,
  onEdit,
  onShowNoImage,
  onShowCompliance,
  onShowHistory,
}: ThumbnailInsightsGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
      <GradeDistributionDonut
        analyzedCount={analyzedCount}
        avgScore={avgScore}
        healthGrade={healthGrade}
        gradeDistribution={gradeDistribution}
        onSelectGrade={onSelectGrade}
      />
      <AiActionCenter
        unclassifiedWithImageCount={unclassifiedWithImageCount}
        needsRegenCount={needsRegenCount}
        noImageCount={noImageCount}
        batchAnalyzing={batchAnalyzing}
        editJobsPending={editJobsPending}
        onClassify={onClassify}
        onEdit={onEdit}
        onShowNoImage={onShowNoImage}
      />
      <ComplianceCard
        failCount={failCount}
        warnCount={warnCount}
        passCount={passCount}
        onClick={onShowCompliance}
      />
      <AnalyticsCard
        appliedCount={appliedCount}
        reviewedCount={reviewedCount}
        onClick={onShowHistory}
      />
    </div>
  );
}

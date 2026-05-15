'use client';

import { Suspense, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  THUMBNAIL_AI_ROOT,
  normalizeProductPipelineReturnTo,
} from '../_shared/lib/product-pipeline-routes';
import { useAnalysisList } from '../thumbnail-ai/hooks/useThumbnailAnalysis';
import { useGenerationList } from '../_shared/hooks/useThumbnailGenerations';
import { AutoEditSection } from './components/hub/AutoEditSection';
import { DirectUploadJobsSection } from './components/hub/DirectUploadJobsSection';
import { HubUploadZone, type HubUploadZoneHandle } from './components/hub/HubUploadZone';
import { ModeShowcase } from './components/hub/ModeShowcase';
import { NeedsFixSection } from './components/hub/NeedsFixSection';
import { PendingSection } from './components/hub/PendingSection';
import { RegistrationPendingSection } from './components/hub/RegistrationPendingSection';

export default function ThumbnailGenerationHubPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-0px)] bg-slate-50" />}>
      <ThumbnailGenerationHubContent />
    </Suspense>
  );
}

function ThumbnailGenerationHubContent() {
  const { data: generations = [] } = useGenerationList();
  const { data: analysis } = useAnalysisList();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = normalizeProductPipelineReturnTo(searchParams.get('returnTo'));

  const uploadRef = useRef<HubUploadZoneHandle>(null);

  const startUpload = (mode: 'edit' | 'creative') => {
    uploadRef.current?.openFilePicker(mode);
  };

  const hasPending = generations.some(
    (g) => g.status === 'pending' || g.status === 'running' || g.status === 'succeeded',
  );
  const hasRegistrationPending = generations.some(
    (g) =>
      g.phase === 'applied' &&
      (g.registrationStatus == null || g.registrationStatus === 'failed'),
  );
  const hasNeedsFix = (analysis?.allResults ?? []).some(
    (r) =>
      r.imageUrl &&
      (r.complianceGrade === 'FAIL' ||
        r.complianceGrade === 'WARN' ||
        r.grade === 'B' ||
        r.grade === 'C' ||
        r.grade === 'F'),
  );
  const isEmpty = !hasPending && !hasRegistrationPending && !hasNeedsFix;

  return (
    <div className="relative -m-6 min-h-[calc(100vh-0px)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-violet-200/40 via-white/0 to-fuchsia-200/40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(1200px_600px_at_10%_0%,rgba(167,139,250,0.18),transparent_60%),radial-gradient(1000px_500px_at_100%_20%,rgba(232,121,249,0.18),transparent_60%)]"
      />
      <div className="space-y-4 p-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900">
            썸네일 생성
          </h1>
          {returnTo && (
            <button
              type="button"
              onClick={() => router.push(returnTo)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              상품 화면으로 돌아가기
            </button>
          )}
        </header>

        <ModeShowcase onStart={startUpload} />

        <HubUploadZone ref={uploadRef} hideDropzone returnTo={returnTo} />

        <DirectUploadJobsSection returnTo={returnTo} />

        <AutoEditSection />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PendingSection returnTo={returnTo} />
          <RegistrationPendingSection returnTo={returnTo} />
        </div>
        <NeedsFixSection returnTo={returnTo} />

        {isEmpty && (
          <div className="rounded-2xl border border-white/60 bg-white/40 py-16 text-center shadow-sm backdrop-blur-xl">
            <div className="text-sm font-semibold text-gray-700">진행 중인 작업이 없어요</div>
            <div className="mt-1 text-xs text-gray-500">
              이미지를 업로드하거나{' '}
              <Link
                href={THUMBNAIL_AI_ROOT}
                className="font-medium text-violet-600 hover:underline"
              >
                썸네일 AI
              </Link>
              에서 수정이 필요한 상품을 찾아보세요.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

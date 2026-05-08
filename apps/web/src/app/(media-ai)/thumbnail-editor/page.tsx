'use client';

import { useRef } from 'react';
import Link from 'next/link';

import { useAnalysisList } from '@/app/(media-ai)/thumbnails/hooks/useThumbnailAnalysis';

import { useGenerationList } from '../_shared/hooks/useThumbnailGenerations';
import { HubUploadZone, type HubUploadZoneHandle } from './components/HubUploadZone';
import { ModeShowcase } from './components/ModeShowcase';
import { PendingSection } from './components/PendingSection';
import { RegistrationPendingSection } from './components/RegistrationPendingSection';
import { NeedsFixSection } from './components/NeedsFixSection';
import { AutoEditSection } from './components/AutoEditSection';
import { DirectUploadJobsSection } from './components/DirectUploadJobsSection';

export default function ThumbnailEditorHubPage() {
  const { data: generations = [] } = useGenerationList();
  const { data: analysis } = useAnalysisList();

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
      <div className="p-6 space-y-4">
        <header>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">
            썸네일 편집기
          </h1>
        </header>

        <ModeShowcase onStart={startUpload} />

        <HubUploadZone ref={uploadRef} hideDropzone />

        <DirectUploadJobsSection />

        <AutoEditSection />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PendingSection />
          <RegistrationPendingSection />
        </div>
        <NeedsFixSection />

        {isEmpty && (
          <div className="rounded-2xl border border-white/60 bg-white/40 backdrop-blur-xl py-16 text-center shadow-sm">
            <div className="text-sm text-gray-700 font-semibold">진행 중인 작업이 없어요</div>
            <div className="mt-1 text-xs text-gray-500">
              이미지를 업로드하거나{' '}
              <Link href="/thumbnails" className="text-violet-600 hover:underline font-medium">
                썸네일 허브
              </Link>
              에서 수정이 필요한 상품을 찾아보세요.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ImageIcon } from 'lucide-react';

import {
  THUMBNAIL_AI_ROOT,
  normalizeProductPipelineReturnTo,
  productBoundThumbnailWorkspaceHref,
  thumbnailGenerationEditHref,
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
  const imageUrl = searchParams.get('imageUrl');
  const uploadKey = searchParams.get('uploadKey');
  const productName = searchParams.get('productName')?.trim() ?? '';
  const productDescription = searchParams.get('productDescription')?.trim() ?? '';
  const productId = searchParams.get('productId');
  const sourceCandidateId = searchParams.get('sourceCandidateId');
  const contentWorkspaceId = searchParams.get('contentWorkspaceId');
  const hasWorkspaceInput = Boolean(imageUrl || uploadKey || productName || productId || sourceCandidateId || contentWorkspaceId);
  const workspaceHref = productBoundThumbnailWorkspaceHref({
    productId,
    sourceCandidateId,
    contentWorkspaceId,
    returnTo,
    imageUrl,
    uploadKey,
    productName,
    productDescription,
    mode: 'edit',
  });

  const uploadRef = useRef<HubUploadZoneHandle>(null);

  useEffect(() => {
    if (workspaceHref) router.replace(workspaceHref);
  }, [router, workspaceHref]);

  if (workspaceHref) {
    return <div className="min-h-[calc(100vh-0px)] bg-slate-50" />;
  }

  const startUpload = (mode: 'edit' | 'creative') => {
    if (hasWorkspaceInput) {
      router.push(thumbnailGenerationEditHref({
        editCase: mode === 'edit' ? 'single' : null,
        extraParams: uploadKey ? { uploadKey } : undefined,
        imageUrl,
        mode,
        productDescription,
        productName,
        returnTo,
        subjectParams: {
          productId,
          sourceCandidateId,
          contentWorkspaceId,
        },
      }));
      return;
    }
    uploadRef.current?.openFilePicker(mode);
  };

  const hasActiveGeneration = generations.some(
    (g) => g.status === 'pending' || g.status === 'running',
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
  const isEmpty = !hasActiveGeneration && !hasRegistrationPending && !hasNeedsFix;

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

        {hasWorkspaceInput && (
          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-100 bg-white/75 p-3 shadow-sm backdrop-blur">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon size={20} className="text-violet-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-violet-600">상품 화면에서 가져온 이미지</div>
              <div className="mt-0.5 truncate text-sm font-extrabold text-slate-900">
                {productName || '상품명 없음'}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                아래 생성 유형을 선택하면 이 이미지로 작업 화면을 시작합니다.
              </div>
            </div>
            {returnTo && (
              <button
                type="button"
                onClick={() => router.push(returnTo)}
                className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                상품으로 돌아가기
              </button>
            )}
          </section>
        )}

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

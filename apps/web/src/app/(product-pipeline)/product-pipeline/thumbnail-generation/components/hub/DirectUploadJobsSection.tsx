'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageIcon, Sparkles, UploadCloud } from 'lucide-react';

import { resolveImageUrl } from '@/lib/resolve-url';
import { formatDateTime } from '@/lib/utils';

import { thumbnailGenerationEditHref } from '../../../_shared/lib/product-pipeline-routes';
import { thumbnailJobTitle, useThumbnailJobs, type ThumbnailJobView } from '../../../_shared/hooks/useThumbnailJobs';
import {
  listRecentThumbnailEditorUploads,
  readThumbnailEditorUpload,
  type ThumbnailEditorRecentUpload,
} from '../../edit/lib/upload-session';

export function DirectUploadJobsSection({ returnTo = null }: { returnTo?: string | null }) {
  const router = useRouter();
  const [items, setItems] = useState<ThumbnailEditorRecentUpload[]>([]);
  const { data: persistedGenerations = [] } = useThumbnailJobs({
    scope: 'direct-upload',
    limit: 8,
  });

  useEffect(() => {
    const refresh = () => setItems(listRecentThumbnailEditorUploads());
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const visibleItems = useMemo(() => items.slice(0, 8), [items]);
  const visiblePersisted = useMemo(() => persistedGenerations.slice(0, 8), [persistedGenerations]);
  const totalVisible = visiblePersisted.length + visibleItems.length;

  const openItem = (item: ThumbnailEditorRecentUpload) => {
    router.push(thumbnailGenerationEditHref({
      editCase: item.mode === 'edit' ? 'single' : null,
      extraParams: {
        uploadKey: item.uploadKey,
      },
      mode: item.mode,
      productName: item.productName,
      returnTo,
    }));
  };

  const openGeneration = (item: ThumbnailJobView) => {
    const mode = item.method === 'creative' ? 'creative' : 'edit';
    router.push(thumbnailGenerationEditHref({
      editCase: mode === 'edit' ? 'single' : null,
      generationId: item.id,
      mode,
      productName: directGenerationTitle(item),
      returnTo,
    }));
  };

  return (
    <section className="rounded-3xl bg-white/45 backdrop-blur-xl border border-white/70 shadow-[0_8px_32px_rgba(99,102,241,0.06)] px-6 py-7">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100/80 text-violet-600">
            <UploadCloud size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">
              직접 업로드 생성 이력
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              상품명과 이미지로 시작한 썸네일 결과를 다시 확인합니다.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
          {totalVisible}
        </span>
      </div>

      {totalVisible === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-violet-100 bg-white/45 px-4 py-10 text-center">
          <Sparkles size={22} className="text-violet-300" />
          <p className="mt-2 text-sm font-bold text-gray-700">직접 업로드 생성 이력 없음</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-gray-500">
            위 버튼에서 상품명과 이미지를 넣고 생성하면 여기에 남습니다.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          {visiblePersisted.map((item) => (
            <DirectGenerationCard
              key={item.id}
              item={item}
              onClick={() => openGeneration(item)}
            />
          ))}
          {visibleItems.map((item) => (
            <DirectUploadCard
              key={item.uploadKey}
              item={item}
              onClick={() => openItem(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** 직접 업로드 job 의 이름은 그 job 이 시작될 때 받은 상품명이다(서버가 작업공간 요약의 이름으로 준다). */
function directGenerationTitle(item: ThumbnailJobView): string {
  return thumbnailJobTitle(item, '직접 업로드');
}

function directGenerationPreview(item: ThumbnailJobView): string | null {
  return item.adoptedCandidate?.url ?? item.candidates[0]?.url ?? item.workspace?.imageUrl ?? null;
}

function DirectGenerationCard({
  item,
  onClick,
}: {
  item: ThumbnailJobView;
  onClick: () => void;
}) {
  const title = directGenerationTitle(item);
  const displayUrl = resolveImageUrl(directGenerationPreview(item));
  const resultCount = item.candidates.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg"
    >
      <div className="relative aspect-square bg-gray-100">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <ImageIcon size={22} />
          </div>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
          {item.method === 'creative' ? '연출' : '편집'}
        </span>
        {resultCount > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-violet-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
            생성 {resultCount}
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <p className="truncate text-xs font-bold text-gray-900">{title}</p>
        <p className="truncate text-[10px] font-medium text-gray-400">
          {formatDateTime(item.createdAt, {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </button>
  );
}

function DirectUploadCard({
  item,
  onClick,
}: {
  item: ThumbnailEditorRecentUpload;
  onClick: () => void;
}) {
  const imageUrl = readThumbnailEditorUpload(item.uploadKey);
  const displayUrl = resolveImageUrl(item.latestResultUrl) ?? imageUrl;
  const dateSource = item.lastGeneratedAt ?? item.createdAt;
  const hasGeneratedResult = Boolean(item.latestResultUrl && item.resultCount);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg"
    >
      <div className="relative aspect-square bg-gray-100">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt={item.productName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <ImageIcon size={22} />
          </div>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
          {item.mode === 'creative' ? '연출' : '편집'}
        </span>
        {hasGeneratedResult && (
          <span className="absolute left-2 top-2 rounded-full bg-violet-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
            생성 {item.resultCount}
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <p className="truncate text-xs font-bold text-gray-900">{item.productName}</p>
        <p className="truncate text-[10px] font-medium text-gray-400">
          {dateSource ? formatDateTime(dateSource, {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }) : '이번 세션'}
        </p>
      </div>
    </button>
  );
}

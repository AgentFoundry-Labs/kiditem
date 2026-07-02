'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileSpreadsheet, Loader2, LockKeyhole, Store, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

const ACCEPTED_EXTENSIONS = '.txt,.tsv,.csv,.xls,.xlsx';

interface OrderUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mallAccounts: OrderCollectionMallAccount[];
  defaultMallKey?: string | null;
  onUpload: (params: {
    mall: OrderCollectionMallAccount;
    file: File;
    password?: string;
  }) => Promise<void>;
}

/**
 * 상단 "업로드" 버튼이 여는 모달. 몰을 고르고 주문 파일을 올리면 변환해 생성 파일에 추가한다.
 * 실제 변환/추가는 page 의 onUpload 가 담당 (몰 태그 포함).
 */
export function OrderUploadModal({
  open,
  onOpenChange,
  mallAccounts,
  defaultMallKey,
  onUpload,
}: OrderUploadModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mallKey, setMallKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMallKey(defaultMallKey ?? mallAccounts[0]?.key ?? '');
    setFile(null);
    setPassword('');
    setDragActive(false);
  }, [open, defaultMallKey, mallAccounts]);

  const selectedMall = mallAccounts.find((account) => account.key === mallKey) ?? null;
  const canUpload = Boolean(selectedMall && file && !uploading);

  const handleUpload = async () => {
    if (!selectedMall || !file) return;
    setUploading(true);
    try {
      await onUpload({ mall: selectedMall, file, password: password.trim() || undefined });
      onOpenChange(false);
    } catch (err) {
      toast.error(uploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) setFile(dropped);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !uploading && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[130] bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[140] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <Dialog.Title className="text-sm font-semibold text-slate-900">주문 파일 업로드</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-slate-500">
                몰을 선택하고 주문 파일을 올리면 변환해 생성 파일에 추가합니다
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="닫기"
                disabled={uploading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-3 px-5 py-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">몰 선택</span>
              <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-slate-400">
                <Store size={15} className="shrink-0 text-slate-400" />
                <select
                  value={mallKey}
                  onChange={(event) => setMallKey(event.target.value)}
                  disabled={uploading || mallAccounts.length === 0}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none disabled:opacity-50"
                >
                  {mallAccounts.length === 0 ? (
                    <option value="">등록된 몰이 없습니다</option>
                  ) : (
                    mallAccounts.map((account) => (
                      <option key={account.key} value={account.key}>
                        {account.name}
                      </option>
                    ))
                  )}
                </select>
              </span>
            </label>

            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={cn(
                'flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed px-5 py-6 text-center transition-colors',
                dragActive ? 'border-purple-400 bg-purple-50' : 'border-slate-300 bg-slate-50/70',
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setFile(event.target.files?.[0] ?? null)
                }
                className="hidden"
              />
              <FileSpreadsheet size={30} className="text-slate-400" />
              <div className="mt-2 text-sm font-medium text-slate-900">
                {file ? file.name : '주문 파일을 끌어다 놓기'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {file ? fileSizeLabel(file.size) : ACCEPTED_EXTENSIONS}
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Upload size={15} />
                파일 선택
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">파일 비밀번호</span>
              <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-slate-400">
                <LockKeyhole size={15} className="shrink-0 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={uploading}
                  placeholder="비밀번호가 있을 때 입력"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-50"
                />
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!canUpload}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              업로드
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function uploadErrorMessage(err: unknown): string {
  const message = friendlyError(err) ?? '업로드 실패';
  return message === 'Failed to fetch'
    ? 'API 서버에 연결하지 못했습니다. 백엔드 실행 상태 또는 브라우저 접속 주소를 확인해주세요.'
    : message;
}

function fileSizeLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

import { useEffect, useState } from 'react';
import { Barcode, Loader2, Rocket, Store, X } from 'lucide-react';
import type { ChannelAccountOption } from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';
import { cn } from '@/lib/utils';

type ProductRegistrationKind = 'single' | 'set';

interface MarketplaceRegistrationDialogProps {
  open: boolean;
  accounts: ChannelAccountOption[];
  productName?: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    channelAccountId: string;
    externalId: string;
    productBarcode?: string | null;
    channelName?: string | null;
    channelPrice?: number | null;
  }) => void;
}

export default function MarketplaceRegistrationDialog({
  open,
  accounts,
  productName = '',
  isSubmitting,
  onClose,
  onSubmit,
}: MarketplaceRegistrationDialogProps) {
  const [channelAccountId, setChannelAccountId] = useState('');
  const [externalId, setExternalId] = useState('');
  const [registrationKind, setRegistrationKind] = useState<ProductRegistrationKind>('single');
  const [productBarcode, setProductBarcode] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelPrice, setChannelPrice] = useState('');

  useEffect(() => {
    if (!open) return;
    setChannelAccountId((current) => (
      current && accounts.some((account) => account.id === current)
        ? current
        : accounts[0]?.id || ''
    ));
    setChannelName((current) => current || productName);
  }, [accounts, open, productName]);

  if (!open) return null;

  const canSubmit = Boolean(
    channelAccountId &&
      externalId.trim() &&
      productBarcode.trim() &&
      channelName.trim(),
  ) && !isSubmitting;
  const submitRegistration = () => onSubmit({
    channelAccountId,
    externalId: externalId.trim(),
    productBarcode: productBarcode.trim() || null,
    channelName: channelName.trim() || null,
    channelPrice: channelPrice.trim() ? Number(channelPrice) : null,
  });

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-900">마켓 등록</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            마켓 계정
            <select
              value={channelAccountId}
              onChange={(event) => setChannelAccountId(event.target.value)}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.channel}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            마켓 상품번호
            <input
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              placeholder="마켓에서 발급된 상품번호"
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            상품명
            <input
              value={channelName}
              onChange={(event) => setChannelName(event.target.value)}
              placeholder="등록할 상품명을 입력합니다"
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            />
          </label>
          <div className="grid gap-1.5 text-sm font-bold text-slate-700">
            상품 구성
            <div className="grid grid-cols-2 gap-2">
              <ProductKindButton
                selected={registrationKind === 'single'}
                label="단일 상품"
                description="기존 바코드 사용"
                ariaLabel="단일 상품"
                onClick={() => setRegistrationKind('single')}
              />
              <ProductKindButton
                selected={registrationKind === 'set'}
                label="세트 상품"
                description="세트용 바코드 부여"
                ariaLabel="세트 상품"
                onClick={() => setRegistrationKind('set')}
              />
            </div>
          </div>
          <div className="grid gap-1.5 text-sm font-bold text-slate-700">
            상품 바코드
            <div className="flex gap-2">
              <input
                value={productBarcode}
                onChange={(event) => setProductBarcode(event.target.value)}
                aria-label="상품 바코드"
                placeholder={registrationKind === 'single' ? '기존 상품 바코드' : '세트 상품 바코드'}
                className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => setProductBarcode(generateDraftBarcode(channelName, registrationKind))}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                <Barcode size={14} />
                생성
              </button>
            </div>
          </div>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            마켓 판매가
            <input
              type="number"
              min={0}
              value={channelPrice}
              onChange={(event) => setChannelPrice(event.target.value)}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            />
          </label>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <MarketplaceSubmitButton
              disabled={!canSubmit}
              isSubmitting={isSubmitting}
              tone="wing"
              label="쿠팡 Wing 등록"
              onClick={submitRegistration}
            />
            <MarketplaceSubmitButton
              disabled={!canSubmit}
              isSubmitting={isSubmitting}
              tone="rocket"
              label="쿠팡 로켓 등록"
              onClick={submitRegistration}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductKindButton({
  selected,
  label,
  description,
  ariaLabel,
  onClick,
}: {
  selected: boolean;
  label: string;
  description: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-2 text-left transition',
        selected
          ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      <span className="block text-sm font-black">{label}</span>
      <span className="block text-[11px] font-bold text-slate-500">{description}</span>
    </button>
  );
}

function MarketplaceSubmitButton({
  disabled,
  isSubmitting,
  tone,
  label,
  onClick,
}: {
  disabled: boolean;
  isSubmitting: boolean;
  tone: 'wing' | 'rocket';
  label: string;
  onClick: () => void;
}) {
  const Icon = tone === 'wing' ? Store : Rocket;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex min-h-16 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white shadow-sm group-disabled:bg-slate-300">
        {isSubmitting ? <Loader2 size={17} className="animate-spin" /> : <Icon size={17} />}
      </span>
      <span className="min-w-0">
        <span className="mb-0.5 block text-[10px] font-black leading-none tracking-tight">
          <span className="text-[#e52629]">C</span>
          <span className="text-[#f58220]">o</span>
          <span className="text-[#f9b000]">u</span>
          <span className="text-[#71bf44]">p</span>
          <span className="text-[#00a5df]">a</span>
          <span className="text-[#005eb8]">n</span>
          <span className="text-[#7b3f98]">g</span>
        </span>
        <span className="block text-sm font-black text-slate-900 group-disabled:text-slate-400">
          {isSubmitting ? '처리 중...' : label}
        </span>
      </span>
    </button>
  );
}

function generateDraftBarcode(productName: string, kind: ProductRegistrationKind): string {
  const prefix = kind === 'set' ? '881' : '880';
  const seed = `${kind}:${productName.trim() || 'kiditem'}:${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const body = `${prefix}${String(hash).padStart(9, '0').slice(-9)}`;
  return `${body}${ean13Checksum(body)}`;
}

function ean13Checksum(firstTwelveDigits: string): number {
  const sum = firstTwelveDigits
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

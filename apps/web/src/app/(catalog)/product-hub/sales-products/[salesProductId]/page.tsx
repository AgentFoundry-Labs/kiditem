'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Save, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  SALES_PRODUCT_DELIVERY_FEE_TYPES,
  SALES_PRODUCT_STATUSES,
  SALES_PRODUCT_TAX_TYPES,
  type SalesProduct,
} from '@kiditem/shared/sales-product';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { ChannelListingsSection } from '../components/ChannelListingsSection';
import { ChannelOverridesSection } from '../components/ChannelOverridesSection';
import { OptionTableEditor } from '../components/OptionTableEditor';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import {
  basicsFromProduct,
  basicsPatch,
  optionsChanged,
  optionsFromProduct,
  optionsPayload,
  optionTableProblems,
  type BasicsDraft,
  type OptionTableDraft,
} from '../lib/sales-product-draft';
import {
  DELIVERY_FEE_TYPE_LABEL,
  SALES_PRODUCT_STATUS_LABEL,
  SALES_PRODUCT_STATUS_TONE,
  TAX_TYPE_LABEL,
} from '../lib/sales-product-labels';
import { salesProductDemoteState } from '../lib/sales-product-demote';

const SECTIONS = [
  { id: 'basics', label: '기본 정보' },
  { id: 'price', label: '가격 · 배송' },
  { id: 'options', label: '옵션(단품)' },
  { id: 'images', label: '이미지' },
  { id: 'detail', label: '상세' },
  { id: 'notice', label: '고시 · 인증' },
  { id: 'malls', label: '몰별 값' },
  { id: 'listings', label: '몰에 올라간 상품' },
] as const;

/**
 * 판매상품 편집(ADR-0014) — 사방넷 상품조회수정처럼 한 화면에서 기본 · 가격 · 옵션 · 이미지 · 상세 · 고시 ·
 * 몰별 값을 고친다. '저장'은 바뀐 칸만 보내고, 옵션은 기본 칸을 저장한 다음 버전으로 이어 보낸다.
 */
export default function SalesProductEditorPage({ params }: { params: Promise<{ salesProductId: string }> }) {
  const { salesProductId } = use(params);
  const product = useQuery({
    queryKey: salesProductKeys.detail(salesProductId),
    queryFn: () => salesProductApi.get(salesProductId),
  });

  if (product.isError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="empty-state text-red-600">
          {isApiError(product.error) ? product.error.detail : '판매상품을 불러오지 못했습니다.'}
        </p>
      </div>
    );
  }
  if (!product.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="empty-state">불러오는 중</p>
      </div>
    );
  }
  return <Editor key={`${product.data.id}:${product.data.version}`} product={product.data} />;
}

function BackLink() {
  return (
    <Link href="/product-hub/sales-products" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft size={14} aria-hidden />
      판매상품 목록
    </Link>
  );
}

function Editor({ product }: { product: SalesProduct }) {
  const queryClient = useQueryClient();
  const [basics, setBasics] = useState<BasicsDraft>(() => basicsFromProduct(product));
  const [options, setOptions] = useState<OptionTableDraft>(() => optionsFromProduct(product));
  const patch = useMemo(() => basicsPatch(product, basics), [product, basics]);
  const optionsDirty = useMemo(() => optionsChanged(product, options), [product, options]);
  const problems = useMemo(() => optionTableProblems(options), [options]);
  const dirty = patch !== null || optionsDirty;

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: async () => {
      let current = product;
      if (patch) current = await salesProductApi.update(product.id, { ...patch, expectedVersion: current.version });
      if (optionsDirty) current = await salesProductApi.replaceOptions(product.id, optionsPayload(options, current.version));
      return current;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(salesProductKeys.detail(product.id), next);
      void queryClient.invalidateQueries({ queryKey: [...salesProductKeys.all, 'list'] });
      toast.success('저장했습니다.');
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : '저장하지 못했습니다.'),
  });

  const set = <K extends keyof BasicsDraft>(key: K, value: BasicsDraft[K]) =>
    setBasics((current) => ({ ...current, [key]: value }));

  // 수집상품으로 되돌리기 — 수집상품에서 만든 판매상품만. 지우지 않고 내려 두어, 다시 올리면 같은 코드로 되살아난다.
  const router = useRouter();
  const showConfirm = useStore((store) => store.showConfirm);
  const demoteState = salesProductDemoteState(product);
  const demote = useMutation({
    mutationFn: () => salesProductApi.demoteToCandidate(product.id, product.version),
    onSuccess: (next) => {
      queryClient.setQueryData(salesProductKeys.detail(product.id), next);
      void queryClient.invalidateQueries({ queryKey: [...salesProductKeys.all, 'list'] });
      toast.success(`${product.code}을(를) 수집상품으로 되돌렸습니다.`);
      router.push('/product-hub/sales-products');
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : '수집상품으로 되돌리지 못했습니다.'),
  });
  const askDemote = () => showConfirm({
    title: '수집상품으로 되돌릴까요?',
    message: `${product.code} ${product.name}이(가) 판매상품 목록과 몰 대량등록에서 빠집니다. 지우지는 않아서 코드와 몰별 값이 남고, `
      + '수집상품 화면에서 다시 [몰 대량등록]을 누르면 그대로 되살아납니다.',
    confirmText: '되돌리기',
    onConfirm: () => demote.mutate(),
  });

  return (
    <div className="space-y-5 pb-24">
      <BackLink />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono">판매상품코드 {product.code}</span>
            {product.sabangnetGoodsNo && <span>· 사방넷 품번 {product.sabangnetGoodsNo}</span>}
            <span className={cn('rounded-full px-2 py-0.5 font-semibold', SALES_PRODUCT_STATUS_TONE[product.status])}>
              {demoteState.kind === 'demoted' ? '수집상품으로 되돌림' : SALES_PRODUCT_STATUS_LABEL[product.status]}
            </span>
            {product.sourceCandidateId && <span>· 수집상품에서 만듦</span>}
          </div>
          <h1 className="page-title mt-1 truncate" title={product.name}>{product.name}</h1>
        </div>
        {(demoteState.kind === 'ready' || demoteState.kind === 'blocked') && (
          <button
            type="button"
            className="btn-secondary inline-flex shrink-0 items-center gap-1.5 disabled:opacity-50"
            disabled={demoteState.kind === 'blocked' || dirty || demote.isPending}
            title={demoteState.kind === 'blocked' ? demoteState.reason : dirty ? '고친 내용을 저장한 뒤 되돌리세요.' : undefined}
            onClick={askDemote}
          >
            <Undo2 size={16} aria-hidden />
            {demote.isPending ? '되돌리는 중…' : '수집상품으로 되돌리기'}
          </button>
        )}
      </header>

      {demoteState.kind === 'demoted' && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          수집상품으로 되돌린 판매상품입니다 — 판매상품 목록과 몰 대량등록에서 빠져 있습니다. 수집상품 화면에서 이 상품을 골라
          [몰 대량등록]을 누르면 같은 코드({product.code})와 몰별 값 그대로 다시 올라옵니다.
        </p>
      )}

      <nav aria-label="편집 칸" className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1 bg-slate-50/90 px-1 py-2 backdrop-blur">
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-purple-300 hover:text-purple-700">
            {section.label}
          </a>
        ))}
      </nav>

      <Section id="basics" title="기본 정보">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="상품명" wide>
            <input value={basics.name} onChange={(event) => set('name', event.target.value)} className={inputClass} />
          </Field>
          <Field label="상품약어(송장 · 물류용)">
            <input value={basics.shortName ?? ''} onChange={(event) => set('shortName', event.target.value || null)} className={inputClass} />
          </Field>
          <Field label="자체상품코드">
            <input value={basics.ownCode ?? ''} onChange={(event) => set('ownCode', event.target.value || null)} className={inputClass} />
          </Field>
          <Field label="모델명(셀피아 상품코드)">
            <input value={basics.modelName ?? ''} onChange={(event) => set('modelName', event.target.value || null)} className={inputClass} />
          </Field>
          <Field label="모델 NO.">
            <input value={basics.modelNo ?? ''} onChange={(event) => set('modelNo', event.target.value || null)} className={inputClass} />
          </Field>
          <Field label="브랜드">
            <input value={basics.brand ?? ''} onChange={(event) => set('brand', event.target.value || null)} className={inputClass} />
          </Field>
          <Field label="제조사">
            <input value={basics.manufacturer ?? ''} onChange={(event) => set('manufacturer', event.target.value || null)} className={inputClass} />
          </Field>
          <Field label="원산지(제조국)">
            <input value={basics.originCountry ?? ''} onChange={(event) => set('originCountry', event.target.value || null)} className={inputClass} />
          </Field>
          <Field label="상태">
            <select value={basics.status} onChange={(event) => set('status', event.target.value as BasicsDraft['status'])} className={inputClass}>
              {SALES_PRODUCT_STATUSES.map((status) => <option key={status} value={status}>{SALES_PRODUCT_STATUS_LABEL[status]}</option>)}
            </select>
          </Field>
          <Field label="검색어(쉼표로)" wide>
            <input
              value={basics.keywords.join(', ')}
              onChange={(event) => set('keywords', event.target.value.split(',').map((word) => word.trim()).filter(Boolean))}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section id="price" title="가격 · 배송">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="원가">
            <MoneyInput value={basics.costPrice} onChange={(value) => set('costPrice', value)} />
          </Field>
          <Field label="판매가">
            <MoneyInput value={basics.salePrice} onChange={(value) => set('salePrice', value ?? 0)} />
          </Field>
          <Field label="TAG가(소비자가)">
            <MoneyInput value={basics.tagPrice} onChange={(value) => set('tagPrice', value)} />
          </Field>
          <Field label="세금">
            <select value={basics.taxType} onChange={(event) => set('taxType', event.target.value as BasicsDraft['taxType'])} className={inputClass}>
              {SALES_PRODUCT_TAX_TYPES.map((type) => <option key={type} value={type}>{TAX_TYPE_LABEL[type]}</option>)}
            </select>
          </Field>
          <Field label="배송비 구분">
            <select
              value={basics.deliveryFeeType ?? ''}
              onChange={(event) => set('deliveryFeeType', (event.target.value || null) as BasicsDraft['deliveryFeeType'])}
              className={inputClass}
            >
              <option value="">선택 안 함</option>
              {SALES_PRODUCT_DELIVERY_FEE_TYPES.map((type) => <option key={type} value={type}>{DELIVERY_FEE_TYPE_LABEL[type]}</option>)}
            </select>
          </Field>
          <Field label="배송비">
            <MoneyInput value={basics.deliveryFee} onChange={(value) => set('deliveryFee', value)} />
          </Field>
          <Field label="이익률">
            <p className="py-1.5 text-sm tabular-nums text-slate-700">
              {basics.costPrice && basics.salePrice
                ? `${Math.round(((basics.salePrice - basics.costPrice) / basics.salePrice) * 1000) / 10}%`
                : '—'}
            </p>
          </Field>
        </div>
      </Section>

      <Section id="options" title="옵션(단품)" description="줄마다 셀피아 상품을 이어 두면 재고 · 품절이 그 줄을 따라갑니다. 몰에 올라간 옵션은 지우지 않고 미사용으로 남깁니다.">
        <OptionTableEditor
          value={options}
          salePrice={basics.salePrice}
          skuSearchHint={(basics.modelName ?? basics.modelNo ?? '').split('-')[0] ?? ''}
          onChange={setOptions}
        />
        {problems.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-sm text-red-600">
            {problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        )}
      </Section>

      <Section id="images" title="이미지" description="첫 번째가 대표 이미지입니다.">
        <ImagesEditor value={basics.imageUrls} onChange={(value) => set('imageUrls', value)} />
      </Section>

      <Section id="detail" title="상세">
        <DetailEditor value={basics.detailHtml ?? ''} onChange={(value) => set('detailHtml', value || null)} />
      </Section>

      <Section id="notice" title="고시 · 인증">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="고시 분류코드(사방넷 속성분류)">
            <input value={basics.noticeCategory ?? ''} onChange={(event) => set('noticeCategory', event.target.value || null)} className={inputClass} />
          </Field>
          <Field label="인증">
            <p className="py-1.5 text-sm text-slate-700">
              {basics.certifications.length === 0
                ? '없음'
                : basics.certifications.map((cert) => `${cert.number}${cert.issuer ? ` (${cert.issuer})` : ''}`).join(', ')}
            </p>
          </Field>
          <Field label="고시 값(한 줄에 하나, 분류 순서대로)" wide>
            <textarea
              value={basics.noticeValues.join('\n')}
              onChange={(event) => set('noticeValues', event.target.value.split('\n'))}
              rows={6}
              className={cn(inputClass, 'font-mono text-xs')}
            />
          </Field>
        </div>
      </Section>

      <Section id="malls" title="몰별 값" description="몰마다 판매가 · 상품명을 따로 둡니다(사방넷 쇼핑몰별별도정보). 비워 두면 위 값이 그대로 갑니다.">
        <ChannelOverridesSection product={product} />
      </Section>

      <Section id="listings" title="몰에 올라간 상품">
        <ChannelListingsSection product={product} />
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {!dirty ? '바뀐 내용이 없습니다.' : problems.length > 0 ? '옵션표를 고친 뒤 저장할 수 있습니다.' : '저장하지 않은 내용이 있습니다.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={!dirty || save.isPending}
              onClick={() => {
                setBasics(basicsFromProduct(product));
                setOptions(optionsFromProduct(product));
              }}
            >
              되돌리기
            </button>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-40"
              disabled={!dirty || problems.length > 0 || save.isPending}
              onClick={() => save.mutate()}
            >
              <Save size={16} aria-hidden />
              {save.isPending ? '저장하는 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass = 'w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900';

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-16 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="section-title">{title}</h2>
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn('block', wide && 'md:col-span-2')}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function MoneyInput({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <input
      type="number"
      min={0}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? null : Math.max(0, Math.round(Number(event.target.value))))}
      className={cn(inputClass, 'text-right tabular-nums')}
    />
  );
}

function ImagesEditor({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const onSabangnet = value.filter((url) => /pic\.sabangnet\.co\.kr/i.test(url)).length;
  return (
    <div className="space-y-3">
      {onSabangnet > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} aria-hidden />
          이미지 {onSabangnet}장이 사방넷 이미지 서버에 있습니다. 사방넷을 끊으면 사라질 수 있어 우리 저장소로 옮겨야 합니다.
        </p>
      )}
      {value.length === 0 ? (
        <p className="text-sm text-slate-500">이미지가 없습니다.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {value.map((url, index) => (
            <li key={`${url}-${index}`} className="w-28">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className={cn('h-28 w-28 rounded-lg border object-cover', index === 0 ? 'border-purple-400' : 'border-slate-200')} />
              <div className="mt-1 flex items-center justify-between text-xs">
                {index === 0 ? (
                  <span className="font-semibold text-purple-700">대표</span>
                ) : (
                  <button type="button" className="text-slate-500 hover:text-purple-700" onClick={() => onChange([url, ...value.filter((_, at) => at !== index)])}>
                    대표로
                  </button>
                )}
                <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => onChange(value.filter((_, at) => at !== index))}>
                  빼기
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const url = draft.trim();
          if (!/^https?:\/\//i.test(url)) {
            toast.error('http 로 시작하는 이미지 주소를 넣으세요.');
            return;
          }
          onChange([...value, url]);
          setDraft('');
        }}
      >
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="이미지 주소(https://…)" className={cn(inputClass, 'max-w-lg')} />
        <button type="submit" className="btn-secondary btn-sm">더하기</button>
      </form>
    </div>
  );
}

function DetailEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <button type="button" className={cn('tab', !preview ? 'tab-active' : 'tab-inactive')} onClick={() => setPreview(false)}>HTML</button>
        <button type="button" className={cn('tab', preview ? 'tab-active' : 'tab-inactive')} onClick={() => setPreview(true)}>미리보기</button>
      </div>
      {preview ? (
        <div className="max-h-[480px] overflow-y-auto rounded-lg border border-slate-200 p-3">
          <iframe title="상세 미리보기" sandbox="" srcDoc={value} className="h-[440px] w-full" />
        </div>
      ) : (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={8} className={cn(inputClass, 'font-mono text-xs')} />
      )}
    </div>
  );
}

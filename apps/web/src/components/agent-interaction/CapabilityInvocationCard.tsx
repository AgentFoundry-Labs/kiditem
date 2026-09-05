'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldCheck, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys, type ConversationIdentity } from '@/lib/query-keys';
import { formatDateTime } from '@/lib/utils';
import { ConversationCardFrame } from './ConversationCardFrame';
import { ResourceReferenceCard } from './ResourceReferenceCard';
import type { CapabilityResultEnvelope } from '@kiditem/shared/agent-interaction';

type InvocationResult = Pick<CapabilityResultEnvelope,
  | 'summary'
  | 'resourceRefs'
>;

interface InvocationReceipt {
  capabilityKey: string;
  status: string;
  approvalStatus: string;
  approvalExpiresAt: string | null;
  result: InvocationResult | null;
}

/** Exact Invocation receipt and approval boundary; this component never starts work. */
export function CapabilityInvocationCard({
  invocationId,
  identity,
}: {
  invocationId: string;
  identity: ConversationIdentity;
}) {
  const queryClient = useQueryClient();
  const receipt = useQuery({
    queryKey: queryKeys.conversations.invocation(identity, invocationId),
    queryFn: () => apiClient.get<InvocationReceipt>(`/api/agent-os/invocations/${encodeURIComponent(invocationId)}`),
    refetchInterval: (query) => (
      query.state.status !== 'error' && shouldPollReceipt(query.state.data)
        ? 2_000
        : false
    ),
  });
  const decision = useMutation({
    mutationFn: (value: 'approved' | 'rejected') => apiClient.post<InvocationReceipt>(
      `/api/agent-os/invocations/${encodeURIComponent(invocationId)}/decision`,
      { decision: value },
    ),
    onSuccess: () => void queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.invocation(identity, invocationId),
    }),
  });

  if (receipt.isLoading) return <p role="status" className="text-sm text-muted-foreground">승인 정보를 불러오는 중입니다.</p>;
  if (receipt.isError) {
    return (
      <ConversationCardFrame
        ariaLabel="업무 실행 정보"
        icon={<ShieldCheck size={15} />}
        title="업무 실행 정보"
        tone="warning"
        actions={(
          <button
            type="button"
            onClick={() => { void receipt.refetch(); }}
            className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11"
          >
            다시 시도
          </button>
        )}
      >
        <p role="alert" className="text-sm text-foreground">업무 실행 정보를 불러올 수 없습니다.</p>
      </ConversationCardFrame>
    );
  }
  if (!receipt.data) return null;
  const currentReceipt: InvocationReceipt = decision.data
    ? { ...receipt.data, ...decision.data }
    : receipt.data;
  const approvalStatus = currentReceipt.approvalStatus;
  const pending = approvalStatus === 'pending';
  const presentation = approvalPresentation(currentReceipt.capabilityKey);

  return (
    <ConversationCardFrame
      ariaLabel="업무 실행 승인"
      icon={<ShieldCheck size={15} />}
      title="업무 실행 승인"
      tone="approval"
      actions={pending ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={decision.isPending}
            onClick={() => decision.mutate('approved')}
            className="inline-flex min-h-10 items-center gap-1 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11"
          >
            <Check aria-hidden="true" size={16} /> 승인
          </button>
          <button
            type="button"
            disabled={decision.isPending}
            onClick={() => decision.mutate('rejected')}
            className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11"
          >
            <X aria-hidden="true" size={16} /> 취소
          </button>
        </div>
      ) : undefined}
    >
      <dl className="mt-2 grid gap-1 text-sm">
        <ReceiptDetail label="대상" value={presentation.target} />
        <ReceiptDetail label="영향" value={presentation.effect} />
        {currentReceipt.approvalExpiresAt ? <ReceiptDetail label="승인 기한" value={formatExpiry(currentReceipt.approvalExpiresAt)} /> : null}
      </dl>
      {currentReceipt.result ? <InvocationResultEvidence result={currentReceipt.result} /> : null}
      <p role={decision.data ? 'status' : undefined} className="mt-2 text-sm text-muted-foreground">{approvalStatusSummary(currentReceipt)}</p>
      {decision.isError ? <p role="alert" className="mt-3 text-destructive">승인 결정을 저장하지 못했습니다.</p> : null}
    </ConversationCardFrame>
  );
}

function shouldPollReceipt(receipt: InvocationReceipt | undefined): boolean {
  return Boolean(
    receipt
    && receipt.status === 'pending'
    && (receipt.approvalStatus === 'approved' || receipt.approvalStatus === 'not_required')
    && receipt.result === null,
  );
}

function InvocationResultEvidence({ result }: { result: InvocationResult }) {
  return (
    <section aria-label="업무 결과" className="mt-3 space-y-2">
      <p className="text-sm leading-6 text-foreground">{result.summary}</p>
      {result.resourceRefs.map((reference) => (
        <ResourceReferenceCard key={`resource:${reference.kind}:${reference.id}`} reference={reference} />
      ))}
    </section>
  );
}

function ReceiptDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </div>
  );
}

function approvalStatusSummary(receipt: InvocationReceipt): string {
  switch (receipt.approvalStatus) {
    case 'pending': return '승인하면 이 업무가 진행됩니다.';
    case 'approved': return receipt.status === 'succeeded'
      ? '승인한 업무가 완료되었습니다.'
      : receipt.status === 'failed'
        ? '승인한 업무를 완료하지 못했습니다.'
        : '승인되어 업무를 처리하고 있습니다.';
    case 'rejected': return '요청을 취소했습니다. 이 결정으로 업무는 시작되지 않습니다.';
    case 'expired': return '승인 가능 시간이 만료되었습니다.';
    case 'not_required': return '현재 승인할 업무가 없습니다.';
    default: return '승인 상태를 확인할 수 없습니다.';
  }
}

function formatExpiry(expiry: string | null): string {
  if (!expiry) return '기한 정보 없음';
  return Number.isNaN(new Date(expiry).getTime()) ? '기한 정보를 확인할 수 없음' : formatDateTime(expiry);
}

function approvalPresentation(capabilityKey: string): { target: string; effect: string } {
  return APPROVAL_PRESENTATION_BY_CAPABILITY[capabilityKey] ?? {
    target: '요청한 업무',
    effect: '업무 변경을 실행합니다.',
  };
}

const APPROVAL_PRESENTATION_BY_CAPABILITY: Record<string, { target: string; effect: string }> = {
  'channels.register_confirmed_listing': { target: '판매 채널 등록', effect: '확인된 판매 채널 등록 정보를 저장합니다.' },
  'channels.submit_coupang_listing': { target: '쿠팡 판매 등록', effect: '상품 정보를 쿠팡에 등록합니다.' },
  'channels.submit_wing_thumbnail': { target: '상품 썸네일', effect: '상품 썸네일을 판매 채널에 등록합니다.' },
  'supply.create_purchase_order_draft': { target: '발주 초안', effect: '발주 초안을 생성합니다.' },
  'supply.submit_purchase_order': { target: '발주서', effect: '발주를 제출합니다.' },
};

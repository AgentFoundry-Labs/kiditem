"use client";

import { XCircle, AlertTriangle, Megaphone } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { RegisterCampaignPayload } from "../hooks/useAdOpsData";

interface RegisterCampaignModalProps {
  registerModal: RegisterCampaignPayload;
  registerError: string | null;
  registerMutation: UseMutationResult<unknown, Error, RegisterCampaignPayload>;
  onClose: () => void;
  onUpdate: (updated: RegisterCampaignPayload) => void;
  onSubmit: () => void;
}

export default function RegisterCampaignModal({
  registerModal,
  registerError,
  registerMutation,
  onClose,
  onUpdate,
  onSubmit,
}: RegisterCampaignModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-2xl p-6 space-y-4 overflow-y-auto max-h-[90vh]"
        style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-xl)", border: "1px solid var(--border-subtle)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black text-white" style={{ background: registerModal.color }}>{registerModal.grade}</span>
            <span className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>광고 등록</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--surface-sunken)]"><XCircle size={16} style={{ color: "var(--text-tertiary)" }} /></button>
        </div>

        {/* 중복 캠페인 경고 */}
        {registerError && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12px]" style={{ background: "#FEF3C7", border: "1px solid #F59E0B", color: "#92400E" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "#F59E0B" }} />
            <span>{registerError}</span>
          </div>
        )}

        {/* 캠페인명 / 그룹명 */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "캠페인 이름", key: "campaignName" as const },
            { label: "광고 그룹 이름", key: "adGroupName" as const },
          ].map(({ label, key }) => (
            <div key={key}>
              <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</div>
              <input
                className="w-full px-2.5 py-1.5 rounded-lg text-[12px] font-semibold"
                style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                value={registerModal[key]}
                onChange={e => onUpdate({ ...registerModal, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        {/* 예산 / 운영방식 / 입찰가 */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "일예산 (원)", key: "dailyBudget" as const, type: "number" },
            { label: "스마트타겟팅 입찰가 (원)", key: "smartTargetingBid" as const, type: "number" },
            { label: "비검색 입찰가 (원)", key: "nonSearchBid" as const, type: "number" },
            { label: "목표 ROAS (%)", key: "targetRoas" as const, type: "number" },
          ].map(({ label, key }) => (
            <div key={key}>
              <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</div>
              <input
                type="number"
                className="w-full px-2.5 py-1.5 rounded-lg text-[12px] font-semibold tabular-nums"
                style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                value={registerModal[key]}
                onChange={e => onUpdate({ ...registerModal, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>

        {/* 운영 방식 */}
        <div>
          <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-tertiary)" }}>광고 운영 방식</div>
          <div className="flex gap-1.5">
            {(["직접입력", "자동운영_매출최적화", "자동운영_매출스타트"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => onUpdate({ ...registerModal, operationMode: mode })}
                className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                style={registerModal.operationMode === mode
                  ? { background: registerModal.color, color: "#fff" }
                  : { background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }
                }
              >{mode.replace("자동운영_", "자동:")}</button>
            ))}
          </div>
        </div>

        {/* 상품 목록 */}
        <div>
          <div className="text-[10px] font-semibold mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            광고 상품 ({registerModal.products.length}개)
          </div>
          <div className="rounded-lg overflow-hidden max-h-32 overflow-y-auto" style={{ border: "1px solid var(--border-subtle)" }}>
            {registerModal.products.slice(0, 10).map((p, i) => (
              <div key={i} className="flex items-center justify-between px-2.5 py-1.5" style={{ borderBottom: i < registerModal.products.length - 1 ? "1px solid var(--border-subtle)" : "none", background: i % 2 === 0 ? "var(--surface-sunken)" : "var(--card-bg)" }}>
                <span className="text-[11px] truncate" style={{ color: "var(--text-primary)" }}>{p.productName}</span>
              </div>
            ))}
            {registerModal.products.length > 10 && (
              <div className="px-2.5 py-1.5 text-center text-[10px]" style={{ color: "var(--text-tertiary)" }}>+{registerModal.products.length - 10}개 더</div>
            )}
          </div>
        </div>

        {/* 키워드 */}
        {registerModal.keywords.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold mb-1.5" style={{ color: "var(--text-tertiary)" }}>
              키워드 ({registerModal.keywords.length}개)
            </div>
            <div className="flex flex-wrap gap-1">
              {registerModal.keywords.map((kw, i) => (
                <span key={i} className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${registerModal.color}12`, color: registerModal.color, border: `1px solid ${registerModal.color}20` }}>
                  {kw.keyword} <span className="opacity-60">{kw.bidPrice.toLocaleString()}원</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 확인 버튼 */}
        <button
          disabled={registerMutation.isPending}
          onClick={onSubmit}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
          style={{ background: registerMutation.isPending ? "var(--text-quaternary)" : registerModal.color }}
        >
          <Megaphone size={14} />
          {registerMutation.isPending ? "등록 중..." : "광고 등록 실행"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { AlertTriangle } from "lucide-react";

export default function AdOpsPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-6 py-16">
      <section
        className="w-full rounded-3xl border p-8 text-center"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--warning-soft)] text-[var(--warning)]">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          광고 전략 AI는 잠시 비활성화되었습니다
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
          상품 데이터와 주문/재고 흐름을 먼저 안정화하기 위해 광고 운영 페이지를 임시로
          격리했습니다. 구현은 보존되어 있으며, ad-ops 재배선 계획이 정리되면 다시
          활성화됩니다.
        </p>
        <div className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3 text-xs text-[var(--text-tertiary)]">
          현재 상태: route placeholder 활성화, 기존 ad-ops 구현 파일은 frontend build
          범위에서 제외
        </div>
      </section>
    </div>
  );
}

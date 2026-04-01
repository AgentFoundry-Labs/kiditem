"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from "@/components/ui/PageSkeleton";
import CreateCSModal from "./components/CreateCSModal";
import { CSHeader } from "./components/CSHeader";
import { CSSummaryCards } from "./components/CSSummaryCards";
import { CSFilterTabs } from "./components/CSFilterTabs";
import { CSTable } from "./components/CSTable";

interface CSRecord {
  id: string;
  orderId: string | null;
  productId: string | null;
  csType: string;
  csStatus: string;
  priority: string;
  assignee: string | null;
  content: string;
  resolution: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface CSSummary {
  total: number;
  접수: number;
  처리중: number;
  완료: number;
}

export default function CSManagementPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);

  const { data: csData, isLoading: loading, error: queryError } = useQuery({
    queryKey: queryKeys.cs.list({ csStatus: filter }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("csStatus", filter);
      return apiClient.get<{ items: CSRecord[]; summary: CSSummary }>(`/api/cs?${params}`);
    },
  });

  const records = csData?.items ?? [];
  const summary = csData?.summary ?? { total: 0, 접수: 0, 처리중: 0, 완료: 0 };
  const error = queryError
    ? isApiError(queryError)
      ? queryError.detail
      : "CS 데이터를 불러오는데 실패했습니다."
    : null;

  const createMutation = useMutation({
    mutationFn: (form: {
      csType: string;
      content: string;
      priority: string;
      assignee: string;
      orderId: string;
    }) => apiClient.post('/api/cs', {
      csType: form.csType,
      content: form.content,
      priority: form.priority,
      assignee: form.assignee || null,
      orderId: form.orderId || null,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cs.all }),
  });

  if (loading) return <PageSkeleton variant="table" />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.cs.all })}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const statusTabs = [
    { key: "all", label: `전체 (${summary.total})` },
    { key: "접수", label: `접수 (${summary.접수})` },
    { key: "처리중", label: `처리중 (${summary.처리중})` },
    { key: "완료", label: `완료 (${summary.완료})` },
  ];

  return (
    <div className="space-y-6">
      <CSHeader
        summary={summary}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: queryKeys.cs.all })}
        onRegister={() => setShowModal(true)}
      />
      <CSSummaryCards summary={summary} />
      <CSFilterTabs statusTabs={statusTabs} filter={filter} onChange={setFilter} />
      <CSTable records={records} onRegisterClick={() => setShowModal(true)} />
      {showModal && (
        <CreateCSModal
          onClose={() => setShowModal(false)}
          onCreated={async (form) => {
            await createMutation.mutateAsync(form);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

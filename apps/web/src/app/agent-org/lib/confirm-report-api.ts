import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

/** 사장님 컨펌 보고(텔레그램)의 연결 상태와 최신 최종 후보의 결정 수. */
export const ConfirmReportStatusSchema = z.object({
  channel: z.literal('telegram'),
  configured: z.boolean(),
  chatConfigured: z.boolean(),
  listening: z.boolean(),
  botUsername: z.string().nullable(),
  setupChatId: z.string().nullable(),
  lastReport: z
    .object({ sentAt: z.string(), runId: z.string(), itemCount: z.number().int().nonnegative() })
    .nullable(),
  candidates: z
    .object({
      runId: z.string(),
      generatedAt: z.string(),
      total: z.number().int().nonnegative(),
      pending: z.number().int().nonnegative(),
      approved: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
    })
    .nullable(),
});

export type ConfirmReportStatus = z.infer<typeof ConfirmReportStatusSchema>;

export const ConfirmReportSendResultSchema = z.object({
  runId: z.string(),
  sentAt: z.string(),
  reported: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  messages: z.number().int().nonnegative(),
});

export type ConfirmReportSendResult = z.infer<typeof ConfirmReportSendResultSchema>;

export const confirmReportApi = {
  status: () => apiClient.getParsed('/api/sourcing/workspace/confirm-report/status', ConfirmReportStatusSchema),
  /** 실제로 텔레그램 메시지를 보낸다. 사람이 버튼을 눌렀을 때만 부른다. */
  async sendTelegram(): Promise<ConfirmReportSendResult> {
    const raw = await apiClient.post<unknown>('/api/sourcing/workspace/confirm-report/telegram', undefined, {
      timeoutMs: 60_000,
    });
    return ConfirmReportSendResultSchema.parse(raw);
  },
};

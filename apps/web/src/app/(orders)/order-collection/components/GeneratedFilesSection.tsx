import { Download, Eye, Loader2, Send } from 'lucide-react';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { countLabel, type ConversionHistoryItem } from '../lib/order-collection-page-model';

interface GeneratedFilesSectionProps {
  groups: Array<{ key: string; label: string; items: ConversionHistoryItem[] }>;
  sellpiaSendingId: string | null;
  onSendToSellpia: (item: ConversionHistoryItem) => void;
  onPreview: (id: string) => void;
  onDownload: (item: ConversionHistoryItem) => void;
}

export function GeneratedFilesSection({
  groups,
  sellpiaSendingId,
  onSendToSellpia,
  onPreview,
  onDownload,
}: GeneratedFilesSectionProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="text-sm font-semibold text-slate-900">생성 파일</div>
      </div>
      {groups.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">생성된 파일이 없습니다.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center justify-between bg-slate-50 px-5 py-3">
                <div className="text-xs font-semibold text-slate-600">{group.label}</div>
                <div className="text-xs tabular-nums text-slate-400">{formatNumber(group.items.length)}개</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">몰/원본</th>
                      <th className="px-4 py-3 text-left font-medium">파일명</th>
                      <th className="px-4 py-3 text-right font-medium">상품</th>
                      <th className="px-4 py-3 text-right font-medium">출력</th>
                      <th className="px-4 py-3 text-left font-medium">생성시각</th>
                      <th className="px-4 py-3 text-right font-medium">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="max-w-[260px] truncate px-4 py-3 text-slate-700">{item.sourceName}</td>
                        <td className="max-w-[320px] truncate px-4 py-3 font-medium text-slate-900">
                          {item.fileName}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {countLabel(item.productRows)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {countLabel(item.outputRows)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDateTime(item.convertedAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => onSendToSellpia(item)}
                              disabled={sellpiaSendingId === item.id}
                              className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {sellpiaSendingId === item.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Send size={13} />
                              )}
                              셀피아 전송
                            </button>
                            <button
                              type="button"
                              onClick={() => onPreview(item.id)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Eye size={13} />
                              미리보기
                            </button>
                            <button
                              type="button"
                              onClick={() => onDownload(item)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Download size={13} />
                              다운로드
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

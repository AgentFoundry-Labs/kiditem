import { Clock, Package } from 'lucide-react';

interface ScanLog {
  barcode: string;
  productName: string;
  timestamp: string;
  success: boolean;
  message: string;
}

interface Props {
  logs: ScanLog[];
}

export default function ScanLogTable({ logs }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 rounded-t-xl">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          회수 처리 로그
        </h3>
      </div>
      {logs.length === 0 ? (
        <div className="empty-state">
          <Package size={48} className="mx-auto mb-3 opacity-30" />
          <p>회수 기록이 없습니다</p>
          <p className="text-xs mt-1">
            바코드를 스캔하여 반품을 회수하세요
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <th className="px-4 py-3">시각</th>
                <th className="px-4 py-3">바코드</th>
                <th className="px-4 py-3">상품</th>
                <th className="px-4 py-3">결과</th>
                <th className="px-4 py-3">메시지</th>
              </tr>
            </thead>
            <tbody >
              {logs.map((log, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <Clock size={10} className="inline mr-1" />
                    {log.timestamp}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">
                    {log.barcode}
                  </td>
                  <td className="px-4 py-3 text-sm">{log.productName}</td>
                  <td className="px-4 py-3">
                    {log.success ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        성공
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        실패
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {log.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

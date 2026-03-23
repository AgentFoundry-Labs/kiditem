'use client';

import { cn } from '@/lib/utils';

interface StaffData {
  name: string;
  role: string;
  totalMinutes: number;
  automatedMinutes: number;
  tasks: { name: string; total: number; automated: number }[];
}

const staffData: StaffData[] = [
  {
    name: '김지현',
    role: '과장 (경리/CS)',
    totalMinutes: 540,
    automatedMinutes: 350,
    tasks: [
      { name: '세금계산서 발행', total: 60, automated: 54 },
      { name: '은행장부 기재', total: 45, automated: 43 },
      { name: '자금일보 작성', total: 30, automated: 29 },
      { name: '주문서 수집/등록', total: 90, automated: 63 },
      { name: '외상매출 장부', total: 60, automated: 48 },
      { name: '입금매칭', total: 45, automated: 36 },
      { name: '기타 경리업무', total: 210, automated: 77 },
    ],
  },
  {
    name: '이나연',
    role: '대리 (CS/출고)',
    totalMinutes: 540,
    automatedMinutes: 280,
    tasks: [
      { name: '주문수집/송장출력', total: 120, automated: 96 },
      { name: '운송장번호 전송', total: 45, automated: 36 },
      { name: '재고이관 처리', total: 60, automated: 42 },
      { name: '게시판 CS답변', total: 60, automated: 36 },
      { name: '반품/교환 처리', total: 75, automated: 22 },
      { name: '신상품 등록', total: 60, automated: 30 },
      { name: '기타', total: 120, automated: 18 },
    ],
  },
  {
    name: '김성숙',
    role: '과장 (온라인몰)',
    totalMinutes: 540,
    automatedMinutes: 270,
    tasks: [
      { name: '쿠팡로켓 발주/출고', total: 120, automated: 72 },
      { name: '보고서 작성', total: 90, automated: 77 },
      { name: '신상품 등록/관리', total: 90, automated: 45 },
      { name: '기획전 제안', total: 60, automated: 42 },
      { name: '이미지/동영상', total: 120, automated: 16 },
      { name: '일매출 작성', total: 30, automated: 29 },
      { name: '기타', total: 30, automated: 0 },
    ],
  },
  {
    name: '김택준',
    role: '차장 (마케팅)',
    totalMinutes: 540,
    automatedMinutes: 215,
    tasks: [
      { name: '상품페이지 제작', total: 180, automated: 72 },
      { name: 'SNS 홍보', total: 60, automated: 36 },
      { name: '쿠팡 위너 모니터링', total: 60, automated: 42 },
      { name: '행사 제안/관리', total: 90, automated: 27 },
      { name: '순익/보고서', total: 60, automated: 51 },
      { name: '기타', total: 90, automated: 0 },
    ],
  },
];

export default function StaffAutomation() {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">직원별 자동화 현황</h2>
        <span className="text-[10px] text-gray-600">일일 업무시간 기준</span>
      </div>
      <div className="space-y-4">
        {staffData.map((staff) => {
          const pct = Math.round((staff.automatedMinutes / staff.totalMinutes) * 100);
          const savedHours = (staff.automatedMinutes / 60).toFixed(1);

          return (
            <div key={staff.name} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-300">{staff.name}</span>
                  <span className="text-[10px] text-gray-600">{staff.role}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-600">{savedHours}h 절감</span>
                  <span className={cn(
                    'text-xs font-bold',
                    pct >= 60 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-gray-400'
                  )}>
                    {pct}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-[#1a1d26] rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    pct >= 60
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                      : pct >= 40
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                      : 'bg-gradient-to-r from-gray-500 to-gray-400'
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* Task breakdown - hidden by default, shown on hover */}
              <div className="max-h-0 overflow-hidden group-hover:max-h-40 transition-all duration-300">
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {staff.tasks.map((task) => {
                    const taskPct = Math.round((task.automated / task.total) * 100);
                    return (
                      <div key={task.name} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-gray-600 truncate">{task.name}</p>
                        </div>
                        <div className="w-12 h-1 bg-[#1a1d26] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500/50 rounded-full"
                            style={{ width: `${taskPct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-700 w-7 text-right">{taskPct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

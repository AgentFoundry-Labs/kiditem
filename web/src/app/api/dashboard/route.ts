import { NextResponse } from 'next/server';

export async function GET() {
  // Dashboard aggregated stats
  const dashboard = {
    totalWorkflows: 7,
    activeWorkflows: 6,
    todayExecutions: 206,
    todayErrors: 3,
    totalSavedMinutes: 595,
    monthlySavedHours: Math.round(595 * 22 / 60),
    systemStatus: 'healthy',
    lastUpdated: new Date().toISOString(),
    
    moduleSummary: [
      { id: 'order', name: '주문관리', active: true, executions: 48, errors: 1, savedMin: 145 },
      { id: 'accounting', name: '회계/경리', active: true, executions: 23, errors: 0, savedMin: 180 },
      { id: 'inventory', name: '재고관리', active: true, executions: 96, errors: 2, savedMin: 60 },
      { id: 'cs', name: 'CS관리', active: true, executions: 34, errors: 0, savedMin: 90 },
      { id: 'report', name: '보고서', active: true, executions: 5, errors: 0, savedMin: 120 },
      { id: 'product', name: '상품관리', active: false, executions: 0, errors: 0, savedMin: 0 },
      { id: 'marketing', name: '마케팅', active: false, executions: 0, errors: 0, savedMin: 0 },
    ],

    staffAutomation: [
      { name: '김지현', role: '과장', automationPct: 65, savedHours: 5.8 },
      { name: '이나연', role: '대리', automationPct: 52, savedHours: 4.7 },
      { name: '김성숙', role: '과장', automationPct: 50, savedHours: 4.5 },
      { name: '김택준', role: '차장', automationPct: 40, savedHours: 3.6 },
    ],
  };

  return NextResponse.json({ success: true, data: dashboard });
}

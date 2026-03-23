'use client';

import StatsCards from '@/domains/dashboard/components/StatsCards';
import ModuleGrid from '@/domains/dashboard/components/ModuleGrid';
import ExecutionTimeline from '@/domains/dashboard/components/ExecutionTimeline';
import StaffAutomation from '@/domains/dashboard/components/StaffAutomation';

export default function DashboardPage() {
  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          키드아이템 업무 자동화 시스템 통합 현황
        </p>
      </div>

      {/* Stats */}
      <StatsCards />

      {/* Module Grid */}
      <ModuleGrid />

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExecutionTimeline />
        <StaffAutomation />
      </div>
    </div>
  );
}

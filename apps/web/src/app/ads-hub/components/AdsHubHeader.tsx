'use client';

import { Megaphone, RefreshCw } from 'lucide-react';

interface Props {
  activeTab: 'overview' | 'strategy';
  onTabChange: (tab: 'overview' | 'strategy') => void;
  onRefresh: () => void;
}

export default function AdsHubHeader({ activeTab, onTabChange, onRefresh }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Megaphone size={20} className="text-blue-500" />
        <h1 className="text-lg font-bold">통합 광고 대시보드</h1>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => onTabChange("overview")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === "overview"
                ? "bg-white shadow text-gray-900 font-medium"
                : "text-gray-500"
            }`}
          >
            광고 현황
          </button>
          <button
            onClick={() => onTabChange("strategy")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === "strategy"
                ? "bg-white shadow text-gray-900 font-medium"
                : "text-gray-500"
            }`}
          >
            전략 &amp; 분류
          </button>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs transition-colors"
        >
          <RefreshCw size={12} /> 새로고침
        </button>
      </div>
    </div>
  );
}

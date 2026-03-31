'use client';

import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_TABS = [
  { label: '에이전트', href: '/agents' },
  { label: '활동', href: '/agents/activity' },
  { label: '스킬', href: '/agents/skills' },
  { label: '비용', href: '/agents/costs' },
  { label: '조직도', href: '/agents/org' },
];

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div>
      <div className="px-8 border-b border-gray-200">
        <div className="flex gap-0 max-w-5xl">
          {NAV_TABS.map((tab) => {
            const isActive =
              tab.href === '/agents'
                ? pathname === '/agents'
                : pathname.startsWith(tab.href);
            return (
              <button
                key={tab.href}
                className={cn(
                  'px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-gray-900 text-gray-900 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                )}
                onClick={() => router.push(tab.href)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}

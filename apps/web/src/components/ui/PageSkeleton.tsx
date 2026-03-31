import { cn } from '@/lib/utils';

function Bone({ className }: { className?: string }) {
  return <div className={cn('bg-gray-100 rounded', className)} />;
}

interface Props {
  variant?: 'table' | 'cards' | 'dashboard' | 'list' | 'detail';
  className?: string;
}

export default function PageSkeleton({ variant = 'table', className }: Props) {
  return (
    <div className={cn('animate-pulse', className)}>
      {variant === 'table' && <TableSkeleton />}
      {variant === 'cards' && <CardsSkeleton />}
      {variant === 'dashboard' && <DashboardSkeleton />}
      {variant === 'list' && <ListSkeleton />}
      {variant === 'detail' && <DetailSkeleton />}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Bone className="h-7 w-48" />
        <Bone className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-8 w-16 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Bone key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Bone className="h-7 w-40" />
        <Bone className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Bone key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-9 w-20 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Bone className="h-48 rounded-lg" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Bone key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-9 w-16 rounded-lg" />
        ))}
      </div>
      <Bone className="h-3 w-20" />
      <div className="border border-gray-100 rounded-lg overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
            <Bone className="w-2.5 h-2.5 rounded-full shrink-0" />
            <Bone className="w-8 h-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-4 w-36" />
              <Bone className="h-3 w-48" />
            </div>
            <Bone className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Bone className="h-4 w-24" />
      <div className="flex items-start gap-4">
        <Bone className="w-12 h-12 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Bone className="h-6 w-48" />
          <Bone className="h-4 w-72" />
        </div>
      </div>
      <div className="flex gap-4 border-b border-gray-100 pb-3">
        {[1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-5 w-16" />
        ))}
      </div>
      <Bone className="h-64 rounded-lg" />
    </div>
  );
}

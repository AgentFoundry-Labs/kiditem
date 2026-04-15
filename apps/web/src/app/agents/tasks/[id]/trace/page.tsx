'use client';

import { use } from 'react';
import { TraceView } from './TraceView';

interface TracePageProps {
  params: Promise<{ id: string }>;
}

export default function TaskTracePage({ params }: TracePageProps) {
  const { id: taskId } = use(params);
  return <TraceView taskId={taskId} />;
}

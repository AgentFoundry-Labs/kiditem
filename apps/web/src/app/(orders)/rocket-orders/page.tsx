'use client';

import { RocketOrdersWorkspace } from './components/RocketOrdersWorkspace';
import { RocketConfirmPanel } from './components/RocketConfirmPanel';

export default function RocketOrdersPage() {
  return (
    <RocketOrdersWorkspace
      decisionWorkspace={<RocketConfirmPanel onSaved={() => {}} />}
    />
  );
}

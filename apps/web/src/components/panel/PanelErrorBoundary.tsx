'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('[Panel] crashed', error);
    // 선택: 서버에 report (POST /api/panel/client-error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-4 text-sm text-slate-500">
          알림 패널을 불러올 수 없어요. 새로고침을 시도해주세요.
        </div>
      );
    }
    return this.props.children;
  }
}

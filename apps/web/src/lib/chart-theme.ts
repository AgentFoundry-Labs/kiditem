'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export type ChartPalette = {
  grid: string;
  axis: string;
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  series: string[];
  primary: string;
  success: string;
  warning: string;
  danger: string;
  muted: string;
};

export const LIGHT_PALETTE: ChartPalette = {
  grid: '#e2e8f0',
  axis: '#94a3b8',
  tick: '#64748b',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e2e8f0',
  tooltipText: '#0f172a',
  series: ['#7c3aed', '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#e879f9', '#0ea5e9', '#a855f7'],
  primary: '#7c3aed',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  muted: '#94a3b8',
};

export const DARK_PALETTE: ChartPalette = {
  grid: '#1f2937',
  axis: '#475569',
  tick: '#94a3b8',
  tooltipBg: '#1f2937',
  tooltipBorder: '#374151',
  tooltipText: '#f1f5f9',
  series: ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#f0abfc', '#38bdf8', '#c084fc'],
  primary: '#a78bfa',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  muted: '#64748b',
};

export function useChartTheme(): ChartPalette {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return LIGHT_PALETTE;
  return resolvedTheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
}

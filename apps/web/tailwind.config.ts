import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    fontFamily: {
      sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'sans-serif'],
      mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
    },
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--surface-raised)",
          foreground: "var(--foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-contrast)",
          soft: "var(--primary-soft)",
        },
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--primary)",
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--primary-contrast)",
        },
        muted: {
          DEFAULT: "var(--surface-sunken)",
          foreground: "var(--text-tertiary)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "var(--primary-contrast)",
        },
        "conversation-user": {
          DEFAULT: "var(--conversation-user-bg)",
          foreground: "var(--conversation-user-foreground)",
        },
        evidence: {
          surface: "var(--evidence-surface)",
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;

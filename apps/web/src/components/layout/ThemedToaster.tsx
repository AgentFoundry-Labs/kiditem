'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Toaster } from 'sonner';

export default function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const theme = mounted ? ((resolvedTheme === 'dark' ? 'dark' : 'light') as 'dark' | 'light') : 'light';

  return <Toaster richColors position="top-right" theme={theme} />;
}

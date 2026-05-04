import { apiClient } from '@/lib/api-client';

export async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = url.startsWith('/') ? await apiClient.fetchRaw(url) : await fetch(url);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

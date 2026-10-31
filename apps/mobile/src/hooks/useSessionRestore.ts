// apps/mobile/src/hooks/useSessionRestore.ts
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function useSessionRestore() {
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);
}

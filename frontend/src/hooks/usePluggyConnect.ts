'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiPost } from '@/lib/pluggy-api';

declare global {
  interface Window {
    PluggyConnect: new (options: PluggyConnectOptions) => PluggyConnectInstance;
  }
}

interface PluggyItemData {
  item: { id: string };
}

interface PluggyConnectOptions {
  connectToken: string;
  includeSandbox?: boolean;
  onSuccess: (itemData: PluggyItemData) => void;
  onError: (error: unknown) => void;
  onClose: () => void;
}

interface PluggyConnectInstance {
  init: () => void;
}

interface ConnectTokenResponse {
  accessToken: string;
}

interface UsePluggyConnectOptions {
  onSuccess?: (itemData: PluggyItemData) => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
}

interface UsePluggyConnectReturn {
  openWidget: () => Promise<void>;
  loading: boolean;
}

const PLUGGY_CDN = 'https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js';

function waitForScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window.PluggyConnect === 'function') {
      resolve();
      return;
    }
    const script = document.querySelector<HTMLScriptElement>(`script[src="${PLUGGY_CDN}"]`);
    if (!script) {
      reject(new Error('[PluggyConnect] script element not found'));
      return;
    }
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('[PluggyConnect] CDN script failed to load')), { once: true });
  });
}

export function usePluggyConnect(options: UsePluggyConnectOptions = {}): UsePluggyConnectReturn {
  const [loading, setLoading] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (document.querySelector(`script[src="${PLUGGY_CDN}"]`)) return;

    const script = document.createElement('script');
    script.src = PLUGGY_CDN;
    script.async = true;
    script.onerror = () => console.error('[PluggyConnect] failed to load CDN script');
    document.body.appendChild(script);
  }, []);

  const openWidget = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await waitForScript();

      if (typeof window.PluggyConnect !== 'function') {
        const pluggyKeys = Object.keys(window).filter(k => k.toLowerCase().includes('pluggy'));
        console.error('[PluggyConnect] window.PluggyConnect unavailable after load. Related globals:', pluggyKeys);
        throw new Error('Pluggy Connect widget não disponível');
      }

      const { accessToken } = await apiPost<ConnectTokenResponse>('/pluggy/connect-token');

      const pluggyConnect = new window.PluggyConnect({
        connectToken: accessToken,
        includeSandbox: true,
        onSuccess: (itemData: PluggyItemData) => {
          apiPost('/pluggy/items', { itemId: itemData.item.id })
            .then(() => optionsRef.current.onSuccess?.(itemData))
            .catch((err) => console.error('[PluggyConnect] failed to register item:', err));
        },
        onError: (error: unknown) => {
          optionsRef.current.onError?.(error);
        },
        onClose: () => {
          optionsRef.current.onClose?.();
        },
      });

      pluggyConnect.init();
    } catch (err) {
      console.error('[PluggyConnect] error:', err);
      optionsRef.current.onError?.(err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { openWidget, loading };
}

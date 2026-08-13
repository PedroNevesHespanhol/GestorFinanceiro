'use client';

import { usePluggyConnect } from '@/hooks/usePluggyConnect';
import { LoadingSpinner } from './LoadingSpinner';

interface PluggyConnectButtonProps {
  onSuccess?: () => void;
  label?: string;
}

export function PluggyConnectButton({ onSuccess, label = 'Conectar banco' }: PluggyConnectButtonProps) {
  const { openWidget, loading } = usePluggyConnect({
    onSuccess: () => {
      onSuccess?.();
    },
    onError: (error) => {
      console.error('Pluggy Connect error:', error);
    },
    onClose: () => {
      // widget closed by user
    },
  });

  return (
    <button
      onClick={() => void openWidget()}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <>
          <LoadingSpinner size="sm" />
          Carregando...
        </>
      ) : (
        <>
          <span>🔗</span>
          {label}
        </>
      )}
    </button>
  );
}

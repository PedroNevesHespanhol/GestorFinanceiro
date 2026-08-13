'use client';

import { useState } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { AccountsList } from '@/components/AccountsList';
import { PluggyConnectButton } from '@/components/PluggyConnectButton';
import { apiPost } from '@/lib/pluggy-api';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function AccountsPage() {
  const { accounts, loading, error, refetch } = useAccounts();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      await apiPost('/sync');
      setSyncMessage('Sincronização iniciada com sucesso!');
      setTimeout(() => {
        refetch();
        setSyncMessage(null);
      }, 2000);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Contas</h1>
        <div className="flex gap-3">
          <button
            onClick={() => void handleSync()}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? <LoadingSpinner size="sm" /> : <span>🔄</span>}
            Sincronizar
          </button>
          <PluggyConnectButton onSuccess={refetch} label="Adicionar banco" />
        </div>
      </div>

      {syncMessage && (
        <div
          className={`rounded-lg p-3 text-sm ${
            syncMessage.startsWith('Erro')
              ? 'bg-red-50 text-red-700'
              : 'bg-green-50 text-green-700'
          }`}
        >
          {syncMessage}
        </div>
      )}

      <AccountsList accounts={accounts} loading={loading} error={error} />
    </div>
  );
}

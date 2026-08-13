'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { apiGet } from '@/lib/pluggy-api';
import { formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface SyncLog {
  id: string;
  pluggyItemId: string;
  status: 'SUCCESS' | 'ERROR' | 'RUNNING';
  transactionsSynced: number;
  syncedAt: string;
  errorMessage?: string;
}

interface WebhookConfig {
  url: string;
  enabled: boolean;
}

const SYNC_STATUS_CONFIG: Record<SyncLog['status'], { label: string; classes: string }> = {
  SUCCESS: { label: 'Sucesso', classes: 'bg-green-100 text-green-800' },
  ERROR: { label: 'Erro', classes: 'bg-red-100 text-red-800' },
  RUNNING: { label: 'Em andamento', classes: 'bg-yellow-100 text-yellow-800' },
};

const FALLBACK_SYNC_STATUS = { label: 'Desconhecido', classes: 'bg-gray-100 text-gray-600' };

export default function SettingsPage() {
  const { user } = useAuth();
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      setError(null);
      try {
        const [logsData, webhook] = await Promise.all([
          apiGet<{ logs: SyncLog[] }>('/sync/logs'),
          apiGet<WebhookConfig>('/settings/webhook').catch(() => null),
        ]);
        setSyncLogs(logsData.logs ?? []);
        setWebhookConfig(webhook);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar configurações');
      } finally {
        setLoading(false);
      }
    }

    void fetchSettings();
  }, []);

  async function copyUid() {
    if (user?.uid) {
      await navigator.clipboard.writeText(user.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>

      {/* User section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-700">Informações do Usuário</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">Email</p>
            <p className="mt-0.5 text-sm text-gray-900">{user?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">Nome</p>
            <p className="mt-0.5 text-sm text-gray-900">{user?.displayName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">Firebase UID</p>
            <div className="mt-0.5 flex items-center gap-2">
              <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-800">
                {user?.uid ?? '—'}
              </code>
              {user?.uid && (
                <button
                  onClick={() => void copyUid()}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      ) : (
        <>
          {/* Webhook section */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-700">Configuração de Webhook</h2>
            {webhookConfig ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">URL do Webhook</p>
                  <code className="mt-0.5 block rounded bg-gray-100 px-3 py-2 text-sm text-gray-800">
                    {webhookConfig.url}
                  </code>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Status</p>
                  <span
                    className={`mt-0.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      webhookConfig.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {webhookConfig.enabled ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Nenhum webhook configurado.</p>
            )}
          </div>

          {/* Sync logs section */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-700">Logs de Sincronização</h2>
            {syncLogs.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma sincronização registrada.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-500">
                        Item ID
                      </th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase text-gray-500">
                        Status
                      </th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase text-gray-500">
                        Transações
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-500">
                        Data
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {syncLogs.map((log) => {
                      const statusCfg = SYNC_STATUS_CONFIG[log.status] ?? FALLBACK_SYNC_STATUS;
                      return (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <code className="text-xs text-gray-600">{log.pluggyItemId}</code>
                            {log.errorMessage && (
                              <p className="text-xs text-red-500">{log.errorMessage}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.classes}`}
                            >
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center text-gray-600">
                            {log.transactionsSynced}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-gray-500">
                            {formatDate(log.syncedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { formatCurrency, formatDate } from '@/lib/utils';
import type { Account } from '@/hooks/useAccounts';
import { LoadingSpinner } from './LoadingSpinner';

interface AccountsListProps {
  accounts: Account[];
  loading: boolean;
  error: string | null;
}

const statusConfig: Record<string, { label: string; classes: string }> = {
  UPDATED: { label: 'Atualizado', classes: 'bg-green-100 text-green-800' },
  ERROR: { label: 'Erro', classes: 'bg-red-100 text-red-800' },
  LOGIN_ERROR: { label: 'Erro de login', classes: 'bg-red-100 text-red-800' },
  WAITING_USER_ACTION: { label: 'Ação necessária', classes: 'bg-yellow-100 text-yellow-800' },
  OUTDATED: { label: 'Desatualizado', classes: 'bg-orange-100 text-orange-800' },
  CREATING: { label: 'Criando…', classes: 'bg-blue-100 text-blue-800' },
  UPDATING: { label: 'Atualizando…', classes: 'bg-blue-100 text-blue-800' },
};

const fallbackStatus = { label: 'Desconhecido', classes: 'bg-gray-100 text-gray-600' };

export function AccountsList({ accounts, loading, error }: AccountsListProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
        Nenhuma conta encontrada. Conecte um banco para começar.
      </div>
    );
  }

  const bankAccounts = accounts.filter((a) => a.type === 'BANK');
  const creditAccounts = accounts.filter((a) => a.type === 'CREDIT');

  return (
    <div className="space-y-6">
      {bankAccounts.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-700">Contas Bancárias</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bankAccounts.map((account) => {
              const status = statusConfig[account.status] ?? fallbackStatus;
              return (
                <div
                  key={account.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{account.name}</p>
                      {account.institution && (
                        <p className="text-sm text-gray-500">{account.institution}</p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.classes}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(account.balance, account.currencyCode)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Saldo disponível</p>
                  {account.lastSyncedAt && (
                    <p className="mt-2 text-xs text-gray-400">
                      Última sync: {formatDate(account.lastSyncedAt)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {creditAccounts.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-700">Cartões de Crédito</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creditAccounts.map((account) => {
              const status = statusConfig[account.status] ?? fallbackStatus;
              return (
                <div
                  key={account.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{account.name}</p>
                      {account.institution && (
                        <p className="text-sm text-gray-500">{account.institution}</p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.classes}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-gray-500">Saldo utilizado</p>
                      <p className="text-xl font-bold text-red-600">
                        {formatCurrency(account.balance, account.currencyCode)}
                      </p>
                    </div>
                    {account.creditAvailableLimit !== undefined && (
                      <div>
                        <p className="text-sm text-gray-500">Limite disponível</p>
                        <p className="text-lg font-semibold text-green-600">
                          {formatCurrency(account.creditAvailableLimit, account.currencyCode)}
                        </p>
                      </div>
                    )}
                    {account.creditLimit !== undefined && (
                      <div>
                        <p className="text-sm text-gray-500">Limite total</p>
                        <p className="text-sm text-gray-700">
                          {formatCurrency(account.creditLimit, account.currencyCode)}
                        </p>
                      </div>
                    )}
                    {account.creditBillDueDate && (
                      <div className="border-t border-gray-100 pt-2">
                        <p className="text-sm text-gray-500">Vencimento da fatura</p>
                        <p className="font-medium text-orange-600">
                          {formatDate(account.creditBillDueDate)}
                        </p>
                      </div>
                    )}
                  </div>
                  {account.lastSyncedAt && (
                    <p className="mt-2 text-xs text-gray-400">
                      Última sync: {formatDate(account.lastSyncedAt)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

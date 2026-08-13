'use client';

import { useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { translateCategory } from '@/lib/categoryTranslations';
import type { Transaction, TransactionFilters } from '@/hooks/useTransactions';
import type { Account } from '@/hooks/useAccounts';
import { LoadingSpinner } from './LoadingSpinner';

const INSTALLMENT_RE = /\b\d{1,2}\s*\/\s*\d{1,2}\b/i;

function InstallmentBadge({ tx }: { tx: Transaction }) {
  const meta = tx.creditCardMetadata;
  if (!meta?.installmentNumber || !meta?.totalInstallments) return null;
  // Skip badge when description already shows installment info (e.g. Nubank "COMPRA 03/12")
  if (INSTALLMENT_RE.test(tx.description)) return null;
  return (
    <span className="ml-1.5 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 whitespace-nowrap">
      {meta.installmentNumber}/{meta.totalInstallments}
    </span>
  );
}

const PAGE_SIZE = 20;

interface TransactionTableProps {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  accounts: Account[];
}

export function TransactionTable({
  transactions,
  loading,
  error,
  filters,
  onFiltersChange,
  accounts,
}: TransactionTableProps) {
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(transactions.length / PAGE_SIZE);
  const paginatedTransactions = transactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const categories = Array.from(
    new Set(transactions.map((t) => t.category).filter(Boolean) as string[]),
  ).sort();

  function handleFilterChange(key: keyof TransactionFilters, value: string) {
    setPage(0);
    onFiltersChange({ ...filters, [key]: value || undefined });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-gray-500">Conta</label>
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            value={filters.accountId ?? ''}
            onChange={(e) => handleFilterChange('accountId', e.target.value)}
          >
            <option value="">Todas as contas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500">Categoria</label>
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            value={filters.category ?? ''}
            onChange={(e) => handleFilterChange('category', e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {translateCategory(cat)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500">Data inicial</label>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            value={filters.dateFrom ?? ''}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500">Data final</label>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            value={filters.dateTo ?? ''}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600">{error}</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nenhuma transação encontrada para os filtros selecionados.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Data
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Descrição
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Categoria
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Valor
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Tipo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {formatDate(tx.date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <span className="flex items-center gap-0">
                          <span>{tx.description}</span>
                          <InstallmentBadge tx={tx} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {translateCategory(tx.category)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${
                          tx.type === 'DEBIT' ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {tx.type === 'DEBIT' ? '-' : '+'}
                        {formatCurrency(Math.abs(tx.amount), tx.currencyCode)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            tx.type === 'DEBIT'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {tx.type === 'DEBIT' ? 'Débito' : 'Crédito'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                <p className="text-sm text-gray-500">
                  Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, transactions.length)} de{' '}
                  {transactions.length} transações
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

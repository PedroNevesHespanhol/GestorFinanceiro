'use client';

import { useAccounts } from '@/hooks/useAccounts';
import { useTransactions } from '@/hooks/useTransactions';
import { DashboardCharts } from '@/components/DashboardCharts';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { formatCurrency, formatDate, getLast6MonthsRange } from '@/lib/utils';

export default function DashboardPage() {
  const { accounts, loading: accountsLoading } = useAccounts();
  // 6 meses de dados: o gráfico "Receitas vs Despesas" precisa desse período;
  // o gráfico de categorias e o card de 30 dias filtram em memória.
  const { dateFrom, dateTo } = getLast6MonthsRange();
  const { transactions, loading: transactionsLoading } = useTransactions({
    dateFrom,
    dateTo,
  });

  const bankAccounts = accounts.filter((a) => a.type === 'BANK');
  const creditAccounts = accounts.filter((a) => a.type === 'CREDIT');

  const totalBalance = bankAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalCreditAvailable = creditAccounts.reduce(
    (sum, a) => sum + (a.creditAvailableLimit ?? 0),
    0,
  );

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const totalTransactions = transactions.filter(
    (tx) => new Date(tx.date) >= thirtyDaysAgo,
  ).length;

  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const isLoading = accountsLoading || transactionsLoading;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Saldo Total</p>
          {accountsLoading ? (
            <LoadingSpinner size="sm" className="mt-2" />
          ) : (
            <p className="mt-1 text-3xl font-bold text-gray-900">
              {formatCurrency(totalBalance)}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">{bankAccounts.length} conta(s) bancária(s)</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Limite Disponível</p>
          {accountsLoading ? (
            <LoadingSpinner size="sm" className="mt-2" />
          ) : (
            <p className="mt-1 text-3xl font-bold text-green-600">
              {formatCurrency(totalCreditAvailable)}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">{creditAccounts.length} cartão(ões) de crédito</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total de Transações</p>
          {transactionsLoading ? (
            <LoadingSpinner size="sm" className="mt-2" />
          ) : (
            <p className="mt-1 text-3xl font-bold text-blue-600">{totalTransactions}</p>
          )}
          <p className="mt-1 text-xs text-gray-400">Últimos 30 dias</p>
        </div>
      </div>

      {/* Charts */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <DashboardCharts transactions={transactions} />
      )}

      {/* Recent Transactions */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-700">Últimas Transações</h2>
        </div>
        {transactionsLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : recentTransactions.length === 0 ? (
          <p className="p-6 text-center text-gray-400">Nenhuma transação recente</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {recentTransactions.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                  <p className="text-xs text-gray-400">
                    {formatDate(tx.date)} {tx.category ? `• ${tx.category}` : ''}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    tx.type === 'DEBIT' ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {tx.type === 'DEBIT' ? '-' : '+'}
                  {formatCurrency(Math.abs(tx.amount), tx.currencyCode)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

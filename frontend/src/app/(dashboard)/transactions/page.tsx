'use client';

import { useTransactions } from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import { TransactionTable } from '@/components/TransactionTable';

export default function TransactionsPage() {
  const { transactions, loading, error, filters, setFilters } = useTransactions();
  const { accounts } = useAccounts();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Transações</h1>
      <TransactionTable
        transactions={transactions}
        loading={loading}
        error={error}
        filters={filters}
        onFiltersChange={setFilters}
        accounts={accounts}
      />
    </div>
  );
}

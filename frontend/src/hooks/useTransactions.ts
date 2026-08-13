'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/pluggy-api';

export interface CreditCardMetadata {
  installmentNumber?: number;
  totalInstallments?: number;
  totalAmount?: number;
}

export interface Transaction {
  id: string;
  accountId: string;
  pluggyTransactionId: string;
  date: string;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  category?: string;
  // Backend não envia currencyCode em transações; formatCurrency usa BRL como padrão
  currencyCode?: string;
  creditCardMetadata?: CreditCardMetadata | null;
}

export interface TransactionFilters {
  accountId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface UseTransactionsReturn {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  filters: TransactionFilters;
  setFilters: (filters: TransactionFilters) => void;
}

export function useTransactions(initialFilters: TransactionFilters = {}): UseTransactionsReturn {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<TransactionFilters>(initialFilters);

  const fetchTransactions = useCallback(async (currentFilters: TransactionFilters) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (currentFilters.accountId) params.set('accountId', currentFilters.accountId);
    if (currentFilters.category) params.set('category', currentFilters.category);
    if (currentFilters.dateFrom) params.set('dateFrom', currentFilters.dateFrom);
    if (currentFilters.dateTo) params.set('dateTo', currentFilters.dateTo);

    const query = params.toString();
    const path = query ? `/transactions?${query}` : '/transactions';

    try {
      const data = await apiGet<{ transactions: Transaction[] }>(path);
      setTransactions(data.transactions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar transações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions(filters);
  }, [filters, fetchTransactions]);

  const setFilters = useCallback((newFilters: TransactionFilters) => {
    setFiltersState(newFilters);
  }, []);

  return { transactions, loading, error, filters, setFilters };
}

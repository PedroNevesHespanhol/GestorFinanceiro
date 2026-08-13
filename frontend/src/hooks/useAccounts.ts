'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/pluggy-api';

export interface Account {
  id: string;
  pluggyItemId: string;
  pluggyAccountId: string;
  name: string;
  type: 'BANK' | 'CREDIT';
  balance: number;
  creditLimit?: number;
  creditAvailableLimit?: number;
  creditBillDueDate?: string;
  currencyCode: string;
  status: 'UPDATED' | 'ERROR' | 'WAITING_USER_ACTION';
  institution?: string;
  lastSyncedAt?: string;
}

interface UseAccountsReturn {
  accounts: Account[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAccounts(): UseAccountsReturn {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiGet<{ accounts: Account[] }>('/accounts')
      .then((data) => {
        if (!cancelled) {
          setAccounts(data.accounts);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar contas');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return { accounts, loading, error, refetch };
}

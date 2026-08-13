'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/pluggy-api';
import { formatMonthYear } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { MonthlySummaryTable, type MonthPlan } from '@/components/MonthlySummaryTable';
import { AnnualPlanningGrid, type ExpenseGridRow } from '@/components/AnnualPlanningGrid';

type View = 'grid' | 'summary';

// A janela é sempre os próximos 12 meses a partir do mês atual — meses passados
// nunca aparecem. `offset` desloca a janela para frente em blocos de 12 meses
// (ex.: offset=12 mostra o ano seguinte), nunca para trás do mês atual.
const WINDOW_SIZE = 12;

export default function PlanningPage() {
  const [offset, setOffset] = useState(0);
  const [months, setMonths] = useState<MonthPlan[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseGridRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('grid');

  const fetchPlan = useCallback(async (o: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ months: MonthPlan[]; expenseRows: ExpenseGridRow[]; offset: number }>(
        `/planning/annual?offset=${o}`
      );
      setMonths(data.months);
      setExpenseRows(data.expenseRows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar planejamento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlan(offset);
  }, [offset, fetchPlan]);

  const periodLabel = months.length > 0
    ? `${formatMonthYear(new Date(months[0].year, months[0].month - 1, 1))} – ${formatMonthYear(
        new Date(months[months.length - 1].year, months[months.length - 1].month - 1, 1)
      )}`
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planejamento Anual</h1>
          <p className="mt-1 text-sm text-gray-500">
            Próximos 12 meses a partir do mês atual — meses passados não são mais exibidos
          </p>
        </div>

        {/* Window navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOffset((o) => Math.max(0, o - WINDOW_SIZE))}
            disabled={offset === 0}
            className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹
          </button>
          <span className="min-w-[11rem] text-center text-sm font-semibold text-gray-900">
            {periodLabel || ' '}
          </span>
          <button
            onClick={() => setOffset((o) => o + WINDOW_SIZE)}
            className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-100"
          >
            ›
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
        <button
          onClick={() => setView('grid')}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            view === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Grade por gasto
        </button>
        <button
          onClick={() => setView('summary')}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            view === 'summary' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Resumo mensal
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      ) : view === 'grid' ? (
        <AnnualPlanningGrid rows={expenseRows} months={months} />
      ) : (
        <MonthlySummaryTable months={months} />
      )}
    </div>
  );
}

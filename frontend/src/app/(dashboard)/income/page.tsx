'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { apiGet, apiPost, apiPut } from '@/lib/pluggy-api';
import { formatCurrency } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface RecurringIncome {
  id: string;
  name: string;
  amount: number;
  frequency: 'MONTHLY' | 'WEEKLY' | 'YEARLY';
  category: string;
  active: boolean;
}

interface RecurringIncomeFormData {
  name: string;
  amount: number;
  frequency: 'MONTHLY' | 'WEEKLY' | 'YEARLY';
  category: string;
}

const FREQUENCY_LABELS: Record<RecurringIncome['frequency'], string> = {
  MONTHLY: 'Mensal',
  WEEKLY: 'Semanal',
  YEARLY: 'Anual',
};

const FREQUENCY_MONTHLY_FACTOR: Record<RecurringIncome['frequency'], number> = {
  MONTHLY: 1,
  WEEKLY: 52 / 12,
  YEARLY: 1 / 12,
};

export default function IncomePage() {
  const [incomes, setIncomes] = useState<RecurringIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RecurringIncomeFormData>();

  async function fetchIncomes() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ recurringIncome: RecurringIncome[] }>('/recurring-income');
      setIncomes(data.recurringIncome ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar receitas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchIncomes();
  }, []);

  async function onSubmit(data: RecurringIncomeFormData) {
    setSubmitting(true);
    try {
      await apiPost('/recurring-income', {
        ...data,
        amount: Number(data.amount),
      });
      reset();
      setShowForm(false);
      await fetchIncomes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar receita');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(income: RecurringIncome) {
    try {
      await apiPut(`/recurring-income/${income.id}`, { active: !income.active });
      await fetchIncomes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar receita');
    }
  }

  const activeIncomes = incomes.filter((i) => i.active);
  const monthlyTotal = activeIncomes.reduce(
    (sum, i) => sum + i.amount * FREQUENCY_MONTHLY_FACTOR[i.frequency],
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Receitas</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
        >
          {showForm ? 'Cancelar' : '+ Adicionar'}
        </button>
      </div>

      {/* Monthly total */}
      <div className="rounded-xl border border-green-100 bg-green-50 p-4">
        <p className="text-sm text-green-600">Total mensal estimado (receitas ativas)</p>
        <p className="text-2xl font-bold text-green-800">{formatCurrency(monthlyTotal)}</p>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 font-semibold text-gray-700">Nova Receita Recorrente</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                {...register('name', { required: 'Nome é obrigatório' })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                placeholder="Ex: Salário"
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                {...register('amount', { required: 'Valor é obrigatório', min: 0 })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                placeholder="0,00"
              />
              {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Frequência</label>
              <select
                {...register('frequency', { required: true })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              >
                <option value="MONTHLY">Mensal</option>
                <option value="WEEKLY">Semanal</option>
                <option value="YEARLY">Anual</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Categoria</label>
              <input
                {...register('category', { required: 'Categoria é obrigatória' })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                placeholder="Ex: Trabalho"
              />
              {errors.category && (
                <p className="mt-1 text-xs text-red-600">{errors.category.message}</p>
              )}
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {submitting && <LoadingSpinner size="sm" />}
              Salvar
            </button>
          </div>
        </form>
      )}

      {/* Incomes list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : error && !showForm ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      ) : incomes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          Nenhuma receita cadastrada.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  Nome
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  Categoria
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  Frequência
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">
                  Valor
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-500">
                  Ativo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {incomes.map((income) => (
                <tr key={income.id} className={income.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{income.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{income.category}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {FREQUENCY_LABELS[income.frequency]}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">
                    {formatCurrency(income.amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => void toggleActive(income)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        income.active ? 'bg-green-600' : 'bg-gray-200'
                      }`}
                      role="switch"
                      aria-checked={income.active}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          income.active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

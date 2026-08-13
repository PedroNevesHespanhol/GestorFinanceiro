'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { apiGet, apiPost, apiPut } from '@/lib/pluggy-api';
import { formatCurrency } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  frequency: 'MONTHLY' | 'WEEKLY' | 'YEARLY';
  category: string;
  dueDate?: number;
  active: boolean;
}

interface FixedExpenseFormData {
  name: string;
  amount: number;
  frequency: 'MONTHLY' | 'WEEKLY' | 'YEARLY';
  category: string;
  dueDate: string;
}

const FREQUENCY_LABELS: Record<FixedExpense['frequency'], string> = {
  MONTHLY: 'Mensal',
  WEEKLY: 'Semanal',
  YEARLY: 'Anual',
};

const FREQUENCY_MONTHLY_FACTOR: Record<FixedExpense['frequency'], number> = {
  MONTHLY: 1,
  WEEKLY: 52 / 12,
  YEARLY: 1 / 12,
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FixedExpenseFormData>();

  async function fetchExpenses() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ fixedExpenses: FixedExpense[] }>('/fixed-expenses');
      setExpenses(data.fixedExpenses ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar gastos fixos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchExpenses();
  }, []);

  async function onSubmit(data: FixedExpenseFormData) {
    setSubmitting(true);
    try {
      await apiPost('/fixed-expenses', {
        ...data,
        amount: Number(data.amount),
        // Backend espera o DIA do vencimento (1–31), não uma data completa
        dueDate: data.dueDate ? Number(data.dueDate) : undefined,
      });
      reset();
      setShowForm(false);
      await fetchExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar gasto fixo');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(expense: FixedExpense) {
    try {
      await apiPut(`/fixed-expenses/${expense.id}`, { active: !expense.active });
      await fetchExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar gasto');
    }
  }

  const activeExpenses = expenses.filter((e) => e.active);
  const monthlyTotal = activeExpenses.reduce(
    (sum, e) => sum + e.amount * FREQUENCY_MONTHLY_FACTOR[e.frequency],
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gastos Fixos</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : '+ Adicionar'}
        </button>
      </div>

      {/* Monthly total */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm text-blue-600">Total mensal estimado (gastos ativos)</p>
        <p className="text-2xl font-bold text-blue-800">{formatCurrency(monthlyTotal)}</p>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 font-semibold text-gray-700">Novo Gasto Fixo</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                {...register('name', { required: 'Nome é obrigatório' })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Ex: Aluguel"
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
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="0,00"
              />
              {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Frequência</label>
              <select
                {...register('frequency', { required: true })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Ex: Moradia"
              />
              {errors.category && (
                <p className="mt-1 text-xs text-red-600">{errors.category.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Dia do vencimento (opcional)
              </label>
              <input
                type="number"
                min="1"
                max="31"
                placeholder="Ex: 10"
                {...register('dueDate', {
                  min: { value: 1, message: 'Dia deve ser entre 1 e 31' },
                  max: { value: 31, message: 'Dia deve ser entre 1 e 31' },
                })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              {errors.dueDate && (
                <p className="mt-1 text-xs text-red-600">{errors.dueDate.message}</p>
              )}
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting && <LoadingSpinner size="sm" />}
              Salvar
            </button>
          </div>
        </form>
      )}

      {/* Expenses list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : error && !showForm ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      ) : expenses.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          Nenhum gasto fixo cadastrado.
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
              {expenses.map((expense) => (
                <tr key={expense.id} className={expense.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{expense.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{expense.category}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {FREQUENCY_LABELS[expense.frequency]}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">
                    {formatCurrency(expense.amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => void toggleActive(expense)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        expense.active ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                      role="switch"
                      aria-checked={expense.active}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          expense.active ? 'translate-x-6' : 'translate-x-1'
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

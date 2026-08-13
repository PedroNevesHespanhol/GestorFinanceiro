'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { apiGet, apiPost, apiPut } from '@/lib/pluggy-api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  name: string;
  amount: number;
  settled: boolean;
  settledAt?: string;
}

interface Reimbursement {
  id: string;
  description: string;
  totalAmount: number;
  paidBy: string;
  date: string;
  status: 'PENDING' | 'PARTIALLY_SETTLED' | 'SETTLED';
  participants: Participant[];
  createdAt: string;
}

interface ParticipantFormData {
  name: string;
  amount: number;
}

interface SingleFormData {
  description: string;
  totalAmount: number;
  date: string;
  paidBy: string;
  participants: ParticipantFormData[];
}

interface BatchFormData {
  description: string;         // e.g. "Netflix"
  monthlyAmount: number;
  paidBy: string;
  startYear: number;
  startMonth: number;          // 1–12
  endYear: number;
  endMonth: number;            // 1–12
  participants: ParticipantFormData[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Reimbursement['status'], { label: string; classes: string }> = {
  PENDING: { label: 'Pendente', classes: 'bg-yellow-100 text-yellow-800' },
  PARTIALLY_SETTLED: { label: 'Parcialmente pago', classes: 'bg-blue-100 text-blue-800' },
  SETTLED: { label: 'Quitado', classes: 'bg-green-100 text-green-800' },
};

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBatchMonths(data: BatchFormData): { label: string; date: string }[] {
  const months: { label: string; date: string }[] = [];
  let y = Number(data.startYear);
  let m = Number(data.startMonth);
  const endY = Number(data.endYear);
  const endM = Number(data.endMonth);

  while (y < endY || (y === endY && m <= endM)) {
    months.push({
      label: `${data.description} — ${MONTH_NAMES[m - 1]}/${y}`,
      date: new Date(y, m - 1, 1).toISOString(),
    });
    m++;
    if (m > 12) { m = 1; y++; }
    if (months.length > 60) break; // safety cap
  }
  return months;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Assinatura estrutural mínima compartilhada pelos register dos dois forms
// (SingleFormData e BatchFormData) — ambos possuem participants: ParticipantFormData[].
type RegisterFn = (name: string, opts?: object) => object;

function ParticipantFields({
  fields, register, remove, append,
}: {
  fields: { id: string }[];
  register: RegisterFn;
  remove: (i: number) => void;
  append: (v: ParticipantFormData) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Participantes que devem reembolsar</label>
        <button
          type="button"
          onClick={() => append({ name: '', amount: 0 })}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          + Adicionar
        </button>
      </div>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-3">
            <input
              {...register(`participants.${index}.name`, { required: true })}
              placeholder="Nome"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              {...register(`participants.${index}.amount`, { required: true, min: 0 })}
              placeholder="Valor (R$)"
              className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            {fields.length > 1 && (
              <button
                type="button"
                onClick={() => remove(index)}
                className="text-red-500 hover:text-red-700"
                aria-label="Remover"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type FormMode = 'none' | 'single' | 'batch';

export default function ReimbursementsPage() {
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('none');

  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // ── Single form ──────────────────────────────────────────────────────────────
  const single = useForm<SingleFormData>({
    defaultValues: { date: today, participants: [{ name: '', amount: 0 }] },
  });
  const singleParticipants = useFieldArray({ control: single.control, name: 'participants' });

  // ── Batch form ───────────────────────────────────────────────────────────────
  const batch = useForm<BatchFormData>({
    defaultValues: {
      startYear: currentYear,
      startMonth: currentMonth,
      endYear: currentYear,
      endMonth: currentMonth,
      participants: [{ name: '', amount: 0 }],
    },
  });
  const batchParticipants = useFieldArray({ control: batch.control, name: 'participants' });
  const batchWatch = batch.watch();

  const batchPreview = useMemo(() => {
    if (!batchWatch.description || !batchWatch.startYear) return [];
    return buildBatchMonths(batchWatch as BatchFormData);
  }, [batchWatch]);

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  async function fetchReimbursements() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ splitReimbursements: Reimbursement[] }>('/split-reimbursements');
      setReimbursements(data.splitReimbursements ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar reembolsos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchReimbursements(); }, []);

  // ── Submit: single ─────────────────────────────────────────────────────────
  async function onSubmitSingle(data: SingleFormData) {
    setSubmitting(true);
    try {
      await apiPost('/split-reimbursements', {
        description: data.description,
        totalAmount: Number(data.totalAmount),
        date: new Date(data.date).toISOString(),
        paidBy: data.paidBy,
        participants: data.participants.map((p) => ({
          id: crypto.randomUUID(),
          name: p.name,
          amount: Number(p.amount),
          settled: false,
        })),
      });
      single.reset({ date: today, participants: [{ name: '', amount: 0 }] });
      setFormMode('none');
      await fetchReimbursements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar reembolso');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Submit: batch ──────────────────────────────────────────────────────────
  async function onSubmitBatch(data: BatchFormData) {
    const months = buildBatchMonths(data);
    if (months.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      for (const { label, date } of months) {
        await apiPost('/split-reimbursements', {
          description: label,
          totalAmount: data.participants.reduce((s, p) => s + Number(p.amount), 0),
          date,
          paidBy: data.paidBy,
          participants: data.participants.map((p) => ({
            id: crypto.randomUUID(),
            name: p.name,
            amount: Number(p.amount),
            settled: false,
          })),
        });
      }
      batch.reset({
        startYear: currentYear,
        startMonth: currentMonth,
        endYear: currentYear,
        endMonth: currentMonth,
        participants: [{ name: '', amount: 0 }],
      });
      setFormMode('none');
      await fetchReimbursements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar reembolsos em lote');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Mark settled ─────────────────────────────────────────────────────────────
  async function markSettled(item: Reimbursement, participantId: string) {
    try {
      const updatedParticipants = item.participants.map((p) =>
        p.id === participantId ? { ...p, settled: !p.settled } : p
      );
      await apiPut(`/split-reimbursements/${item.id}`, { participants: updatedParticipants });
      await fetchReimbursements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar pagamento');
    }
  }

  function cancelForm() {
    setFormMode('none');
    single.reset({ date: today, participants: [{ name: '', amount: 0 }] });
    batch.reset({
      startYear: currentYear, startMonth: currentMonth,
      endYear: currentYear, endMonth: currentMonth,
      participants: [{ name: '', amount: 0 }],
    });
    setError(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Reembolsos</h1>
        {formMode === 'none' ? (
          <div className="flex gap-2">
            <button
              onClick={() => setFormMode('single')}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Novo reembolso
            </button>
            <button
              onClick={() => setFormMode('batch')}
              className="rounded-lg border border-blue-600 px-4 py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              Criar recorrente
            </button>
          </div>
        ) : (
          <button
            onClick={cancelForm}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {/* ── Single form ────────────────────────────────────────────────────────── */}
      {formMode === 'single' && (
        <form
          onSubmit={(e) => void single.handleSubmit(onSubmitSingle)(e)}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 font-semibold text-gray-700">Novo Reembolso</h2>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Descrição</label>
                <input
                  {...single.register('description', { required: 'Obrigatório' })}
                  placeholder="Ex: Jantar no restaurante"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                {single.formState.errors.description && (
                  <p className="mt-1 text-xs text-red-600">{single.formState.errors.description.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Valor total (R$)</label>
                <input
                  type="number" step="0.01" min="0"
                  {...single.register('totalAmount', { required: 'Obrigatório', min: 0 })}
                  placeholder="0,00"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Quem pagou</label>
                <input
                  {...single.register('paidBy', { required: 'Obrigatório' })}
                  placeholder="Ex: João"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Data</label>
                <input
                  type="date"
                  {...single.register('date', { required: 'Obrigatório' })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <ParticipantFields
              fields={singleParticipants.fields}
              register={single.register as unknown as RegisterFn}
              remove={singleParticipants.remove}
              append={singleParticipants.append}
            />
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit" disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting && <LoadingSpinner size="sm" />}
              Criar reembolso
            </button>
          </div>
        </form>
      )}

      {/* ── Batch form ──────────────────────────────────────────────────────────── */}
      {formMode === 'batch' && (
        <form
          onSubmit={(e) => void batch.handleSubmit(onSubmitBatch)(e)}
          className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              Recorrente
            </span>
            <h2 className="font-semibold text-gray-700">Criar reembolsos mensais em lote</h2>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            Ideal para assinaturas divididas (streaming, internet, etc.). Cria um reembolso por mês no período informado.
          </p>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nome do serviço</label>
                <input
                  {...batch.register('description', { required: 'Obrigatório' })}
                  placeholder="Ex: Netflix, Spotify, Internet"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                {batch.formState.errors.description && (
                  <p className="mt-1 text-xs text-red-600">{batch.formState.errors.description.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Quem paga a assinatura</label>
                <input
                  {...batch.register('paidBy', { required: 'Obrigatório' })}
                  placeholder="Ex: João"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Date range */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">De (mês/ano)</label>
                <div className="mt-1 flex gap-2">
                  <select
                    {...batch.register('startMonth', { valueAsNumber: true })}
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {MONTH_NAMES.map((name, i) => (
                      <option key={i} value={i + 1}>{name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    {...batch.register('startYear', { valueAsNumber: true, min: 2020 })}
                    className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Até (mês/ano)</label>
                <div className="mt-1 flex gap-2">
                  <select
                    {...batch.register('endMonth', { valueAsNumber: true })}
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {MONTH_NAMES.map((name, i) => (
                      <option key={i} value={i + 1}>{name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    {...batch.register('endYear', { valueAsNumber: true, min: 2020 })}
                    className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Participants (who owes back) */}
            <ParticipantFields
              fields={batchParticipants.fields}
              register={batch.register as unknown as RegisterFn}
              remove={batchParticipants.remove}
              append={batchParticipants.append}
            />

            {/* Preview */}
            {batchPreview.length > 0 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="mb-2 text-sm font-semibold text-blue-700">
                  Prévia — {batchPreview.length} reembolso{batchPreview.length !== 1 ? 's' : ''} serão criados:
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {batchPreview.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-blue-800">
                      <span>{m.label}</span>
                      <span className="font-medium">
                        {formatCurrency(
                          batchWatch.participants?.reduce((s, p) => s + Number(p.amount || 0), 0) ?? 0
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={submitting || batchPreview.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting && <LoadingSpinner size="sm" />}
              Criar {batchPreview.length > 0 ? `${batchPreview.length} reembolsos` : 'reembolsos'}
            </button>
          </div>
        </form>
      )}

      {/* ── List ──────────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : reimbursements.filter((i) => i.status !== 'SETTLED').length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          {reimbursements.length === 0
            ? 'Nenhum reembolso cadastrado.'
            : 'Todos os reembolsos já foram quitados.'}
        </div>
      ) : (
        <div className="space-y-4">
          {reimbursements.filter((item) => item.status !== 'SETTLED').map((item) => {
            const status = STATUS_CONFIG[item.status];
            return (
              <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.description}</h3>
                    <p className="text-sm text-gray-500">
                      {formatCurrency(item.totalAmount)} • {formatDate(item.date)} • Pago por: {item.paidBy}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.classes}`}>
                    {status.label}
                  </span>
                </div>

                <div className="space-y-2">
                  {item.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-2 w-2 rounded-full ${p.settled ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-sm text-gray-800">{p.name}</span>
                        {p.settledAt && (
                          <span className="text-xs text-gray-400">pago em {formatDate(p.settledAt)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-semibold ${p.settled ? 'text-green-600' : 'text-gray-700'}`}>
                          {formatCurrency(p.amount)}
                        </span>
                        <button
                          onClick={() => void markSettled(item, p.id)}
                          className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                            p.settled
                              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {p.settled ? 'Desfazer' : 'Marcar pago'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

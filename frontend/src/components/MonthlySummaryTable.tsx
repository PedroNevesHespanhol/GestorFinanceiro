'use client';

import { useState } from 'react';
import { formatCurrency, formatMonthYear } from '@/lib/utils';

export interface InstallmentEntry {
  description: string;
  amount: number;
  installmentCurrent: number;
  installmentTotal: number;
  isProjected: boolean;
}

export interface MonthPlan {
  month: number;
  year: number;
  isPast: boolean;
  isCurrent: boolean;
  receitas: number;
  despesasVariaveis: number;
  despesasFixas: number;
  receitasRecorrentes: number;
  parceladas: InstallmentEntry[];
  totalParceladas: number;
  saldo: number;
}

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function SaldoBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <span
      className={`font-bold tabular-nums ${
        isPositive ? 'text-green-600' : 'text-red-600'
      }`}
    >
      {isPositive ? '+' : ''}
      {formatCurrency(value)}
    </span>
  );
}

function MonthRow({
  plan,
  isExpanded,
  onToggle,
}: {
  plan: MonthPlan;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isProjected = !plan.isPast && !plan.isCurrent;
  // Past months: real Pluggy data. Current month: real if available, otherwise recurring projection.
  // Future months: recurring projection.
  const income = plan.isPast
    ? plan.receitas
    : plan.isCurrent
      ? (plan.receitas > 0 ? plan.receitas : plan.receitasRecorrentes)
      : plan.receitasRecorrentes;

  const rowBg = plan.isCurrent
    ? 'bg-blue-50 border-l-4 border-blue-500'
    : plan.isPast
    ? 'bg-white'
    : 'bg-gray-50';

  return (
    <>
      <tr
        className={`${rowBg} cursor-pointer transition-colors hover:bg-blue-50`}
        onClick={onToggle}
      >
        {/* Mês */}
        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span>{MONTH_LABELS[plan.month - 1]}</span>
            {plan.isCurrent && (
              <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                atual
              </span>
            )}
            {isProjected && (
              <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                projeção
              </span>
            )}
            {plan.parceladas.length > 0 && (
              <span className="text-xs text-gray-400">
                {isExpanded ? '▲' : '▼'} {plan.parceladas.length} parcela{plan.parceladas.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </td>

        {/* Receitas */}
        <td className="px-4 py-3 text-right text-sm tabular-nums text-green-700">
          {income > 0 ? formatCurrency(income) : '—'}
        </td>

        {/* Desp. Variáveis */}
        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">
          {plan.despesasVariaveis > 0
            ? formatCurrency(plan.despesasVariaveis)
            : isProjected
            ? <span className="text-gray-400 text-xs">n/d</span>
            : '—'}
        </td>

        {/* Desp. Fixas */}
        <td className="px-4 py-3 text-right text-sm tabular-nums text-orange-700">
          {plan.despesasFixas > 0 ? formatCurrency(plan.despesasFixas) : '—'}
        </td>

        {/* Parceladas */}
        <td className="px-4 py-3 text-right text-sm tabular-nums text-purple-700">
          {plan.totalParceladas > 0 ? formatCurrency(plan.totalParceladas) : '—'}
        </td>

        {/* Saldo */}
        <td className="px-4 py-3 text-right">
          <SaldoBadge value={plan.saldo} />
        </td>
      </tr>

      {/* Linha de detalhe de parcelas */}
      {isExpanded && plan.parceladas.length > 0 && (
        <tr className={rowBg}>
          <td colSpan={6} className="px-4 pb-4 pt-0">
            <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-700">
                Compras parceladas
              </p>
              <div className="space-y-1">
                {plan.parceladas.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs text-gray-700"
                  >
                    <span className="flex items-center gap-2">
                      {p.isProjected && (
                        <span className="rounded bg-gray-200 px-1 text-gray-500">proj.</span>
                      )}
                      <span className="max-w-xs truncate">{p.description}</span>
                      <span className="text-gray-400">
                        ({p.installmentCurrent}/{p.installmentTotal})
                      </span>
                    </span>
                    <span className="font-medium text-purple-700">
                      {formatCurrency(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface MonthlySummaryTableProps {
  months: MonthPlan[];
}

export function MonthlySummaryTable({ months }: MonthlySummaryTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const periodLabel = months.length > 0
    ? `${formatMonthYear(new Date(months[0].year, months[0].month - 1, 1))} – ${formatMonthYear(
        new Date(months[months.length - 1].year, months[months.length - 1].month - 1, 1)
      )}`
    : '';

  function toggleRow(month: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }

  const totals = months.reduce(
    (acc, m) => {
      const income = m.isPast
        ? m.receitas
        : m.isCurrent
          ? (m.receitas > 0 ? m.receitas : m.receitasRecorrentes)
          : m.receitasRecorrentes;
      return {
        receitas: acc.receitas + income,
        variaveis: acc.variaveis + m.despesasVariaveis,
        fixas: acc.fixas + m.despesasFixas,
        parceladas: acc.parceladas + m.totalParceladas,
        saldo: acc.saldo + m.saldo,
      };
    },
    { receitas: 0, variaveis: 0, fixas: 0, parceladas: 0, saldo: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-blue-100 border border-blue-400" />
          Mês atual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-white border border-gray-300" />
          Dados reais (Pluggy)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-gray-100 border border-gray-300" />
          Projeção (despesas fixas + parcelas)
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 text-left">Mês</th>
              <th className="px-4 py-3 text-right text-green-700">Receitas</th>
              <th className="px-4 py-3 text-right text-gray-700">Desp. Variáveis</th>
              <th className="px-4 py-3 text-right text-orange-700">Desp. Fixas</th>
              <th className="px-4 py-3 text-right text-purple-700">Parceladas</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {months.map((plan) => (
              <MonthRow
                key={plan.month}
                plan={plan}
                isExpanded={expandedRows.has(plan.month)}
                onToggle={() => toggleRow(plan.month)}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td className="px-4 py-3 text-sm text-gray-900">Total {periodLabel}</td>
              <td className="px-4 py-3 text-right text-sm text-green-700 tabular-nums">
                {formatCurrency(totals.receitas)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                {formatCurrency(totals.variaveis)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-orange-700 tabular-nums">
                {formatCurrency(totals.fixas)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-purple-700 tabular-nums">
                {formatCurrency(totals.parceladas)}
              </td>
              <td className="px-4 py-3 text-right">
                <SaldoBadge value={totals.saldo} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-center text-xs text-gray-400">
        Clique em um mês para ver o detalhamento das compras parceladas.
        Meses futuros usam despesas fixas cadastradas + projeção de parcelas detectadas automaticamente.
      </p>
    </div>
  );
}

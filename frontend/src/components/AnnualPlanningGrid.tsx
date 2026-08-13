'use client';

import type { CSSProperties } from 'react';
import { formatCurrency, formatMonthYear, formatDate, classNames } from '@/lib/utils';
import { getCategoryBadgeClasses, getPaymentMethodBadgeClasses } from '@/lib/badgeColors';
import type { MonthPlan } from './MonthlySummaryTable';

export interface MonthCell {
  amount: number;
  isProjected: boolean;
}

export interface ExpenseGridRow {
  id: string;
  description: string;
  category: string;
  paymentMethod: string | null;
  kind: 'FIXED' | 'INSTALLMENT' | 'ONE_OFF';
  installmentTotal?: number;
  date?: string;
  totalAmount: number;
  monthlyCells: (MonthCell | null)[];
}

const STICKY_COLUMNS = [
  { key: 'description', label: 'Gasto', width: 208 },
  { key: 'category', label: 'Categoria', width: 144 },
  { key: 'paymentMethod', label: 'Método', width: 128 },
  { key: 'installments', label: 'Parcelas', width: 84 },
  { key: 'valor', label: 'Valor', width: 112 },
] as const;

const STICKY_LEFTS = STICKY_COLUMNS.reduce<number[]>((acc, col, idx) => {
  acc.push(idx === 0 ? 0 : acc[idx - 1] + STICKY_COLUMNS[idx - 1].width);
  return acc;
}, []);

function stickyStyle(idx: number): CSSProperties {
  return { left: STICKY_LEFTS[idx], width: STICKY_COLUMNS[idx].width, minWidth: STICKY_COLUMNS[idx].width };
}

function installmentsLabel(row: ExpenseGridRow): string {
  if (row.kind === 'INSTALLMENT' && row.installmentTotal) return `${row.installmentTotal}x`;
  if (row.kind === 'FIXED') return 'Mensal';
  return '—';
}

interface AnnualPlanningGridProps {
  rows: ExpenseGridRow[];
  months: MonthPlan[];
}

export function AnnualPlanningGrid({ rows, months }: AnnualPlanningGridProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="italic text-gray-400">R$ 0,00</span>
          = projeção (ainda sem transação real)
        </span>
        <span>Clique e arraste a tabela para o lado para ver todos os meses.</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {STICKY_COLUMNS.map((col, idx) => (
                <th
                  key={col.key}
                  className={classNames(
                    'sticky z-20 bg-gray-50 px-3 py-3',
                    col.key === 'valor' ? 'text-right' : 'text-left'
                  )}
                  style={stickyStyle(idx)}
                >
                  {col.label}
                </th>
              ))}
              {months.map((m) => (
                <th key={`${m.year}-${m.month}`} className="whitespace-nowrap px-3 py-3 text-right">
                  {formatMonthYear(new Date(m.year, m.month - 1, 1))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Linha de saldo do mês */}
            <tr className="border-b-2 border-gray-200 bg-blue-50/40 font-semibold">
              {STICKY_COLUMNS.map((col, idx) => (
                <td
                  key={col.key}
                  className="sticky z-10 bg-blue-50 px-3 py-2 text-xs uppercase tracking-wide text-gray-500"
                  style={stickyStyle(idx)}
                >
                  {idx === 0 ? 'Saldo' : ''}
                </td>
              ))}
              {months.map((m) => (
                <td
                  key={`${m.year}-${m.month}`}
                  className={classNames(
                    'whitespace-nowrap px-3 py-2 text-right tabular-nums',
                    m.saldo >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  )}
                >
                  {m.saldo >= 0 ? '+' : ''}
                  {formatCurrency(m.saldo)}
                </td>
              ))}
            </tr>

            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td
                  className="sticky z-10 truncate bg-white px-3 py-2 text-sm text-gray-900"
                  style={stickyStyle(0)}
                  title={row.date ? `${row.description} — ${formatDate(row.date)}` : row.description}
                >
                  {row.description}
                </td>
                <td className="sticky z-10 bg-white px-3 py-2" style={stickyStyle(1)}>
                  <span
                    className={classNames(
                      'inline-block truncate rounded-full px-2 py-0.5 text-[11px] font-medium',
                      getCategoryBadgeClasses(row.category)
                    )}
                  >
                    {row.category}
                  </span>
                </td>
                <td className="sticky z-10 bg-white px-3 py-2" style={stickyStyle(2)}>
                  {row.paymentMethod ? (
                    <span
                      className={classNames(
                        'inline-block truncate rounded-full px-2 py-0.5 text-[11px] font-medium',
                        getPaymentMethodBadgeClasses(row.paymentMethod)
                      )}
                    >
                      {row.paymentMethod}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td
                  className="sticky z-10 bg-white px-3 py-2 text-xs text-gray-500"
                  style={stickyStyle(3)}
                >
                  {installmentsLabel(row)}
                </td>
                <td
                  className="sticky z-10 bg-white px-3 py-2 text-right text-sm font-medium tabular-nums text-gray-900"
                  style={stickyStyle(4)}
                >
                  {formatCurrency(row.totalAmount)}
                </td>
                {row.monthlyCells.map((cell, idx) => (
                  <td
                    key={idx}
                    className={classNames(
                      'whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums',
                      !cell ? 'text-gray-200' : cell.isProjected ? 'italic text-gray-400' : 'text-gray-700'
                    )}
                  >
                    {cell ? formatCurrency(cell.amount) : '—'}
                  </td>
                ))}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={STICKY_COLUMNS.length + 12} className="px-4 py-10 text-center text-sm text-gray-400">
                  Nenhum gasto encontrado nos próximos 12 meses.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

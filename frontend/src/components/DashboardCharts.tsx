'use client';

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { Transaction } from '@/hooks/useTransactions';
import { formatCurrency, formatMonthYear } from '@/lib/utils';
import { translateCategory } from '@/lib/categoryTranslations';

const CATEGORY_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
];

interface DashboardChartsProps {
  transactions: Transaction[];
}

interface CategoryData {
  name: string;
  value: number;
}

interface MonthlyData {
  month: string;
  receitas: number;
  despesas: number;
}

function getCategoryData(transactions: Transaction[]): CategoryData[] {
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentDebits = transactions.filter((t) => {
    const txDate = new Date(t.date);
    return t.type === 'DEBIT' && txDate >= thirtyDaysAgo && txDate <= now;
  });

  const categoryMap: Record<string, number> = {};
  for (const tx of recentDebits) {
    const cat = translateCategory(tx.category);
    categoryMap[cat] = (categoryMap[cat] ?? 0) + Math.abs(tx.amount);
  }

  return Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));
}

function getMonthlyData(transactions: Transaction[]): MonthlyData[] {
  const now = new Date();
  const months: MonthlyData[] = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

    const monthTransactions = transactions.filter((t) => {
      const txDate = new Date(t.date);
      return txDate >= startOfMonth && txDate <= endOfMonth;
    });

    const receitas = monthTransactions
      .filter((t) => t.type === 'CREDIT')
      .reduce((sum, t) => sum + t.amount, 0);

    const despesas = monthTransactions
      .filter((t) => t.type === 'DEBIT')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    months.push({
      month: formatMonthYear(startOfMonth.toISOString()),
      receitas,
      despesas,
    });
  }

  return months;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}

function CurrencyTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
      {label && <p className="mb-1 font-medium text-gray-700">{label}</p>}
      {payload.map((entry, index) => (
        <p key={index} style={{ color: entry.color }} className="text-sm">
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}

function PieTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
      <p className="font-medium text-gray-700">{entry.name}</p>
      <p className="text-sm text-gray-600">{formatCurrency(entry.value)}</p>
    </div>
  );
}

export function DashboardCharts({ transactions }: DashboardChartsProps) {
  const categoryData = getCategoryData(transactions);
  const monthlyData = getMonthlyData(transactions);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Pie Chart - Category expenses */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-gray-700">
          Gastos por Categoria (últimos 30 dias)
        </h3>
        {categoryData.length === 0 ? (
          <p className="py-8 text-center text-gray-400">Nenhum gasto encontrado</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
              >
                {categoryData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend
                formatter={(value) => (
                  <span className="text-sm text-gray-600">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bar Chart - Monthly income vs expenses */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-gray-700">
          Receitas vs Despesas (últimos 6 meses)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                new Intl.NumberFormat('pt-BR', {
                  notation: 'compact',
                  compactDisplay: 'short',
                  currency: 'BRL',
                  style: 'currency',
                }).format(v)
              }
            />
            <Tooltip content={<CurrencyTooltip />} />
            <Legend />
            <Bar dataKey="receitas" name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

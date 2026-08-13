export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  // Firestore Timestamp serializado como { _seconds, _nanoseconds }
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(dateString: unknown): string {
  const date = parseDate(dateString);
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatMonthYear(dateString: unknown): string {
  const date = parseDate(dateString);
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function classNames(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function getLast30DaysRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const past = new Date();
  past.setDate(past.getDate() - 30);
  return {
    dateFrom: past.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0],
  };
}

export function getLast6MonthsRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const past = new Date();
  past.setMonth(past.getMonth() - 6);
  return {
    dateFrom: past.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0],
  };
}

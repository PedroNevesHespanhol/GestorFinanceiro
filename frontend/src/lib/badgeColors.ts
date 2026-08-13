const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  Compras: 'bg-blue-100 text-blue-700',
  'Serviços digitais': 'bg-purple-100 text-purple-700',
  Assinaturas: 'bg-purple-100 text-purple-700',
  Moradia: 'bg-emerald-100 text-emerald-700',
  Supermercado: 'bg-red-100 text-red-700',
  Alimentação: 'bg-red-100 text-red-700',
  Saúde: 'bg-teal-100 text-teal-700',
  Lazer: 'bg-pink-100 text-pink-700',
  Transporte: 'bg-amber-100 text-amber-700',
  Viagem: 'bg-cyan-100 text-cyan-700',
  Animais: 'bg-orange-100 text-orange-700',
  Outros: 'bg-gray-100 text-gray-700',
};

// Deterministic fallback palette for categories not in the fixed map above,
// so unmapped Pluggy categories still get a distinct, stable color instead
// of always falling back to gray.
const FALLBACK_PALETTE = [
  'bg-indigo-100 text-indigo-700',
  'bg-lime-100 text-lime-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-yellow-100 text-yellow-700',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getCategoryBadgeClasses(category: string): string {
  return CATEGORY_BADGE_CLASSES[category] ?? FALLBACK_PALETTE[hashString(category) % FALLBACK_PALETTE.length];
}

const PAYMENT_METHOD_BADGE_CLASSES: Record<string, string> = {
  Pix: 'bg-emerald-100 text-emerald-700',
  Nubank: 'bg-purple-100 text-purple-700',
  Itaú: 'bg-orange-100 text-orange-700',
  'Mercado Pago': 'bg-blue-100 text-blue-700',
};

const FALLBACK_PAYMENT_CLASSES = 'bg-gray-100 text-gray-600';

export function getPaymentMethodBadgeClasses(method: string | null): string {
  if (!method) return FALLBACK_PAYMENT_CLASSES;
  return PAYMENT_METHOD_BADGE_CLASSES[method] ?? FALLBACK_PAYMENT_CLASSES;
}

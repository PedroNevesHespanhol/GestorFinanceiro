import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GestorFinanceiro',
  description: 'Gerencie suas finanças de forma inteligente',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}

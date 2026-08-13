'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/accounts', label: 'Contas', icon: '🏦' },
  { href: '/transactions', label: 'Transações', icon: '💳' },
  { href: '/expenses', label: 'Gastos Fixos', icon: '📋' },
  { href: '/income', label: 'Receitas', icon: '💰' },
  { href: '/planning', label: 'Planejamento Anual', icon: '📅' },
  { href: '/split-reimbursements', label: 'Reembolsos', icon: '🤝' },
  { href: '/settings', label: 'Configurações', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <aside className="flex h-full w-64 flex-col bg-gray-900 text-white">
      <div className="flex items-center gap-3 border-b border-gray-700 p-4">
        <span className="text-xl font-bold text-blue-400">GestorFinanceiro</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-gray-700 p-4">
        {user && (
          <div className="mb-3 flex items-center gap-3">
            {user.photoURL ? (
              <Image
                src={user.photoURL}
                alt={user.displayName ?? 'Usuário'}
                width={36}
                height={36}
                className="rounded-full"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold">
                {(user.displayName ?? user.email ?? 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user.displayName ?? 'Usuário'}
              </p>
              <p className="truncate text-xs text-gray-400">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => void signOut()}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}

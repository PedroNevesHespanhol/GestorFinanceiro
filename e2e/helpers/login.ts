import { Page, expect } from '@playwright/test';

/**
 * Faz login pelo fluxo real da UI ("Entrar com Google"), usando o widget de
 * contas falsas do Firebase Auth Emulator. Cada chamada cria um usuário novo
 * (auto-gerado), o que isola os testes entre si — todos os dados no Firestore
 * são particionados por usuário.
 *
 * Retorna o e-mail do usuário logado (lido da sidebar), que os helpers de seed
 * usam para resolver o uid via Admin SDK.
 */
export async function loginWithGoogle(page: Page): Promise<{ email: string }> {
  await page.goto('/login');

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /entrar com google/i }).click();
  const popup = await popupPromise;

  // Widget do Auth Emulator: adiciona uma conta falsa auto-gerada e entra
  await popup.getByRole('button', { name: /add new account/i }).click();
  await popup.getByRole('button', { name: /auto-generate/i }).click();
  await popup.getByRole('button', { name: /sign in with google\.com/i }).click();

  await page.waitForURL('**/dashboard', { timeout: 45_000 });

  // A sidebar exibe o e-mail do usuário autenticado
  const emailLocator = page.locator('aside p.text-xs.text-gray-400').first();
  await expect(emailLocator).toContainText('@');
  const email = (await emailLocator.textContent())?.trim() ?? '';
  return { email };
}

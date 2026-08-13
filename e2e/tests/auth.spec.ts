import { test, expect } from '@playwright/test';
import { loginWithGoogle } from '../helpers/login';

test.describe('Autenticação', () => {
  test('redireciona usuário não autenticado de /dashboard para /login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: /entrar com google/i })).toBeVisible();
  });

  test('faz login com Google (emulador) e chega ao dashboard', async ({ page }) => {
    const { email } = await loginWithGoogle(page);
    expect(email).toContain('@');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Saldo Total')).toBeVisible();
    // Usuário novo, sem contas conectadas
    await expect(page.getByText('0 conta(s) bancária(s)')).toBeVisible();
  });

  test('logout retorna para a tela de login', async ({ page }) => {
    await loginWithGoogle(page);

    await page.getByRole('button', { name: 'Sair' }).click();
    await page.waitForURL('**/login', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: /entrar com google/i })).toBeVisible();
  });

  test('backend cria o usuário no Firestore após login (GET /auth/me via Settings)', async ({ page }) => {
    const { email } = await loginWithGoogle(page);

    await page.getByRole('link', { name: /configurações/i }).click();
    await page.waitForURL('**/settings');
    // Email aparece na sidebar e no card de usuário → .first() evita strict mode
    await expect(page.getByText(email).first()).toBeVisible();
    // UID do Firebase exibido na página
    await expect(page.getByText('Firebase UID')).toBeVisible();
  });
});

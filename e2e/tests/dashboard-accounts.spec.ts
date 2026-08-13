import { test, expect } from '@playwright/test';
import { loginWithGoogle } from '../helpers/login';
import { uidByEmail, seedUserData } from '../helpers/firebase-admin';

test.describe('Dashboard, Contas e Transações (dados semeados)', () => {
  test('dashboard mostra saldo total e limite disponível do cartão', async ({ page }) => {
    const { email } = await loginWithGoogle(page);
    const uid = await uidByEmail(email);
    await seedUserData(uid);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Saldo Total = contas BANK (2500)
    await expect(page.getByText(/R\$\s*2\.500,00/)).toBeVisible();
    // Limite Disponível = creditAvailableLimit achatado pelo backend (4200) —
    // regressão do contrato creditData aninhado vs. campos no nível raiz
    await expect(page.getByText(/R\$\s*4\.200,00/)).toBeVisible();
    await expect(page.getByText('1 conta(s) bancária(s)')).toBeVisible();
    await expect(page.getByText('1 cartão(ões) de crédito')).toBeVisible();

    // Últimas transações listadas
    await expect(page.getByText('Restaurante E2E')).toBeVisible();
    await expect(page.getByText('Salario E2E')).toBeVisible();
  });

  test('página de contas mostra instituição, limites e vencimento da fatura', async ({ page }) => {
    const { email } = await loginWithGoogle(page);
    const uid = await uidByEmail(email);
    await seedUserData(uid);

    await page.getByRole('link', { name: /contas/i }).click();
    await page.waitForURL('**/accounts');

    await expect(page.getByText('Conta Corrente E2E')).toBeVisible();
    await expect(page.getByText('Cartão E2E')).toBeVisible();
    // Instituição vem do connectorName do item Pluggy
    await expect(page.getByText('Banco E2E').first()).toBeVisible();
    // Dados de crédito achatados pelo backend
    await expect(page.getByText('Limite disponível')).toBeVisible();
    await expect(page.getByText(/R\$\s*4\.200,00/)).toBeVisible();
    await expect(page.getByText('Limite total')).toBeVisible();
    await expect(page.getByText(/R\$\s*5\.000,00/)).toBeVisible();
    await expect(page.getByText('Vencimento da fatura')).toBeVisible();
  });

  test('página de transações lista e filtra por categoria', async ({ page }) => {
    const { email } = await loginWithGoogle(page);
    const uid = await uidByEmail(email);
    await seedUserData(uid);

    await page.getByRole('link', { name: /transações/i }).click();
    await page.waitForURL('**/transactions');

    await expect(page.getByRole('cell', { name: 'Mercado E2E' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Salario E2E' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Restaurante E2E' })).toBeVisible();

    // Valores formatados (débito com sinal negativo)
    await expect(page.getByText(/-\s*R\$\s*120,51|-R\$\s*120,50/)).toBeVisible();

    // Filtro por categoria: selects na ordem [Conta, Categoria]
    const categorySelect = page.locator('select').nth(1);
    await categorySelect.selectOption('Groceries');

    await expect(page.getByRole('cell', { name: 'Mercado E2E' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Salario E2E' })).toBeHidden();
    await expect(page.getByRole('cell', { name: 'Restaurante E2E' })).toBeHidden();
  });
});

import { test, expect } from '@playwright/test';
import { loginWithGoogle } from '../helpers/login';

test.describe('Reembolsos', () => {
  test('cria reembolso, quita parcialmente e depois totalmente', async ({ page }) => {
    await loginWithGoogle(page);

    await page.getByRole('link', { name: /reembolsos/i }).click();
    await page.waitForURL('**/split-reimbursements');

    await expect(page.getByText('Nenhum reembolso cadastrado.')).toBeVisible();

    // Criação com dois participantes
    await page.getByRole('button', { name: '+ Novo reembolso' }).click();
    await page.getByPlaceholder('Ex: Jantar no restaurante').fill('Jantar E2E');
    await page.getByPlaceholder('0,00').fill('300');
    await page.getByPlaceholder('Ex: João').fill('Pedro');

    await page.getByRole('button', { name: '+ Adicionar' }).click();
    const nameInputs = page.getByPlaceholder('Nome');
    const amountInputs = page.getByPlaceholder('Valor (R$)');
    await nameInputs.nth(0).fill('Ana');
    await amountInputs.nth(0).fill('100');
    await nameInputs.nth(1).fill('Bruno');
    await amountInputs.nth(1).fill('100');

    await page.getByRole('button', { name: 'Criar reembolso' }).click();

    await expect(page.getByRole('heading', { name: 'Jantar E2E' })).toBeVisible();
    await expect(page.getByText('Pendente')).toBeVisible();

    // Quita o primeiro participante → parcialmente pago
    await page.getByRole('button', { name: 'Marcar pago' }).first().click();
    await expect(page.getByText('Parcialmente pago')).toBeVisible();

    // Quita o segundo → SETTLED sai da lista
    await page.getByRole('button', { name: 'Marcar pago' }).first().click();
    await expect(page.getByText('Todos os reembolsos já foram quitados.')).toBeVisible();
  });

  test('formulário em lote mostra prévia com um reembolso por mês', async ({ page }) => {
    await loginWithGoogle(page);

    await page.getByRole('link', { name: /reembolsos/i }).click();
    await page.waitForURL('**/split-reimbursements');

    await page.getByRole('button', { name: 'Criar recorrente' }).click();
    await page.getByPlaceholder('Ex: Netflix, Spotify, Internet').fill('Netflix');
    await page.getByPlaceholder('Ex: João').fill('Pedro');
    await page.getByPlaceholder('Nome').first().fill('Ana');
    await page.getByPlaceholder('Valor (R$)').first().fill('20');

    // Período: mês atual até +2 meses → 3 reembolsos na prévia
    const start = new Date();
    const end = new Date(start.getFullYear(), start.getMonth() + 2, 1);
    const selects = page.locator('form select');
    await selects.nth(0).selectOption(String(start.getMonth() + 1));
    await selects.nth(1).selectOption(String(end.getMonth() + 1));
    const yearInputs = page.locator('form input[type="number"]');
    // yearInputs: [startYear, endYear, amount] — o valor (R$) também é number;
    // os dois primeiros na ordem do DOM são os anos
    await yearInputs.nth(0).fill(String(start.getFullYear()));
    await yearInputs.nth(1).fill(String(end.getFullYear()));

    await expect(page.getByText(/Prévia — 3 reembolsos serão criados/)).toBeVisible();

    await page.getByRole('button', { name: /Criar 3 reembolsos/ }).click();
    await expect(page.getByRole('heading', { name: /Netflix — / }).first()).toBeVisible();
  });
});

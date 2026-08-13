import { test, expect } from '@playwright/test';
import { loginWithGoogle } from '../helpers/login';

test.describe('Gastos Fixos', () => {
  test('cria gasto fixo com dia de vencimento e atualiza o total mensal', async ({ page }) => {
    await loginWithGoogle(page);

    await page.getByRole('link', { name: /gastos fixos/i }).click();
    await page.waitForURL('**/expenses');

    await expect(page.getByText('Nenhum gasto fixo cadastrado.')).toBeVisible();

    await page.getByRole('button', { name: '+ Adicionar' }).click();
    await page.getByPlaceholder('Ex: Aluguel').fill('Aluguel E2E');
    await page.getByPlaceholder('0,00').fill('1500');
    await page.getByPlaceholder('Ex: Moradia').fill('Moradia');
    // Regressão: dueDate é o DIA do mês (1–31); antes o form enviava uma data
    // completa e o backend respondia 422
    await page.getByPlaceholder('Ex: 10').fill('10');
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('cell', { name: 'Aluguel E2E' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Mensal' })).toBeVisible();
    await expect(page.getByText(/R\$\s*1\.500,00/).first()).toBeVisible();
  });

  test('desativa gasto fixo pelo toggle e zera o total mensal', async ({ page }) => {
    await loginWithGoogle(page);

    await page.getByRole('link', { name: /gastos fixos/i }).click();
    await page.waitForURL('**/expenses');

    await page.getByRole('button', { name: '+ Adicionar' }).click();
    await page.getByPlaceholder('Ex: Aluguel').fill('Internet E2E');
    await page.getByPlaceholder('0,00').fill('100');
    await page.getByPlaceholder('Ex: Moradia').fill('Serviços');
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('cell', { name: 'Internet E2E' })).toBeVisible();
    await expect(page.getByText(/R\$\s*100,00/).first()).toBeVisible();

    await page.getByRole('switch').click();
    // Total mensal considera apenas gastos ativos
    await expect(page.getByText(/R\$\s*0,00/).first()).toBeVisible();
  });
});

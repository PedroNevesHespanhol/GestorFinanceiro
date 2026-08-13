import { test, expect } from '@playwright/test';
import { loginWithGoogle } from '../helpers/login';

test.describe('Receitas Recorrentes', () => {
  test('cria receita recorrente e exibe na tabela com total mensal', async ({ page }) => {
    await loginWithGoogle(page);

    await page.getByRole('link', { name: /receitas/i }).click();
    await page.waitForURL('**/income');

    await expect(page.getByText('Nenhuma receita cadastrada.')).toBeVisible();

    await page.getByRole('button', { name: '+ Adicionar' }).click();
    await page.getByPlaceholder('Ex: Salário').fill('Salário E2E');
    await page.getByPlaceholder('0,00').fill('5000');
    await page.getByPlaceholder('Ex: Trabalho').fill('Trabalho');
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('cell', { name: 'Salário E2E' })).toBeVisible();
    await expect(page.getByText(/R\$\s*5\.000,00/).first()).toBeVisible();
  });
});

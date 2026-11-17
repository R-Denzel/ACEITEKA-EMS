import { test, expect } from '@playwright/test';

test('results officer can enter marks but cannot access reports', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('results@aceiteka.test');
  await page.getByLabel('Password').fill('Demo-Pass-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20000 });

  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
  await page.goto('/reports');
  await expect(page.getByText('You do not have permission to see this page.')).toBeVisible();

  await page.goto('/results');
  await expect(page.getByRole('heading', { name: 'Enter examination marks' })).toBeVisible();
  await expect(page.getByLabel('Examination session')).toBeVisible();
  await expect(page.getByLabel('School')).toBeVisible();
  await expect(page.getByLabel('Subject')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter on screen' })).toBeVisible();
});

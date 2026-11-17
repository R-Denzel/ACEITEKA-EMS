import { test, expect } from '@playwright/test';

test('staff account can sign in and land on the dashboard', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByText('ACEITEKA Examination System')).toBeVisible();
  await page.getByLabel('Email address').fill('sysadmin@aceiteka.test');
  await page.getByLabel('Password').fill('Demo-Pass-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/$/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText('A quick summary of what is happening across ACEITEKA examinations.')).toBeVisible();
});

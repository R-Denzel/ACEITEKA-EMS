import { test, expect } from '@playwright/test';

test('school account can sign in and access its portal workflows', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByText('ACEITEKA Examination System')).toBeVisible();
  await page.getByLabel('Email address').fill('school1@aceiteka.test');
  await page.getByLabel('Password').fill('Demo-Pass-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/school$/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'My School' })).toBeVisible();
  await expect(page.getByText('St. Mary Secondary School')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Register Students', exact: true })).toBeVisible();

  await page.goto('/school/students');
  await expect(page.getByRole('heading', { name: 'Register Students' })).toBeVisible();
  await expect(page.getByLabel('Examination session')).toContainText('End of Year Examinations 2026');
  await expect(page.getByText('Total uploads')).toBeVisible();
  await expect(page.getByLabel('Filter uploads')).toContainText('Changes requested');

  await page.goto('/school/examiners');
  await expect(page.getByRole('heading', { name: 'Recommend Examiners' })).toBeVisible();
  await expect(page.getByLabel('Subject')).toContainText('Mathematics');
});

import { test, expect } from '@playwright/test';

test('color theme changes across the app and persists after reload', async ({ page }) => {
  await page.goto('/login');
  const theme = page.getByLabel('Color theme');
  const pattern = page.getByLabel('Background pattern');
  await theme.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor)).toBe('rgb(17, 27, 41)');

  await pattern.selectOption('topography');
  await expect(page.locator('html')).toHaveAttribute('data-pattern', 'topography');
  await expect.poll(() => page.locator('body').evaluate((body) => getComputedStyle(body).backgroundImage)).not.toBe('none');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByLabel('Color theme')).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-pattern', 'topography');
  await expect(page.getByLabel('Background pattern')).toHaveValue('topography');

  await page.getByLabel('Background pattern').selectOption('none');
  await expect(page.locator('html')).toHaveAttribute('data-pattern', 'none');
  await page.getByLabel('Color theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByLabel('Color theme').locator('option')).toHaveCount(2);
  await expect(page.getByLabel('Background pattern').locator('option')).toHaveCount(5);
  await expect(page.getByLabel('Email address')).toBeVisible();
});

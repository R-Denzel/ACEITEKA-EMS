import { test, expect } from '@playwright/test';

test('saved color theme and pattern apply on sign-in without exposing theme controls', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('aceiteka-theme', 'dark');
    localStorage.setItem('aceiteka-background-pattern', 'topography');
  });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor)).toBe('rgb(17, 27, 41)');
  await expect(page.locator('html')).toHaveAttribute('data-pattern', 'topography');
  await expect.poll(() => page.locator('body').evaluate((body) => getComputedStyle(body).backgroundImage)).not.toBe('none');
  await expect(page.getByLabel('Color theme')).toHaveCount(0);
  await expect(page.getByLabel('Background pattern')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-pattern', 'topography');
  await expect(page.getByLabel('Color theme')).toHaveCount(0);
  await expect(page.getByLabel('Background pattern')).toHaveCount(0);
  await expect(page.getByLabel('Email address')).toBeVisible();
});

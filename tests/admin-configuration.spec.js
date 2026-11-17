import { test, expect } from '@playwright/test';

async function signIn(page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('examadmin@aceiteka.test');
  await page.getByLabel('Password').fill('Demo-Pass-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20000 });
}

test('admin can target announcements and configure subjects and examination sessions', async ({ page }) => {
  await signIn(page);

  await page.goto('/announcements');
  await page.getByRole('button', { name: 'Create announcement' }).click();
  await page.getByRole('combobox', { name: 'Audience' }).selectOption('DEPARTMENT');
  await page.getByRole('combobox', { name: 'Department' }).selectOption('registration');
  const title = `Registration update ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Announcement').fill('Review school entries before the closing date.');
  await page.getByRole('button', { name: 'Publish announcement' }).click();
  const notice = page.locator('article').filter({ has: page.getByRole('heading', { name: title }) });
  await expect(notice).toContainText('Registration team');
  page.once('dialog', (dialog) => dialog.accept());
  await notice.getByRole('button', { name: 'Remove' }).click();

  await page.goto('/subjects');
  await page.getByRole('button', { name: 'Add a subject' }).click();
  await page.getByRole('checkbox', { name: 'Paper 1' }).check();
  await expect(page.getByLabel('Paper 1 code')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Paper 3' }).check();
  await expect(page.getByLabel('Paper 3 code')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).first().click();

  await page.goto('/sessions');
  await page.getByRole('button', { name: 'Add an examination session' }).click();
  await expect(page.getByLabel('Session name *')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
});

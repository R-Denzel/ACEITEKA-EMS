import { test, expect } from '@playwright/test';

async function signIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('Demo-Pass-2026');
  await page.getByRole('button', { name: 'Sign in' }).click({ force: true });
}

test('examination admin can view the preparation pipeline', async ({ page }) => {
  await signIn(page, 'examadmin@aceiteka.test');
  await expect(page).toHaveURL(/\/$/, { timeout: 20000 });
  await page.goto('/preparation');
  await expect(page.getByRole('heading', { name: 'Examination Preparation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Preparation timetable' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'School entry follow-up' })).toBeVisible();
});

test('exam setter can access only their submission workspace', async ({ page }) => {
  await signIn(page, 'setter@aceiteka.test');
  await expect(page).toHaveURL(/\/setter$/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'Exam Setter Workspace' })).toBeVisible();
  await expect(page.getByLabel('Exam script (PDF or DOCX, up to 20 MB)')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Printing Dashboard' })).toHaveCount(0);
});

test('printing officer sees approved-register print planning', async ({ page }) => {
  await signIn(page, 'printer@aceiteka.test');
  await expect(page).toHaveURL(/\/printer$/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'Printing Dashboard' })).toBeVisible();
  await expect(page.getByText('Approved student register')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Approved candidates' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exam Setter Workspace' })).toHaveCount(0);
});

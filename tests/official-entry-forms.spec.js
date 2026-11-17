import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';

dotenv.config({ path: path.resolve('server/.env') });

let prisma;
let session;
let storedFiles = [];
const schoolName = 'St. Mary Secondary School';

async function signIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('Demo-Pass-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 20000 });
}

async function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const arts = workbook.addWorksheet('ARTS');
  arts.getCell('C1').value = 'ACEITEKA UACE ARTS GENERAL ENTRY FORMS 2024';
  arts.getCell('B3').value = 'SCHOOL NAME';
  arts.getCell('C2').value = 'GENERAL PAPER (S101)';
  arts.getCell('D2').value = 'HISTORY (P210)';
  arts.getCell('C3').value = 1;
  arts.getCell('D3').value = 2;
  arts.getCell('B5').value = schoolName;
  arts.getCell('C5').value = 12;
  arts.getCell('D5').value = 8;
  const sciences = workbook.addWorksheet('SCIENCES');
  sciences.getCell('A1').value = 'ACEITEKA UACE SCIENCE GENERAL ENTRY FORM 2024';
  sciences.getCell('B3').value = 'SCHOOL NAME';
  sciences.getCell('C2').value = 'MATHEMATICS (P425)';
  sciences.getCell('C3').value = 1;
  sciences.getCell('B5').value = schoolName;
  sciences.getCell('C5').value = 10;
  workbook.addWorksheet('ARTS backup').getCell('A1').value = 'Ignored backup';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test.beforeAll(async () => {
  ({ prisma } = await import('../server/src/db.js'));
  session = await prisma.examinationSession.create({
    data: { name: `Browser Official Entry ${Date.now()}`, year: 2024, status: 'PLANNED' },
  });
});

test.afterAll(async () => {
  if (prisma && session) {
    const imports = await prisma.officialEntryImport.findMany({ where: { sessionId: session.id }, select: { storageKey: true } });
    storedFiles = imports.map((item) => item.storageKey);
    await prisma.examinationSession.delete({ where: { id: session.id } });
    const directory = path.resolve(process.env.UPLOAD_DIR || path.join('server', 'uploads'), 'official-entry-forms');
    await Promise.all(storedFiles.map((name) => fs.unlink(path.join(directory, name)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    })));
  }
  if (prisma) await prisma.$disconnect();
});

test('UACE workbook upload is reviewed, approved, and shown in print planning', async ({ page, browser }) => {
  await signIn(page, 'registration@aceiteka.test');
  await page.goto('/official-entry-forms');
  await page.getByLabel('Examination session').selectOption(session.id);
  const suppliedWorkbook = process.env.OFFICIAL_ENTRY_TEST_WORKBOOK;
  await page.locator('input[type="file"]').setInputFiles({
    name: suppliedWorkbook ? path.basename(suppliedWorkbook) : 'sample-uace-entry-2024.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: suppliedWorkbook ? await fs.readFile(suppliedWorkbook) : await createWorkbook(),
  });
  const uploadResponse = page.waitForResponse((response) => response.url().includes('/api/official-entry-imports') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Upload and extract' }).click();
  await expect(page.getByRole('status')).toContainText(suppliedWorkbook
    ? '53 school entry summaries are ready for human review'
    : '1 school entry summary is ready for human review');
  const imported = await (await uploadResponse).json();
  expect(imported.recordCount).toBe(suppliedWorkbook ? 53 : 1);
  if (suppliedWorkbook) return;

  await expect(page.getByText('Download original workbook')).toBeVisible();
  await expect(page.getByText(schoolName)).toBeVisible();
  await page.getByLabel(/I cross-checked all subject and paper counts/).check();
  await page.getByRole('button', { name: 'Save reviewed summary' }).click();
  await expect(page.getByRole('status')).toContainText('Reviewed totals saved');
  await page.getByRole('button', { name: 'Approve reviewed softcopy' }).click();
  await expect(page.getByRole('status')).toContainText('stored as approved softcopy records');
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();

  const printerContext = await browser.newContext();
  try {
    const printerPage = await printerContext.newPage();
    await signIn(printerPage, 'printer@aceiteka.test');
    await printerPage.goto('/printer');
    await printerPage.getByLabel('Examination session').selectOption(session.id);
    await expect(printerPage.getByRole('heading', { name: 'Official form paper counts' })).toBeVisible();
    await expect(printerPage.getByText('P210', { exact: true })).toBeVisible();
    await expect(printerPage.getByText('8', { exact: true })).toBeVisible();
  } finally {
    await printerContext.close();
  }
});

import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { HttpError } from './middleware.js';

export const TEMPLATE_HEADERS = ['registration_number', 'full_name', 'date_of_birth', 'gender', 'subjects'];
export const MAX_ROWS = 5000;

// Decide the file type from its content, not its name.
export function sniffType(buf) {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'xlsx';
  const head = buf.subarray(0, 2000);
  if (head.includes(0)) return null; // binary
  return 'csv';
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

async function parseXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.read(Readable.from(buf)); } catch { throw new HttpError(400, 'We could not read this Excel file. Please use the official template and save it as .xlsx.'); }
  const ws = wb.worksheets[0];
  if (!ws) throw new HttpError(400, 'The Excel file has no sheets.');
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = [];
    for (let c = 1; c <= TEMPLATE_HEADERS.length; c++) {
      let v = r.getCell(c).value;
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      else if (v && typeof v === 'object') v = v.text ?? v.result ?? '';
      vals.push(v == null ? '' : String(v));
    }
    rows.push(vals);
  });
  return rows;
}

// Returns [{ rowNumber, data }] where data uses the template headers.
export async function readStudentFile(buf) {
  const type = sniffType(buf);
  if (!type) throw new HttpError(400, 'This file type is not allowed. Please upload a CSV or Excel (.xlsx) file.');
  const rows = type === 'xlsx' ? await parseXlsx(buf) : parseCsv(buf.toString('utf8'));
  if (rows.length === 0) throw new HttpError(400, 'The file is empty.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = TEMPLATE_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) throw new HttpError(400, `The file does not match the template. Missing column(s): ${missing.join(', ')}. Please download the template again.`);
  const body = rows.slice(1);
  if (body.length === 0) throw new HttpError(400, 'The file has no students in it.');
  if (body.length > MAX_ROWS) throw new HttpError(400, `The file has more than ${MAX_ROWS} rows. Please split it into smaller files.`);
  return body.map((r, i) => ({
    rowNumber: i + 2,
    data: Object.fromEntries(TEMPLATE_HEADERS.map((h) => [h, (r[header.indexOf(h)] ?? '').toString().trim()])),
  }));
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  return d.getUTCFullYear() >= 1950 && d < new Date();
}

/**
 * Validate parsed rows.
 * ctx: { sessionSubjects:Set<code>, groups:[{name,min,max,codes:Set}], takenNumbers:Set<string> }
 * Returns [{ rowNumber, data, errors:[{field,message}] }]
 */
export function validateRows(rows, ctx) {
  const seen = new Map();
  return rows.map(({ rowNumber, data }) => {
    const errors = [];
    const add = (field, message) => errors.push({ field, message });
    const reg = data.registration_number;
    if (!reg) add('registration_number', 'Registration number is missing.');
    else if (!/^[A-Za-z0-9\-\/]{3,30}$/.test(reg)) add('registration_number', 'Registration number may only use letters, numbers, - and /, and must be 3 to 30 characters.');
    else if (seen.has(reg.toUpperCase())) add('registration_number', `This registration number is also used on row ${seen.get(reg.toUpperCase())}.`);
    else if (ctx.takenNumbers.has(reg.toUpperCase())) add('registration_number', 'This registration number is already used by an approved student in this session.');
    if (reg) seen.set(reg.toUpperCase(), seen.get(reg.toUpperCase()) ?? rowNumber);

    if (!data.full_name || data.full_name.length < 2) add('full_name', 'Full name is missing.');
    if (!data.date_of_birth) add('date_of_birth', 'Date of birth is missing. Use the format YYYY-MM-DD, for example 2008-03-25.');
    else if (!validDate(data.date_of_birth)) add('date_of_birth', 'Date of birth is not valid. Use the format YYYY-MM-DD, for example 2008-03-25.');
    if (!['M', 'F'].includes(data.gender.toUpperCase())) add('gender', 'Gender must be M or F.');

    const codes = data.subjects.split(/[;|]/).map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (codes.length === 0) add('subjects', 'No subjects were given. Separate subject codes with a semicolon, for example MATH;ENG;PHY.');
    else {
      const dup = codes.filter((c, i) => codes.indexOf(c) !== i);
      if (dup.length) add('subjects', `Subject ${[...new Set(dup)].join(', ')} is listed more than once.`);
      const bad = codes.filter((c) => !ctx.sessionSubjects.has(c));
      if (bad.length) add('subjects', `Subject code(s) not offered in this examination session: ${[...new Set(bad)].join(', ')}.`);
      else if (!dup.length && ctx.groups.length) {
        const ok = ctx.groups.some((g) => codes.every((c) => g.codes.has(c)) && codes.length >= g.min && codes.length <= g.max);
        if (!ok) add('subjects', 'This combination of subjects is not approved. Choose subjects from one approved subject group (see the list of subject groups).');
      }
    }
    return { rowNumber, data, errors };
  });
}

export function csvEscape(v) { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

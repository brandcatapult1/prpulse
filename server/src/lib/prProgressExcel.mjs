import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { PR_PROGRESS_COLUMNS, TEAM_COLUMNS, asOfLabel } from './prProgress.mjs';

const BANNER = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets/export-banner.jpg');
const FONT = 12;

/**
 * One-sheet workbook: logo banner, title, cycle line, light blue header, centred rows.
 * `widths` add up to roughly the banner's 1160 px so the logo stays centred.
 */
async function buildTableWorkbook({ sheetName, title, cycleLabel, range, columns, widths, rows }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
  ws.columns = widths.map((width) => ({ width }));
  const n = columns.length;

  ws.getRow(1).height = 83;
  const banner = wb.addImage({ filename: BANNER, extension: 'jpeg' });
  ws.addImage(banner, {
    tl: { nativeCol: 0, nativeColOff: 0, nativeRow: 0, nativeRowOff: 0 },
    br: { nativeCol: n, nativeColOff: 0, nativeRow: 1, nativeRowOff: 0 },
    editAs: 'twoCell',
  });

  [[title, { bold: true, size: 18, color: { argb: 'FF1E3A5F' } }, 32],
    [`${cycleLabel}${range ? ` (${range})` : ''}`, { size: 12, color: { argb: 'FF475569' } }, 24]].forEach(([text, font, height], i) => {
    const r = 2 + i;
    ws.mergeCells(r, 1, r, n);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = font;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(r).height = height;
  });

  const head = ws.getRow(5);
  head.values = columns.map((c) => c.label);
  head.height = 44;
  head.eachCell((cell) => {
    cell.font = { bold: true, size: FONT, color: { argb: 'FF1E3A5F' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  rows.forEach((row, i) => {
    const r = ws.getRow(6 + i);
    columns.forEach((c, j) => {
      const cell = r.getCell(j + 1);
      const v = row[c.key];
      cell.value = v === '' || v == null ? '—' : (Number.isNaN(Number(v)) || typeof v === 'string' ? v : Number(v));
      cell.font = { size: FONT };
      cell.alignment = { vertical: 'middle', horizontal: c.align === 'left' ? 'left' : 'center', wrapText: true, indent: c.align === 'left' ? 1 : 0 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
    r.height = 26;
  });
  if (rows.length === 0) {
    ws.mergeCells(6, 1, 6, n);
    const empty = ws.getCell(6, 1);
    empty.value = 'Nothing to show for this cycle';
    empty.font = { size: FONT, color: { argb: 'FF6B7280' } };
    empty.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(6).height = 26;
  }
  return wb.xlsx.writeBuffer();
}

export function buildPrProgressExcel({ rows, cycleLabel, range }) {
  return buildTableWorkbook({
    sheetName: 'PR Progress - Campaign',
    title: `PR Progress Report - As of ${asOfLabel()}`,
    cycleLabel, range,
    columns: PR_PROGRESS_COLUMNS,
    widths: [28, 24, 13, 13, 13, 13, 13, 13, 13, 13],
    rows,
  });
}

export function buildPrProgressTeamExcel({ rows, cycleLabel, range }) {
  return buildTableWorkbook({
    sheetName: 'PR Progress - Team',
    title: `PR Progress - Team - As of ${asOfLabel()}`,
    cycleLabel, range,
    columns: TEAM_COLUMNS,
    widths: [40, 30, 30, 30, 30],
    rows,
  });
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { pickCurrentCycle, mapCycleRow } from './campaignCycles.mjs';
import { formatRange } from './prProgress.mjs';

const LOGO = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets/brand-catapult-logo.png');

/** "Cycle 2 of 6 · 28 Oct – 27 Nov" for the running cycle of a campaign. */
async function cycleLabel(pool, campaignId) {
  const { rows } = await pool.query(
    'SELECT * FROM campaign_cycles WHERE campaign_id = $1 ORDER BY cycle_number', [campaignId],
  );
  const cycles = rows.map(mapCycleRow);
  const cur = pickCurrentCycle(cycles);
  if (!cur) return '—';
  const end = new Date(`${cur.cycle_end}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return `${cur.cycle_number} of ${cycles.length} · ${formatRange(cur.cycle_start, end.toISOString().slice(0, 10))}`;
}

/** Excel sheet of the creators still in "Not contacted" for a campaign. */
export async function buildNotContactedWorkbook(pool, campaignId) {
  const { rows: [campaign] } = await pool.query(
    'SELECT campaign_name FROM campaigns WHERE id = $1', [campaignId],
  );
  if (!campaign) return null;
  const { rows } = await pool.query(
    `SELECT c.full_name, c.instagram_url, s.followers, s.engagement_rate, s.avg_views
     FROM engagements e
     JOIN contacts c ON c.id = e.contact_id
     LEFT JOIN creator_social_stats s ON s.contact_id = c.id AND s.platform = 'instagram'
     WHERE e.campaign_id = $1 AND e.conversation_status::text = 'not_contacted'
     ORDER BY c.full_name`,
    [campaignId],
  );
  const label = await cycleLabel(pool, campaignId);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Not contacted', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 30 }, { width: 14 }, { width: 18 }, { width: 16 }, { width: 48 }];

  ws.getRow(1).height = 60;
  const logo = wb.addImage({ filename: LOGO, extension: 'png' });
  ws.addImage(logo, { tl: { col: 0, row: 0 }, ext: { width: 160, height: 56 } });

  ws.getCell('A2').value = campaign.campaign_name;
  ws.getCell('A2').font = { bold: true, size: 16 };
  ws.getCell('A3').value = `Cycle : ${label}`;
  ws.getCell('A3').font = { size: 11, color: { argb: 'FF52525B' } };

  const head = ws.getRow(5);
  head.values = ['Name', 'Followers', 'Engagement rate', 'Average views', 'Profile link'];
  head.font = { bold: true, color: { argb: 'FF1E3A5F' } };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    cell.alignment = { vertical: 'middle' };
  });
  head.height = 22;

  rows.forEach((r, i) => {
    const row = ws.getRow(6 + i);
    row.getCell(1).value = r.full_name;
    row.getCell(2).value = r.followers != null ? Number(r.followers) : '—';
    row.getCell(3).value = r.engagement_rate != null ? `${Number(r.engagement_rate)}%` : '—';
    row.getCell(4).value = r.avg_views != null ? Math.round(Number(r.avg_views)) : '—';
    row.getCell(5).value = r.instagram_url
      ? { text: r.instagram_url, hyperlink: r.instagram_url }
      : '—';
    if (r.instagram_url) row.getCell(5).font = { color: { argb: 'FF2563EB' }, underline: true };
    row.getCell(2).numFmt = '#,##0';
    row.getCell(4).numFmt = '#,##0';
    [2, 3, 4].forEach((n) => { row.getCell(n).alignment = { horizontal: 'right' }; });
  });
  if (rows.length === 0) ws.getCell('A6').value = 'No creators in Not contacted';

  return { buffer: await wb.xlsx.writeBuffer(), name: campaign.campaign_name };
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const LOGO = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets/export-banner.png');

/** Excel sheet of the creators still in "Not contacted" for a campaign. */
export async function buildNotContactedWorkbook(pool, campaignId) {
  const { rows: [campaign] } = await pool.query(
    `SELECT cam.campaign_name, b.brand_name FROM campaigns cam
     LEFT JOIN brands b ON b.id = cam.brand_id WHERE cam.id = $1`, [campaignId],
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

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Not contacted', { views: [{ showGridLines: false }] });
  // Symmetric around the middle column (46 + 20 = 24 + 42), so the logo in that column sits dead centre.
  ws.columns = [46, 20, 30, 24, 42].map((width) => ({ width }));
  const FONT = 15; // body and header text; 4 larger than Excel's default 11

  ws.getRow(1).height = 82; // room for the banner (109 px)
  const banner = wb.addImage({ filename: LOGO, extension: 'png' });
  // White banner as wide as the table with the logo already centred inside it (see assets/export-banner.png).
  ws.addImage(banner, { tl: { col: 0, row: 0 }, ext: { width: 1159, height: 109 } });

  // Client and campaign, large on a light blue band.
  [['Client', campaign.brand_name ?? '—'], ['Campaign', campaign.campaign_name]].forEach(([label, value], i) => {
    const r = 2 + i;
    ws.mergeCells(r, 1, r, 5);
    const cell = ws.getCell(r, 1);
    cell.value = `${label} : ${value}`;
    cell.font = { bold: true, size: 20, color: { argb: 'FF1E3A5F' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(r).height = 34;
  });

  const head = ws.getRow(5);
  head.values = ['Name', 'Followers', 'Engagement rate', 'Average views', 'Profile link'];
  head.font = { bold: true, size: FONT, color: { argb: 'FF1E3A5F' } };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  head.height = 30;

  rows.forEach((r, i) => {
    const row = ws.getRow(6 + i);
    row.getCell(1).value = r.full_name;
    row.getCell(2).value = r.followers != null ? Number(r.followers) : '—';
    row.getCell(3).value = r.engagement_rate != null ? `${Number(r.engagement_rate)}%` : '—';
    row.getCell(4).value = r.avg_views != null ? Math.round(Number(r.avg_views)) : '—';
    row.getCell(5).value = r.instagram_url
      ? { text: r.instagram_url, hyperlink: r.instagram_url }
      : '—';
    row.getCell(2).numFmt = '#,##0';
    row.getCell(4).numFmt = '#,##0';
    row.height = 26;
    [1, 2, 3, 4, 5].forEach((n) => {
      const cell = row.getCell(n);
      cell.font = n === 5 && r.instagram_url
        ? { size: FONT, color: { argb: 'FF2563EB' }, underline: true }
        : { size: FONT };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  });
  if (rows.length === 0) {
    ws.mergeCells(6, 1, 6, 5);
    const empty = ws.getCell(6, 1);
    empty.value = 'No creators in Not contacted';
    empty.font = { size: FONT, color: { argb: 'FF6B7280' } };
    empty.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(6).height = 26;
  }

  return { buffer: await wb.xlsx.writeBuffer(), brand: campaign.brand_name, name: campaign.campaign_name };
}

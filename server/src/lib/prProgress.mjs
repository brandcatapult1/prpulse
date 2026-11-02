import PDFDocument from 'pdfkit';
import { todayIst } from './constants.mjs';

const STATUS_LABELS = {
  active: 'Ongoing',
  draft: 'Draft',
  paused: 'Paused',
  completed: 'Completed',
};

export const PR_PROGRESS_COLUMNS = [
  { key: 'campaign_name', label: 'Campaign', width: 150, align: 'left' },
  { key: 'managers', label: 'Account manager', width: 130, align: 'left' },
  { key: 'in_conversation', label: 'In Conversation', width: 75, align: 'center' },
  { key: 'scheduled', label: 'Scheduled', width: 65, align: 'center' },
  { key: 'awaiting', label: 'Awaiting Deliverables', width: 85, align: 'center' },
  { key: 'completed', label: 'Completed', width: 65, align: 'center' },
  { key: 'status', label: 'Status', width: 65, align: 'center' },
  { key: 'remaining', label: 'Remaining to complete', width: 80, align: 'center' },
];

/** Cycle numbers that exist on at least one non-archived campaign, and the one running today. */
export async function loadPrProgressCycles(pool) {
  const { rows } = await pool.query(
    `SELECT cc.cycle_number, bool_or(cc.cycle_start <= $1::date) AS started
     FROM campaign_cycles cc JOIN campaigns cam ON cam.id = cc.campaign_id
     WHERE cam.status <> 'archived'
     GROUP BY cc.cycle_number ORDER BY cc.cycle_number`,
    [todayIst()],
  );
  const numbers = rows.map((r) => r.cycle_number);
  const started = rows.filter((r) => r.started).map((r) => r.cycle_number);
  return { cycles: numbers, current: started.length ? Math.max(...started) : (numbers[0] ?? null) };
}

export async function loadPrProgressRows(pool, cycleNumber) {
  const { rows } = await pool.query(
    `SELECT cam.id, cam.campaign_name, cam.status,
            cc.target, cc.completed_collaborations, cc.remaining_collaborations,
            COALESCE((
              SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name)
              FROM campaign_managers cm JOIN users u ON u.id = cm.user_id
              WHERE cm.campaign_id = cam.id
            ), '') AS managers,
            (SELECT count(*) FROM engagements e WHERE e.campaign_id = cam.id
               AND e.conversation_status = 'in_conversation')::int AS in_conversation,
            (SELECT count(*) FROM engagements e WHERE e.campaign_id = cam.id
               AND e.conversation_status = 'scheduled')::int AS scheduled,
            (SELECT count(*) FROM engagements e WHERE e.campaign_id = cam.id
               AND e.conversation_status = 'awaiting_final_deliverables')::int AS awaiting
     FROM campaigns cam
     JOIN campaign_cycles cc ON cc.campaign_id = cam.id AND cc.cycle_number = $1
     WHERE cam.status <> 'archived'
     ORDER BY cam.campaign_name`,
    [cycleNumber],
  );
  return rows.map((r) => {
    const completed = r.completed_collaborations ?? 0;
    return {
      id: r.id,
      campaign_name: r.campaign_name,
      managers: r.managers,
      in_conversation: r.in_conversation,
      scheduled: r.scheduled,
      awaiting: r.awaiting,
      completed,
      status: STATUS_LABELS[r.status] ?? r.status,
      remaining: r.remaining_collaborations ?? Math.max(0, (r.target ?? 0) - completed),
    };
  });
}

export function sortPrProgressRows(rows, key, dir) {
  if (!PR_PROGRESS_COLUMNS.some((c) => c.key === key)) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    const cmp = typeof x === 'number' && typeof y === 'number'
      ? x - y
      : String(x ?? '').localeCompare(String(y ?? ''), undefined, { sensitivity: 'base', numeric: true });
    return cmp * sign || a.campaign_name.localeCompare(b.campaign_name);
  });
}

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

/** "2nd November 2026" */
export function asOfLabel() {
  const [y, m, d] = todayIst().split('-').map(Number);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
  return `${ordinal(d)} ${month} ${y}`;
}

export async function buildPrProgressPdf({ rows, cycleNumber }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 36, right: 36, bottom: 36, left: 36 } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const tableWidth = PR_PROGRESS_COLUMNS.reduce((s, c) => s + c.width, 0);
  const left = (doc.page.width - tableWidth) / 2;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const pad = 5;

  const drawHeader = (y) => {
    doc.font('Helvetica-Bold').fontSize(9);
    const h = 30;
    let x = left;
    for (const col of PR_PROGRESS_COLUMNS) {
      doc.rect(x, y, col.width, h).fillAndStroke('#e5e7eb', '#111827');
      doc.fillColor('#111827').text(col.label, x + pad, y + 5, { width: col.width - pad * 2, align: 'center' });
      x += col.width;
    }
    return y + h;
  };

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827')
    .text(`PR Progress Report - As of ${asOfLabel()}`, left, 36, { width: tableWidth, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
    .text(`Cycle ${cycleNumber}`, left, 58, { width: tableWidth, align: 'center' });

  let y = drawHeader(78);
  doc.font('Helvetica').fontSize(9);
  for (const row of rows) {
    const cells = PR_PROGRESS_COLUMNS.map((c) => String(row[c.key] ?? ''));
    const heights = cells.map((t, i) =>
      doc.heightOfString(t, { width: PR_PROGRESS_COLUMNS[i].width - pad * 2 }));
    const h = Math.max(20, Math.max(...heights) + 10);
    if (y + h > bottom) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
      doc.font('Helvetica').fontSize(9);
    }
    let x = left;
    PR_PROGRESS_COLUMNS.forEach((col, i) => {
      doc.rect(x, y, col.width, h).stroke('#9ca3af');
      doc.fillColor('#111827').text(cells[i], x + pad, y + (h - heights[i]) / 2, {
        width: col.width - pad * 2,
        align: col.align,
      });
      x += col.width;
    });
    y += h;
  }
  if (rows.length === 0) {
    doc.fillColor('#6b7280').text('No campaigns have this cycle.', left, y + 12, { width: tableWidth, align: 'center' });
  }

  doc.end();
  return done;
}

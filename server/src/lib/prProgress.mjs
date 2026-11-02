import PDFDocument from 'pdfkit';
import { todayIst } from './constants.mjs';

const STATUS_LABELS = {
  active: 'Ongoing',
  draft: 'Draft',
  paused: 'Paused',
  completed: 'Completed',
};

export const PR_PROGRESS_COLUMNS = [
  { key: 'campaign_name', label: 'Campaign', width: 115, align: 'left' },
  { key: 'managers', label: 'Account manager', width: 95, align: 'left' },
  { key: 'total', label: 'Target collaboration', width: 66, align: 'center' },
  { key: 'creators', label: 'Creator name', width: 100, align: 'left' },
  { key: 'in_conversation', label: 'In Conversation', width: 64, align: 'center' },
  { key: 'scheduled', label: 'Scheduled', width: 58, align: 'center' },
  { key: 'awaiting', label: 'Awaiting Deliverables', width: 72, align: 'center' },
  { key: 'completed', label: 'Completed', width: 60, align: 'center' },
  { key: 'status', label: 'Status', width: 56, align: 'center' },
  { key: 'remaining', label: 'Remaining to complete', width: 68, align: 'center' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 Nov – 30 Nov 2026" from two YYYY-MM-DD dates (inclusive). */
export function formatRange(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const [sy, sm, sd] = startIso.slice(0, 10).split('-').map(Number);
  const [ey, em, ed] = endIso.slice(0, 10).split('-').map(Number);
  const start = `${sd} ${MONTHS[sm - 1]}${sy === ey ? '' : ` ${sy}`}`;
  return `${start} – ${ed} ${MONTHS[em - 1]} ${ey}`;
}

/** Campaign managers see only campaigns they manage; admins and senior managers see all. */
export function progressScope(user) {
  return user.role === 'admin' || user.role === 'senior_manager' ? null : user.id;
}

const ownCampaignSql = (n) => `($${n}::uuid IS NULL OR EXISTS (
  SELECT 1 FROM campaign_managers mine WHERE mine.campaign_id = cam.id AND mine.user_id = $${n}::uuid))`;
const OWN_CAMPAIGN_SQL = ownCampaignSql(2);

/** Creator-wise deliverables for one campaign (the expanded row). */
export async function loadCampaignCreatorDeliverables(pool, campaignId, onlyUserId = null, managerId = null, creator = null) {
  const { rows } = await pool.query(
    `SELECT e.id AS engagement_id, ct.full_name, mgr.full_name AS manager_name,
            e.conversation_status::text AS stage,
            COALESCE(json_agg(json_build_object(
              'type', d.deliverable_type::text, 'quantity', d.quantity, 'status', d.status::text,
              'due_date', d.due_date, 'published_date', d.published_date, 'content_link', d.content_link
            ) ORDER BY d.created_at) FILTER (WHERE d.id IS NOT NULL), '[]'::json) AS deliverables
     FROM engagements e
     JOIN campaigns cam ON cam.id = e.campaign_id
     JOIN contacts ct ON ct.id = e.contact_id
     LEFT JOIN users mgr ON mgr.id = e.assigned_manager
     LEFT JOIN deliverables d ON d.engagement_id = e.id
     WHERE e.campaign_id = $1::uuid AND ${OWN_CAMPAIGN_SQL}
       AND ($3::uuid IS NULL OR e.assigned_manager = $3::uuid)
       AND ($4::text IS NULL OR ct.full_name ILIKE '%' || $4::text || '%')
     GROUP BY e.id, ct.full_name, mgr.full_name, e.conversation_status
     ORDER BY ct.full_name`,
    [campaignId, onlyUserId, managerId, creator],
  );
  return rows;
}

/** Account managers the viewer can filter by. */
export async function loadPrProgressManagers(pool, onlyUserId = null, campaignId = null) {
  const { rows } = await pool.query(
    `SELECT u.id, u.full_name,
            bool_or($2::uuid IS NOT NULL AND cam.id = $2::uuid) AS in_campaign
     FROM campaign_managers cm
     JOIN campaigns cam ON cam.id = cm.campaign_id
     JOIN users u ON u.id = cm.user_id
     WHERE cam.status <> 'archived' AND ${ownCampaignSql(1)}
     GROUP BY u.id, u.full_name
     ORDER BY u.full_name`,
    [onlyUserId, campaignId],
  );
  return rows;
}

/** Campaigns the viewer may pick in the filter. */
export async function loadPrProgressCampaigns(pool, onlyUserId = null) {
  const { rows } = await pool.query(
    `SELECT cam.id, cam.campaign_name FROM campaigns cam
     WHERE cam.status <> 'archived' AND ${ownCampaignSql(1)}
     ORDER BY cam.campaign_name`,
    [onlyUserId],
  );
  return rows;
}

/**
 * Cycle choices, like the Reports page: only cycles that have started.
 * For one campaign: "Cycle 2 of 12 (28 Nov – 27 Dec)" and the running cycle is the default.
 * For all campaigns: "Current cycle" (each campaign's own running cycle) plus cycle numbers.
 */
export async function loadPrProgressCycles(pool, onlyUserId = null, campaignId = null) {
  const today = todayIst();
  if (campaignId) {
    const { rows } = await pool.query(
      `SELECT cc.cycle_number, cc.cycle_start::text AS start_date, (cc.cycle_end - 1)::text AS end_date,
              (cc.cycle_start <= $3::date AND $3::date < cc.cycle_end) AS running,
              cam.campaign_type, cam.term_months
       FROM campaign_cycles cc JOIN campaigns cam ON cam.id = cc.campaign_id
       WHERE cam.id = $1::uuid AND cam.status <> 'archived' AND ${OWN_CAMPAIGN_SQL}
         AND cc.cycle_start <= $3::date
       ORDER BY cc.cycle_number`,
      [campaignId, onlyUserId, today],
    );
    const cycles = rows.map((r) => {
      const of = r.campaign_type === 'monthly' && r.term_months ? ` of ${r.term_months}` : '';
      return {
        number: r.cycle_number,
        label: `Cycle ${r.cycle_number}${of}`,
        range: formatRange(r.start_date, r.end_date),
      };
    });
    const running = rows.find((r) => r.running) ?? rows[rows.length - 1];
    return { cycles, current: running ? running.cycle_number : null };
  }

  const { rows } = await pool.query(
    `SELECT cc.cycle_number
     FROM campaign_cycles cc JOIN campaigns cam ON cam.id = cc.campaign_id
     WHERE cam.status <> 'archived' AND ${OWN_CAMPAIGN_SQL} AND cc.cycle_start <= $1::date
     GROUP BY cc.cycle_number ORDER BY cc.cycle_number`,
    [today, onlyUserId],
  );
  return {
    cycles: [
      { number: 'current', label: 'Current cycle', range: "each campaign's running cycle" },
      ...rows.map((r) => ({ number: r.cycle_number, label: `Cycle ${r.cycle_number}`, range: '' })),
    ],
    current: 'current',
  };
}

/**
 * cycleNumber = a number → that cycle of every campaign that has it.
 * cycleNumber = null → each campaign's own running cycle (the one that includes today).
 */
export async function loadPrProgressRows(pool, cycleNumber, onlyUserId = null, campaignId = null, managerId = null, creator = null) {
  const { rows } = await pool.query(
    `SELECT cam.id, cam.campaign_name, cam.status,
            cc.target, cc.completed_collaborations, cc.remaining_collaborations,
            COALESCE((
              SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name)
              FROM campaign_managers cm JOIN users u ON u.id = cm.user_id
              WHERE cm.campaign_id = cam.id
            ), '') AS managers,
            (SELECT count(*) FROM campaign_managers cm WHERE cm.campaign_id = cam.id)::int AS manager_count,
            COALESCE((
              SELECT string_agg(ct.full_name, ', ' ORDER BY ct.full_name)
              FROM engagements e JOIN contacts ct ON ct.id = e.contact_id
              WHERE e.campaign_id = cam.id AND e.conversation_status::text NOT LIKE 'dropped%'
                AND ($5::uuid IS NULL OR e.assigned_manager = $5::uuid)
                AND ($6::text IS NULL OR ct.full_name ILIKE '%' || $6::text || '%')
            ), '') AS creators,
            (SELECT count(*) FROM engagements e WHERE e.campaign_id = cam.id
               AND e.conversation_status = 'in_conversation'
                 AND ($5::uuid IS NULL OR e.assigned_manager = $5::uuid)
                 AND ($6::text IS NULL OR EXISTS (
                   SELECT 1 FROM contacts cn WHERE cn.id = e.contact_id AND cn.full_name ILIKE '%' || $6::text || '%')))::int AS in_conversation,
            (SELECT count(*) FROM engagements e WHERE e.campaign_id = cam.id
               AND e.conversation_status = 'scheduled'
                 AND ($5::uuid IS NULL OR e.assigned_manager = $5::uuid)
                 AND ($6::text IS NULL OR EXISTS (
                   SELECT 1 FROM contacts cn WHERE cn.id = e.contact_id AND cn.full_name ILIKE '%' || $6::text || '%')))::int AS scheduled,
            (SELECT count(*) FROM engagements e WHERE e.campaign_id = cam.id
               AND e.conversation_status = 'awaiting_final_deliverables'
                 AND ($5::uuid IS NULL OR e.assigned_manager = $5::uuid)
                 AND ($6::text IS NULL OR EXISTS (
                   SELECT 1 FROM contacts cn WHERE cn.id = e.contact_id AND cn.full_name ILIKE '%' || $6::text || '%')))::int AS awaiting
     FROM campaigns cam
     JOIN LATERAL (
       SELECT c.* FROM campaign_cycles c
       WHERE c.campaign_id = cam.id AND ($1::int IS NULL OR c.cycle_number = $1::int)
       ORDER BY (c.cycle_start <= $3::date AND $3::date < c.cycle_end) DESC,
                (c.cycle_start <= $3::date) DESC,
                CASE WHEN c.cycle_start <= $3::date THEN -c.cycle_number ELSE c.cycle_number END
       LIMIT 1
     ) cc ON true
     WHERE cam.status <> 'archived' AND ${OWN_CAMPAIGN_SQL}
       AND ($4::uuid IS NULL OR cam.id = $4::uuid)
       AND ($5::uuid IS NULL OR EXISTS (
         SELECT 1 FROM campaign_managers pm WHERE pm.campaign_id = cam.id AND pm.user_id = $5::uuid))
       AND ($6::text IS NULL OR EXISTS (
         SELECT 1 FROM engagements fe JOIN contacts fc ON fc.id = fe.contact_id
         WHERE fe.campaign_id = cam.id AND fc.full_name ILIKE '%' || $6::text || '%'
           AND ($5::uuid IS NULL OR fe.assigned_manager = $5::uuid)))
     ORDER BY cam.campaign_name`,
    [cycleNumber, onlyUserId, todayIst(), campaignId, managerId, creator],
  );
  return rows.map((r) => {
    const completed = r.completed_collaborations ?? 0;
    return {
      id: r.id,
      campaign_name: r.campaign_name,
      managers: r.managers,
      manager_count: r.manager_count,
      total: r.target ?? 0,
      creators: r.creators,
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

const STAGE_LABELS = {
  not_contacted: 'Not contacted',
  in_conversation: 'In conversation',
  scheduled: 'Scheduled',
  no_response: 'No response',
  awaiting_final_deliverables: 'Awaiting deliverables',
  collaboration_complete: 'Completed',
};
const TYPE_LABELS = { reel: 'Reel', story: 'Story', static_carousel_post: 'Post / Carousel', other: 'Other' };

function shortDate(iso) {
  if (!iso) return '';
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function deliverableLine(d) {
  const type = `${TYPE_LABELS[d.type] ?? d.type}${d.quantity > 1 ? ` x${d.quantity}` : ''}`;
  if (d.status === 'posted') return `${type} - Posted${d.published_date ? ` ${shortDate(d.published_date)}` : ''}`;
  const status = `${d.status[0].toUpperCase()}${d.status.slice(1)}`;
  return `${type} - ${status}${d.due_date ? ` (due ${shortDate(d.due_date)})` : ''}`;
}

const DETAIL_COLUMNS = [
  { label: 'Creator', width: 130 },
  { label: 'Account manager', width: 120 },
  { label: 'Stage', width: 95 },
  { label: 'Posted', width: 50, align: 'center' },
  { label: 'Deliverables', width: 343 },
];

/** Rows may carry `details` (creator-wise deliverables) for campaigns that were expanded on screen. */
export async function buildPrProgressPdf({ rows, cycleLabel, range = '' }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 36, right: 36, bottom: 36, left: 36 } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const tableWidth = PR_PROGRESS_COLUMNS.reduce((s, c) => s + c.width, 0);
  const left = (doc.page.width - tableWidth) / 2;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const pad = 5;
  const indent = 16;

  const drawHeader = (y) => {
    doc.font('Helvetica-Bold').fontSize(7.5);
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
    .text(`${cycleLabel}${range ? ` (${range})` : ''}`, left, 58, { width: tableWidth, align: 'center' });

  let y = drawHeader(78);
  const newPage = () => {
    doc.addPage();
    y = drawHeader(doc.page.margins.top);
    doc.font('Helvetica').fontSize(9);
  };

  doc.font('Helvetica').fontSize(9);
  for (const row of rows) {
    const cells = PR_PROGRESS_COLUMNS.map((c) => String(row[c.key] ?? ''));
    const heights = cells.map((t, i) =>
      doc.heightOfString(t, { width: PR_PROGRESS_COLUMNS[i].width - pad * 2 }));
    const h = Math.max(20, Math.max(...heights) + 10);
    if (y + h > bottom) newPage();
    let x = left;
    PR_PROGRESS_COLUMNS.forEach((col, i) => {
      if (row.manager_count > 1) doc.rect(x, y, col.width, h).fillAndStroke('#fef3c7', '#9ca3af');
      else doc.rect(x, y, col.width, h).stroke('#9ca3af');
      doc.fillColor('#111827').text(cells[i], x + pad, y + (h - heights[i]) / 2, {
        width: col.width - pad * 2,
        align: col.align,
      });
      x += col.width;
    });
    y += h;

    if (row.details) {
      const dLeft = left + indent;
      const drawDetailHeader = () => {
        doc.font('Helvetica-Bold').fontSize(8);
        let dx = dLeft;
        for (const col of DETAIL_COLUMNS) {
          doc.rect(dx, y, col.width, 18).fillAndStroke('#f3f4f6', '#9ca3af');
          doc.fillColor('#374151').text(col.label, dx + pad, y + 5, { width: col.width - pad * 2, align: col.align ?? 'left' });
          dx += col.width;
        }
        y += 18;
        doc.font('Helvetica').fontSize(8);
      };
      if (row.details.length === 0) {
        if (y + 20 > bottom) newPage();
        doc.rect(dLeft, y, tableWidth - indent, 20).stroke('#9ca3af');
        doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
          .text('No creators for this selection.', dLeft + pad, y + 6, { width: tableWidth - indent - pad * 2 });
        y += 20;
      } else {
        if (y + 18 + 20 > bottom) newPage();
        drawDetailHeader();
        for (const c of row.details) {
          const lines = c.deliverables.length ? c.deliverables.map(deliverableLine).join('\n') : '-';
          const posted = `${c.deliverables.filter((d) => d.status === 'posted').length}/${c.deliverables.length}`;
          const vals = [c.full_name, c.manager_name ?? '-', STAGE_LABELS[c.stage] ?? (String(c.stage).startsWith('dropped') ? 'Dropped' : c.stage), posted, lines];
          doc.font('Helvetica').fontSize(8);
          const hs = vals.map((t, i) => doc.heightOfString(String(t), { width: DETAIL_COLUMNS[i].width - pad * 2 }));
          const dh = Math.max(18, Math.max(...hs) + 8);
          if (y + dh > bottom) { newPage(); drawDetailHeader(); }
          let dx = dLeft;
          DETAIL_COLUMNS.forEach((col, i) => {
            doc.rect(dx, y, col.width, dh).stroke('#d1d5db');
            doc.fillColor('#111827').text(String(vals[i]), dx + pad, y + 4, { width: col.width - pad * 2, align: col.align ?? 'left' });
            dx += col.width;
          });
          y += dh;
        }
      }
      y += 6;
      doc.font('Helvetica').fontSize(9);
    }
  }
  if (rows.length === 0) {
    doc.fillColor('#6b7280').text('No campaigns have this cycle.', left, y + 12, { width: tableWidth, align: 'center' });
  }

  doc.end();
  return done;
}

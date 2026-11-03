import PDFDocument from 'pdfkit';
import { todayIst } from './constants.mjs';

const STATUS_LABELS = {
  active: 'Ongoing',
  draft: 'Draft',
  paused: 'Paused',
  completed: 'Completed',
};

export const PR_PROGRESS_COLUMNS = [
  { key: 'campaign_name', label: 'Campaign', width: 135, align: 'left' },
  { key: 'managers', label: 'Account manager', width: 115, align: 'left' },
  { key: 'total', label: 'Target collaboration', width: 60, align: 'center' },
  { key: 'in_conversation', label: 'In Conversation', width: 56, align: 'center' },
  { key: 'scheduled', label: 'Scheduled', width: 52, align: 'center' },
  { key: 'awaiting', label: 'Awaiting Deliverables', width: 64, align: 'center' },
  { key: 'completed', label: 'Completed', width: 56, align: 'center' },
  { key: 'balance_prev', label: 'Balance from last month', width: 72, align: 'center' },
  { key: 'status', label: 'Status', width: 62, align: 'center' },
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

/**
 * SQL for "the cycle of campaign `cam` to report on".
 * A cycle number → that cycle. Otherwise the campaign's running cycle, or `back` cycles before it
 * (back = 1 is the previous cycle; campaigns without such a cycle drop out).
 * Arguments are the parameter indexes of: cycle number, today (date), back (int).
 */
const cyclePick = (num, today, back) => `
  SELECT c.* FROM campaign_cycles c
  WHERE c.campaign_id = cam.id AND (
    ($${num}::int IS NOT NULL AND c.cycle_number = $${num}::int)
    OR ($${num}::int IS NULL AND c.cycle_number = (
      SELECT r.cycle_number FROM campaign_cycles r WHERE r.campaign_id = cam.id
      ORDER BY (r.cycle_start <= $${today}::date AND $${today}::date < r.cycle_end) DESC,
               (r.cycle_start <= $${today}::date) DESC,
               CASE WHEN r.cycle_start <= $${today}::date THEN -r.cycle_number ELSE r.cycle_number END
      LIMIT 1
    ) - $${back}::int)
  )
  LIMIT 1`;

/** Creator-wise deliverables for one campaign (the expanded row). */
export async function loadCampaignCreatorDeliverables(pool, campaignId, onlyUserId = null, managerId = null, creator = null, before = null, prevStart = null) {
  const { rows } = await pool.query(
    `SELECT e.id AS engagement_id, ct.full_name, mgr.full_name AS manager_name,
            e.conversation_status::text AS stage,
            COALESCE(json_agg(json_build_object(
              'type', d.deliverable_type::text, 'quantity', d.quantity, 'status', d.status::text,
              'due_date', d.due_date, 'published_date', d.published_date, 'content_link', d.content_link,
              'carried', (d.status <> 'posted' AND e.conversation_status::text NOT LIKE 'dropped%'
                          AND $5::date IS NOT NULL
                          AND COALESCE(d.due_date, (e.created_at AT TIME ZONE 'Asia/Kolkata')::date) < $5::date)
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
    [campaignId, onlyUserId, managerId, creator, before],
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
  const options = [
    { number: 'current', label: 'Current cycle', range: "each campaign's running cycle" },
    { number: 'previous', label: 'Previous cycle', range: "the cycle before each campaign's running one" },
  ];
  if (!campaignId) return { cycles: options, current: 'current' };

  // One campaign: show the real date ranges of its current and previous cycle.
  const { rows } = await pool.query(
    `SELECT cc.cycle_number, cc.cycle_start::text AS start_date, (cc.cycle_end - 1)::text AS end_date,
            (cc.cycle_start <= $3::date AND $3::date < cc.cycle_end) AS running
     FROM campaign_cycles cc JOIN campaigns cam ON cam.id = cc.campaign_id
     WHERE cam.id = $1::uuid AND cam.status <> 'archived' AND ${OWN_CAMPAIGN_SQL}
       AND cc.cycle_start <= $3::date
     ORDER BY cc.cycle_number`,
    [campaignId, onlyUserId, today],
  );
  const runIdx = Math.max(0, rows.findIndex((r) => r.running) >= 0 ? rows.findIndex((r) => r.running) : rows.length - 1);
  const cur = rows[runIdx];
  const prev = runIdx > 0 ? rows[runIdx - 1] : null;
  const rangeOf = (r) => (r ? formatRange(r.start_date, r.end_date) : '');
  return {
    cycles: [
      { number: 'current', label: 'Current cycle', range: rangeOf(cur) },
      ...(prev ? [{ number: 'previous', label: 'Previous cycle', range: rangeOf(prev) }] : []),
    ],
    current: 'current',
  };
}

/**
 * cycleNumber = a number → that cycle of every campaign that has it.
 * cycleNumber = null → each campaign's own running cycle (the one that includes today).
 */
export async function loadPrProgressRows(pool, cycleNumber, onlyUserId = null, campaignId = null, managerId = null, creator = null, back = 0) {
  const { rows } = await pool.query(
    `SELECT cam.id, cam.campaign_name, cam.status,
            cc.target, cc.completed_collaborations, cc.remaining_collaborations,
            cc.cycle_start::text AS cycle_start,
            (SELECT count(*) FROM deliverables d JOIN engagements e ON e.id = d.engagement_id
              WHERE e.campaign_id = cam.id AND d.status <> 'posted'
                AND e.conversation_status::text NOT LIKE 'dropped%'
                AND COALESCE(d.due_date, (e.created_at AT TIME ZONE 'Asia/Kolkata')::date) < cc.cycle_start
                AND ($5::uuid IS NULL OR e.assigned_manager = $5::uuid)
                AND ($6::text IS NULL OR EXISTS (
                  SELECT 1 FROM contacts bc WHERE bc.id = e.contact_id AND bc.full_name ILIKE '%' || $6::text || '%'))
            )::int AS balance_prev,
            COALESCE((
              SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name)
              FROM campaign_managers cm JOIN users u ON u.id = cm.user_id
              WHERE cm.campaign_id = cam.id
                AND ($5::uuid IS NULL OR cm.user_id = $5::uuid)
                AND ($6::text IS NULL OR EXISTS (
                  SELECT 1 FROM engagements me JOIN contacts mc ON mc.id = me.contact_id
                  WHERE me.campaign_id = cam.id AND me.assigned_manager = cm.user_id
                    AND mc.full_name ILIKE '%' || $6::text || '%'))
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
     JOIN LATERAL (${cyclePick(1, 3, 7)}) cc ON true
     WHERE cam.status <> 'archived' AND ${OWN_CAMPAIGN_SQL}
       AND ($4::uuid IS NULL OR cam.id = $4::uuid)
       AND ($5::uuid IS NULL OR EXISTS (
         SELECT 1 FROM campaign_managers pm WHERE pm.campaign_id = cam.id AND pm.user_id = $5::uuid))
       AND ($6::text IS NULL OR EXISTS (
         SELECT 1 FROM engagements fe JOIN contacts fc ON fc.id = fe.contact_id
         WHERE fe.campaign_id = cam.id AND fc.full_name ILIKE '%' || $6::text || '%'
           AND ($5::uuid IS NULL OR fe.assigned_manager = $5::uuid)))
     ORDER BY cam.campaign_name`,
    [cycleNumber, onlyUserId, todayIst(), campaignId, managerId, creator, back],
  );
  return rows.map((r) => {
    const completed = r.completed_collaborations ?? 0;
    return {
      id: r.id,
      campaign_name: r.campaign_name,
      managers: r.managers,
      manager_count: r.manager_count,
      cycle_start: r.cycle_start,
      balance_prev: r.balance_prev,
      total: r.target ?? 0,
      creators: r.creators,
      in_conversation: r.in_conversation,
      scheduled: r.scheduled,
      awaiting: r.awaiting,
      completed,
      status: STATUS_LABELS[r.status] ?? r.status,
      // Cycle target still to do, plus what was left over from earlier cycles.
      remaining: (r.remaining_collaborations ?? Math.max(0, (r.target ?? 0) - completed)) + (r.balance_prev ?? 0),
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
  { label: 'Deliverables', width: 329 },
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
    const h = 34;
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
      doc.rect(x, y, col.width, h).stroke('#9ca3af');
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
          const current = c.deliverables.filter((d) => !d.carried);
          const lines = current.length ? current.map(deliverableLine).join('\n') : '-';
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

        // Deliverables left over from earlier cycles, under their own heading.
        const carried = row.details.flatMap((c) =>
          c.deliverables.filter((d) => d.carried).map((d) => ({ creator: c.full_name, manager: c.manager_name, d })));
        if (carried.length) {
          if (y + 16 + 18 + 20 > bottom) newPage();
          y += 4;
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#92400e')
            .text(`Balance from previous cycles (${carried.length})`, dLeft, y, { width: tableWidth - indent });
          y += 14;
          const CARRY_COLS = [
            { label: 'Creator', width: 130 }, { label: 'Account manager', width: 120 },
            { label: 'Deliverable', width: 220 }, { label: 'Was due', width: 90 }, { label: 'Status', width: 164 },
          ];
          const drawCarryHeader = () => {
            doc.font('Helvetica-Bold').fontSize(8);
            let dx = dLeft;
            for (const col of CARRY_COLS) {
              doc.rect(dx, y, col.width, 18).fillAndStroke('#fef3c7', '#9ca3af');
              doc.fillColor('#374151').text(col.label, dx + pad, y + 5, { width: col.width - pad * 2 });
              dx += col.width;
            }
            y += 18;
            doc.font('Helvetica').fontSize(8);
          };
          drawCarryHeader();
          for (const item of carried) {
            const vals = [
              item.creator, item.manager ?? '-',
              `${TYPE_LABELS[item.d.type] ?? item.d.type}${item.d.quantity > 1 ? ` x${item.d.quantity}` : ''}`,
              item.d.due_date ? shortDate(item.d.due_date) : '-',
              `${item.d.status[0].toUpperCase()}${item.d.status.slice(1)}`,
            ];
            const hs = vals.map((t, i) => doc.heightOfString(String(t), { width: CARRY_COLS[i].width - pad * 2 }));
            const dh = Math.max(18, Math.max(...hs) + 8);
            if (y + dh > bottom) { newPage(); drawCarryHeader(); }
            let dx = dLeft;
            CARRY_COLS.forEach((col, i) => {
              doc.rect(dx, y, col.width, dh).stroke('#d1d5db');
              doc.fillColor('#111827').text(String(vals[i]), dx + pad, y + 4, { width: col.width - pad * 2 });
              dx += col.width;
            });
            y += dh;
          }
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

export const TEAM_COLUMNS = [
  { key: 'manager_name', label: 'Account manager', width: 230 },
  { key: 'campaigns', label: 'Campaigns', width: 80, align: 'center' },
  { key: 'not_contacted', label: 'Not contacted', width: 85, align: 'center' },
  { key: 'in_conversation', label: 'In conversation', width: 90, align: 'center' },
  { key: 'scheduled', label: 'Scheduled', width: 80, align: 'center' },
  { key: 'awaiting', label: 'Awaiting final deliverables', width: 125, align: 'center' },
  { key: 'completed', label: 'Completed', width: 80, align: 'center' },
  { key: 'balance_prev', label: 'Balance from previous cycles', width: 125, align: 'center' },
];

/**
 * One row per active team member (zeros included) across their non-archived campaigns.
 * cycleNumber = a number → that cycle of every campaign that has it; null → each campaign's running cycle.
 * "Completed" counts the manager's creators whose collaboration was completed inside that cycle.
 */
export async function loadPrProgressTeamRows(pool, cycleNumber, back = 0) {
  const { rows } = await pool.query(
    `WITH per AS (
       SELECT cam.id AS campaign_id, cm.user_id, cc.cycle_start, cc.cycle_end
       FROM campaigns cam
       JOIN campaign_managers cm ON cm.campaign_id = cam.id
       JOIN LATERAL (${cyclePick(1, 2, 3)}) cc ON true
       WHERE cam.status <> 'archived'
     )
     SELECT u.id, u.full_name AS manager_name,
            count(DISTINCT per.campaign_id)::int AS campaigns,
            count(e.id) FILTER (WHERE e.conversation_status::text NOT LIKE 'dropped%')::int AS creators,
            count(e.id) FILTER (WHERE e.conversation_status = 'not_contacted')::int AS not_contacted,
            COALESCE(sum(dl.qty) FILTER (WHERE e.conversation_status = 'not_contacted'), 0)::int AS not_contacted_deliv,
            count(e.id) FILTER (WHERE e.conversation_status = 'in_conversation')::int AS in_conversation,
            COALESCE(sum(dl.qty) FILTER (WHERE e.conversation_status = 'in_conversation'), 0)::int AS in_conversation_deliv,
            count(e.id) FILTER (WHERE e.conversation_status = 'scheduled')::int AS scheduled,
            COALESCE(sum(dl.qty) FILTER (WHERE e.conversation_status = 'scheduled'), 0)::int AS scheduled_deliv,
            count(e.id) FILTER (WHERE e.conversation_status = 'awaiting_final_deliverables')::int AS awaiting,
            COALESCE(sum(dl.qty) FILTER (WHERE e.conversation_status = 'awaiting_final_deliverables'), 0)::int AS awaiting_deliv,
            count(e.id) FILTER (WHERE fn_engagement_counted(e.id) AND e.completed_at IS NOT NULL
              AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= per.cycle_start
              AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date < per.cycle_end)::int AS completed,
            COALESCE(sum(dl.qty) FILTER (WHERE fn_engagement_counted(e.id) AND e.completed_at IS NOT NULL
              AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date >= per.cycle_start
              AND (e.completed_at AT TIME ZONE 'Asia/Kolkata')::date < per.cycle_end), 0)::int AS completed_deliv,
            (SELECT count(*) FROM deliverables d
               JOIN engagements e2 ON e2.id = d.engagement_id
               JOIN per p2 ON p2.campaign_id = e2.campaign_id AND p2.user_id = u.id
              WHERE e2.assigned_manager = u.id AND d.status <> 'posted'
                AND e2.conversation_status::text NOT LIKE 'dropped%'
                AND COALESCE(d.due_date, (e2.created_at AT TIME ZONE 'Asia/Kolkata')::date) < p2.cycle_start
            )::int AS balance_prev
     FROM users u
     LEFT JOIN per ON per.user_id = u.id
     LEFT JOIN engagements e ON e.campaign_id = per.campaign_id AND e.assigned_manager = u.id
     LEFT JOIN LATERAL (
       SELECT COALESCE(sum(d.quantity), 0) AS qty FROM deliverables d WHERE d.engagement_id = e.id
     ) dl ON true
     WHERE u.is_active AND u.role IN ('campaign_manager', 'senior_manager', 'admin')
     GROUP BY u.id, u.full_name
     ORDER BY u.full_name`,
    [cycleNumber, todayIst(), back],
  );
  return rows;
}

export function sortTeamRows(rows, key, dir) {
  if (!TEAM_COLUMNS.some((c) => c.key === key)) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    const cmp = typeof x === 'number' && typeof y === 'number'
      ? x - y
      : String(x ?? '').localeCompare(String(y ?? ''), undefined, { sensitivity: 'base' });
    return cmp * sign || a.manager_name.localeCompare(b.manager_name);
  });
}

export async function buildPrProgressTeamPdf({ rows, cycleLabel, range = '' }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 36, right: 36, bottom: 36, left: 36 } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const tableWidth = TEAM_COLUMNS.reduce((s, c) => s + c.width, 0);
  const left = (doc.page.width - tableWidth) / 2;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const pad = 5;

  const drawHeader = (y) => {
    doc.font('Helvetica-Bold').fontSize(7.5);
    const h = 34;
    let x = left;
    for (const col of TEAM_COLUMNS) {
      doc.rect(x, y, col.width, h).fillAndStroke('#e5e7eb', '#111827');
      doc.fillColor('#111827').text(col.label, x + pad, y + 5, { width: col.width - pad * 2, align: 'center' });
      x += col.width;
    }
    return y + h;
  };

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827')
    .text(`PR Progress - Team - As of ${asOfLabel()}`, left, 36, { width: tableWidth, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
    .text(`${cycleLabel}${range ? ` (${range})` : ''}`, left, 58, { width: tableWidth, align: 'center' });

  let y = drawHeader(78);
  doc.font('Helvetica').fontSize(9);
  for (const row of rows) {
    if (y + 22 > bottom) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
      doc.font('Helvetica').fontSize(9);
    }
    let x = left;
    for (const col of TEAM_COLUMNS) {
      doc.rect(x, y, col.width, 22).stroke('#9ca3af');
      const dv = row[`${col.key}_deliv`];
      const text = dv > 0 ? `${row[col.key]}  (${dv} deliverables)` : String(row[col.key] ?? '');
      doc.fillColor('#111827').text(text, x + pad, y + 7, { width: col.width - pad * 2, align: col.align });
      x += col.width;
    }
    y += 22;
  }
  if (rows.length === 0) {
    doc.fillColor('#6b7280').text('No account managers have this cycle.', left, y + 12, { width: tableWidth, align: 'center' });
  }
  doc.end();
  return done;
}

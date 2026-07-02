import PDFDocument from 'pdfkit';

const IST = 'Asia/Kolkata';

function safeIsoDate(value) {
  if (!value) return null;
  const iso = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return iso;
}

function formatIstDate(value) {
  const iso = safeIsoDate(value);
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function cycleRangeLabel(cycle) {
  const start = safeIsoDate(cycle?.cycle_start);
  const endExclusive = safeIsoDate(cycle?.cycle_end);
  if (!start || !endExclusive) return '';
  const end = new Date(`${endExclusive}T12:00:00`);
  if (Number.isNaN(end.getTime())) return '';
  end.setDate(end.getDate() - 1);
  const endIso = safeIsoDate(end.toISOString());
  const startLabel = formatIstDate(start);
  const endLabel = formatIstDate(endIso);
  if (!startLabel || !endLabel) return '';
  return `${startLabel} – ${endLabel}`;
}

async function fetchBuffer(url, timeoutMs = 12000) {
  if (!url) return null;
  try {
    if (String(url).startsWith('data:')) {
      const match = String(url).match(/^data:.*?;base64,(.*)$/);
      if (!match) return null;
      return Buffer.from(match[1], 'base64');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function drawStatCard(doc, x, y, width, label, value) {
  const h = 56;
  doc.roundedRect(x, y, width, h, 6).fillAndStroke('#f8fafc', '#e4e7ec');
  doc.fillColor('#667085').fontSize(8).text(label, x + 8, y + 8, { width: width - 16 });
  doc.fillColor('#101828').font('Helvetica-Bold').fontSize(16).text(String(value), x + 8, y + 24, {
    width: width - 16,
  });
  doc.font('Helvetica');
}

function ensurePageSpace(doc, neededHeight) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

function sectionTitle(doc, title) {
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#101828').text(title);
  doc.moveDown(0.2);
  doc.font('Helvetica');
}

function fileSafe(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function reportPdfFileName(report) {
  const brand = fileSafe(report?.brand?.brand_name) || 'brand';
  const campaign = fileSafe(report?.campaign?.campaign_name) || 'campaign';
  const cycleNum = Number(report?.cycle?.cycle_number) || 1;
  return `${brand}-${campaign}-cycle-${cycleNum}-report.pdf`;
}

export async function buildCycleReportPdf({ report, logoUrl }) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 36, right: 42, bottom: 42, left: 42 },
  });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const logoBuffer = await fetchBuffer(logoUrl, 8000);
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, doc.page.margins.left, doc.y, { fit: [140, 38] });
      doc.y += 42;
    } catch {
      doc.fontSize(10).fillColor('#667085').text('Brand Catapult');
      doc.moveDown(0.5);
    }
  } else {
    doc.fontSize(10).fillColor('#667085').text('Brand Catapult');
    doc.moveDown(0.5);
  }

  const cycleLabel = report?.campaign?.campaign_type === 'monthly' && Number(report?.campaign?.term_months)
    ? `Cycle ${report.cycle.cycle_number} of ${Number(report.campaign.term_months)}`
    : `Cycle ${report?.cycle?.cycle_number ?? '—'}`;
  const title = `${report.brand.brand_name} · ${report.campaign.campaign_name} · ${cycleLabel} · ${cycleRangeLabel(report.cycle)}`;
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#101828').text(title);
  doc.moveDown(0.2);

  sectionTitle(doc, 'Cycle performance');
  const hero = report.hero ?? {};
  const heroLine = `${hero.completed_collaborations ?? 0} / ${hero.target ?? '—'} complete`;
  doc.font('Helvetica-Bold').fontSize(24).fillColor('#101828').text(heroLine);
  doc.font('Helvetica').fontSize(11).fillColor('#475467')
    .text(`${Math.round(Number(hero.achievement_pct ?? 0))}% achieved · Health: ${hero.cycle_health ?? 'not_set'}`);
  doc.moveDown(0.4);

  const cardY = doc.y;
  const cardGap = 10;
  const cardWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - cardGap * 2) / 3;
  drawStatCard(doc, doc.page.margins.left, cardY, cardWidth, 'Collaborations complete', Number(report.stats?.collaborations_complete ?? 0));
  drawStatCard(doc, doc.page.margins.left + cardWidth + cardGap, cardY, cardWidth, 'Deliverables awaited', Number(report.stats?.deliverables_awaited ?? 0));
  drawStatCard(doc, doc.page.margins.left + (cardWidth + cardGap) * 2, cardY, cardWidth, 'Successful visits', Number(report.stats?.visits_completed ?? 0));
  doc.y = cardY + 66;

  sectionTitle(doc, 'Proof of delivery');
  const collaborations = Array.isArray(report.collaborations) ? report.collaborations : [];
  if (!collaborations.length) {
    doc.fontSize(10).fillColor('#667085').text('No completed collaborations in this cycle.');
  }

  for (const collab of collaborations) {
    ensurePageSpace(doc, 100);
    doc.roundedRect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 1, 1)
      .fill('#eaecf0');
    doc.moveDown(0.5);

    const collabType = collab.collaboration_type === 'paid' ? 'Paid' : collab.collaboration_type === 'barter' ? 'Barter' : null;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#101828').text(collab.contact_name);
    if (collabType) {
      doc.font('Helvetica').fontSize(10).fillColor('#475467').text(collabType, { continued: false });
    }
    if (collab.completed_at_ist) {
      doc.font('Helvetica').fontSize(9).fillColor('#667085').text(`Completed ${formatIstDate(collab.completed_at_ist)}`);
    }
    doc.moveDown(0.2);

    const proofItems = Array.isArray(collab.proof) ? collab.proof : [];
    if (!proofItems.length) {
      doc.fontSize(10).fillColor('#667085').text('No proof captured.');
      doc.moveDown(0.5);
      continue;
    }

    for (const item of proofItems) {
      ensurePageSpace(doc, 72);
      const posted = formatIstDate(item.posted_date);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#101828').text(item.label);
      if (posted) {
        doc.font('Helvetica').fontSize(9).fillColor('#667085').text(`Posted ${posted}`);
      }

      const links = Array.isArray(item.links) ? item.links : [];
      for (const link of links) {
        ensurePageSpace(doc, 14);
        doc.fillColor('#155eef').fontSize(9).text(link, { link, underline: true });
      }

      const isStory = String(item.deliverable_type ?? '').toLowerCase() === 'story';
      const shots = Array.isArray(item.screenshots) ? item.screenshots : [];
      if (isStory && shots.length) {
        const maxWidth = 88;
        const maxHeight = 156;
        let x = doc.page.margins.left;
        let y = doc.y + 6;
        for (const shot of shots) {
          if (x + maxWidth > doc.page.width - doc.page.margins.right) {
            x = doc.page.margins.left;
            y += maxHeight + 28;
          }
          ensurePageSpace(doc, (y - doc.y) + maxHeight + 34);
          const shotBuffer = await fetchBuffer(shot.url, 10000);
          doc.roundedRect(x, y, maxWidth, maxHeight, 4).stroke('#d0d5dd');
          if (shotBuffer) {
            try {
              doc.image(shotBuffer, x, y, { fit: [maxWidth, maxHeight], align: 'center', valign: 'center' });
            } catch {
              doc.fontSize(8).fillColor('#667085').text('Image unavailable', x + 6, y + maxHeight / 2 - 6, {
                width: maxWidth - 12,
                align: 'center',
              });
            }
          } else {
            doc.fontSize(8).fillColor('#667085').text('Image unavailable', x + 6, y + maxHeight / 2 - 6, {
              width: maxWidth - 12,
              align: 'center',
            });
          }
          const shotDate = formatIstDate(shot.posted_date ?? item.posted_date);
          if (shotDate) {
            doc.fontSize(8).fillColor('#667085').text(`Posted ${shotDate}`, x, y + maxHeight + 4, {
              width: maxWidth,
              align: 'center',
            });
          }
          x += maxWidth + 12;
        }
        doc.y = Math.max(doc.y, y + maxHeight + 24);
      }

      doc.moveDown(0.3);
    }
  }

  doc.end();
  return done;
}

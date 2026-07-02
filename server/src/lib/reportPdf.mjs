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

function healthLabel(health) {
  if (health === 'green') return 'On track';
  if (health === 'amber') return 'At risk';
  if (health === 'red') return 'Behind';
  return 'No target set';
}

function proofUnitCount(item) {
  const match = String(item?.label ?? '').match(/×\s*(\d+)/);
  const n = Number(match?.[1] ?? NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function estimateCreatorBlockHeight(collab) {
  const proofItems = Array.isArray(collab?.proof) ? collab.proof : [];
  let h = 58;
  for (const item of proofItems) {
    h += 28;
    const isStory = String(item?.deliverable_type ?? '').toLowerCase() === 'story';
    if (isStory) {
      const shots = Array.isArray(item?.screenshots) ? item.screenshots : [];
      const expectedUnits = proofUnitCount(item);
      const count = expectedUnits ? Math.min(expectedUnits, shots.length) : shots.length;
      if (count > 0) {
        const perRow = 4;
        h += Math.ceil(count / perRow) * 188;
      }
    } else {
      const links = Array.isArray(item?.links) ? item.links : [];
      h += links.length * 12;
    }
    h += 10;
  }
  return h + 16;
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

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;

  const logoBuffer = await fetchBuffer(logoUrl, 8000);
  const headerTop = doc.y;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, left, headerTop, { fit: [120, 34] });
    } catch {
      doc.fontSize(10).fillColor('#667085').text('Brand Catapult', left, headerTop);
    }
  } else {
    doc.fontSize(10).fillColor('#667085').text('Brand Catapult', left, headerTop);
  }

  const cycleLabel = report?.campaign?.campaign_type === 'monthly' && Number(report?.campaign?.term_months)
    ? `Cycle ${report.cycle.cycle_number} of ${Number(report.campaign.term_months)}`
    : `Cycle ${report?.cycle?.cycle_number ?? '—'}`;
  const title = `${report.brand.brand_name} · ${report.campaign.campaign_name} · ${cycleLabel} · ${cycleRangeLabel(report.cycle)}`;

  const titleX = logoBuffer ? left + 132 : left;
  const titleWidth = logoBuffer ? contentWidth - 132 : contentWidth;
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#101828').text(title, titleX, headerTop, {
    width: titleWidth,
  });
  doc.y = Math.max(headerTop + 40, doc.y + 6);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#d0d5dd').lineWidth(1).stroke();
  doc.moveDown(0.5);

  sectionTitle(doc, 'Cycle performance');
  const hero = report.hero ?? {};
  const heroLine = `${hero.completed_collaborations ?? 0} / ${hero.target ?? '—'} complete`;
  doc.font('Helvetica-Bold').fontSize(24).fillColor('#101828').text(heroLine);
  doc.font('Helvetica').fontSize(11).fillColor('#475467')
    .text(`${Math.round(Number(hero.achievement_pct ?? 0))}% achieved · Health: ${healthLabel(hero.cycle_health)}`);
  doc.moveDown(0.4);

  const cardY = doc.y;
  const cardGap = 10;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  drawStatCard(doc, left, cardY, cardWidth, 'Collaborations complete', Number(report.stats?.collaborations_complete ?? 0));
  drawStatCard(doc, left + cardWidth + cardGap, cardY, cardWidth, 'Deliverables awaited', Number(report.stats?.deliverables_awaited ?? 0));
  drawStatCard(doc, left + (cardWidth + cardGap) * 2, cardY, cardWidth, 'Successful visits', Number(report.stats?.visits_completed ?? 0));
  doc.y = cardY + 66;

  sectionTitle(doc, 'Proof of delivery');
  const collaborations = Array.isArray(report.collaborations) ? report.collaborations : [];
  if (!collaborations.length) {
    doc.fontSize(10).fillColor('#667085').text('No completed collaborations in this cycle.');
  }

  for (const collab of collaborations) {
    ensurePageSpace(doc, estimateCreatorBlockHeight(collab));
    const blockTop = doc.y;

    const collabType = collab.collaboration_type === 'paid' ? 'Paid' : collab.collaboration_type === 'barter' ? 'Barter' : null;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#101828').text(collab.contact_name, left, blockTop, {
      width: contentWidth * 0.66,
      lineBreak: false,
    });

    const completedLabel = collab.completed_at_ist ? formatIstDate(collab.completed_at_ist) : null;
    if (completedLabel) {
      doc.font('Helvetica').fontSize(9).fillColor('#667085').text(`Completed ${completedLabel}`, left, blockTop + 2, {
        width: contentWidth,
        align: 'right',
      });
    }

    let yAfterHeader = blockTop + 16;
    if (collabType) {
      const pillW = doc.widthOfString(collabType, { font: 'Helvetica', size: 9 }) + 14;
      const pillY = blockTop + 16;
      doc.roundedRect(left, pillY, pillW, 14, 4).fillAndStroke('#eef4ff', '#d0d5dd');
      doc.fillColor('#1d4ed8').font('Helvetica').fontSize(9).text(collabType, left + 7, pillY + 3, {
        width: pillW - 10,
        align: 'left',
      });
      yAfterHeader = pillY + 16;
    }
    doc.y = yAfterHeader + 6;

    const proofItems = Array.isArray(collab.proof) ? collab.proof : [];
    if (!proofItems.length) {
      doc.fontSize(10).fillColor('#667085').text('No proof captured.', left, doc.y);
      doc.y += 8;
    } else {
      for (const item of proofItems) {
        ensurePageSpace(doc, 72);
        const posted = formatIstDate(item.posted_date);
        const isStory = String(item.deliverable_type ?? '').toLowerCase() === 'story';

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#101828').text(item.label, left, doc.y, {
          width: contentWidth,
        });
        if (posted && !isStory) {
          doc.font('Helvetica').fontSize(9).fillColor('#667085').text(`Posted ${posted}`, left, doc.y + 1, {
            width: contentWidth,
          });
        }
        doc.moveDown(0.15);

        const links = Array.isArray(item.links) ? item.links : [];
        for (const link of links) {
          ensurePageSpace(doc, 14);
          doc.fillColor('#155eef').fontSize(9).text(link, left, doc.y, {
            width: contentWidth,
            link,
            underline: true,
          });
        }

        const shots = Array.isArray(item.screenshots) ? item.screenshots : [];
        if (isStory && shots.length) {
          const expectedUnits = proofUnitCount(item);
          const selectedShots = expectedUnits ? shots.slice(0, expectedUnits) : shots;
          const shotW = 132;
          const shotH = 235;
          const colGap = 12;
          const perRow = Math.max(1, Math.floor((contentWidth + colGap) / (shotW + colGap)));
          let idx = 0;
          while (idx < selectedShots.length) {
            ensurePageSpace(doc, shotH + 28);
            const rowY = doc.y + 4;
            for (let col = 0; col < perRow && idx < selectedShots.length; col += 1, idx += 1) {
              const shot = selectedShots[idx];
              const x = left + col * (shotW + colGap);
              const shotBuffer = await fetchBuffer(shot.url, 10000);
              doc.roundedRect(x, rowY, shotW, shotH, 4).stroke('#d0d5dd');
              if (shotBuffer) {
                try {
                  doc.image(shotBuffer, x, rowY, { fit: [shotW, shotH], align: 'center', valign: 'center' });
                } catch {
                  doc.fontSize(8).fillColor('#667085').text('Image unavailable', x + 6, rowY + shotH / 2 - 6, {
                    width: shotW - 12,
                    align: 'center',
                  });
                }
              } else {
                doc.fontSize(8).fillColor('#667085').text('Image unavailable', x + 6, rowY + shotH / 2 - 6, {
                  width: shotW - 12,
                  align: 'center',
                });
              }
              const shotDate = formatIstDate(shot.posted_date ?? item.posted_date);
              if (shotDate) {
                doc.fontSize(8).fillColor('#667085').text(`Posted ${shotDate}`, x, rowY + shotH + 5, {
                  width: shotW,
                  align: 'center',
                });
              }
            }
            doc.y = rowY + shotH + 18;
          }
        }

        doc.moveDown(0.25);
      }
    }

    doc.moveTo(left, doc.y + 4)
      .lineTo(right, doc.y + 4)
      .strokeColor('#eaecf0')
      .lineWidth(1)
      .stroke();
    doc.y += 10;
  }

  doc.end();
  return done;
}

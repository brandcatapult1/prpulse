/** Parse a single CSV line respecting quoted fields. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row = { _line: index + 2 };
    headers.forEach((key, i) => {
      row[key] = values[i] ?? '';
    });
    return row;
  });

  return { headers, rows };
}

export const CONTACT_IMPORT_TEMPLATE = `full_name,mobile_number,city,instagram_url
Tanvi R.,+919887766554,Delhi,https://instagram.com/tanvi.creates
Dev P.,+919900112233,Bangalore,https://instagram.com/dev.photography`;

export const CAMPAIGN_IMPORT_TEMPLATE = `campaign_name,brand_name,target_collaborations,status
Festive Menu Push,BrandX,15,active
Winter Glow,GlowCo,10,planning`;

export function validateContactRows(rows, existingContacts, { skipDuplicates = true } = {}) {
  const seenMobiles = new Map();
  const existingByMobile = new Map();
  for (const c of existingContacts) {
    if (c.mobile_number) existingByMobile.set(normalizeMobileKey(c.mobile_number), c);
  }

  return rows.map((row) => {
    const full_name = row.full_name?.trim();
    const mobile_number = row.mobile_number?.trim();
    const city = row.city?.trim() || null;
    const instagram_url = row.instagram_url?.trim() || row.instagram_link?.trim() || null;

    if (!full_name || !mobile_number) {
      return {
        ...row,
        full_name,
        mobile_number,
        city,
        instagram_url,
        status: 'error',
        message: 'Full name and mobile number are required',
      };
    }

    const mobileKey = normalizeMobileKey(mobile_number);
    if (seenMobiles.has(mobileKey)) {
      return {
        ...row,
        full_name,
        mobile_number,
        city,
        instagram_url,
        status: 'error',
        message: `Duplicate mobile in file (row ${seenMobiles.get(mobileKey)})`,
      };
    }
    seenMobiles.set(mobileKey, row._line);

    const match = existingByMobile.get(mobileKey);
    if (match) {
      return {
        ...row,
        full_name,
        mobile_number,
        city,
        instagram_url,
        status: skipDuplicates ? 'duplicate' : 'warning',
        message: `Matches existing contact: ${match.full_name}`,
        existing_contact_id: match.id,
        existing_contact_name: match.full_name,
      };
    }

    return {
      ...row,
      full_name,
      mobile_number,
      city,
      instagram_url,
      status: 'ok',
      message: 'Ready to import',
    };
  });
}

export function validateCampaignRows(rows, brands) {
  const brandByName = new Map(brands.map((b) => [b.brand_name.toLowerCase(), b]));

  return rows.map((row) => {
    const campaign_name = row.campaign_name?.trim();
    const brand_name = row.brand_name?.trim();
    const target = row.target_collaborations?.trim();

    if (!campaign_name || !brand_name) {
      return {
        ...row,
        campaign_name,
        brand_name,
        status: 'error',
        message: 'Campaign name and brand name are required',
      };
    }

    const brand = brandByName.get(brand_name.toLowerCase());
    if (!brand) {
      return {
        ...row,
        campaign_name,
        brand_name,
        status: 'error',
        message: `Unknown brand "${brand_name}" — add the brand first`,
      };
    }

    const allowed = ['draft', 'active', 'paused', 'completed'];
    const rawStatus = (row.status?.trim() || 'draft').toLowerCase();
    const campaignStatus = rawStatus === 'planning' ? 'draft' : rawStatus;
    const finalStatus = allowed.includes(campaignStatus) ? campaignStatus : 'draft';

    return {
      ...row,
      campaign_name,
      brand_name,
      brand_id: brand.id,
      target_collaborations: target ? Number(target) : null,
      campaign_status: finalStatus,
      status: 'ok',
      message: 'Ready to import',
    };
  });
}

function normalizeMobileKey(value) {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function rowsReadyToImport(validated) {
  return validated.filter((r) => r.status === 'ok');
}

export function importSummary(validated) {
  return {
    ok: validated.filter((r) => r.status === 'ok').length,
    duplicate: validated.filter((r) => r.status === 'duplicate').length,
    error: validated.filter((r) => r.status === 'error').length,
  };
}

export function canBulkImport(role) {
  return role === 'admin' || role === 'senior_manager';
}

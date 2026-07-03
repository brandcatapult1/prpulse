import { Link } from 'react-router-dom';
import { ExpandableSection } from '../ui/DataKit.jsx';
import { Pill, formatFee } from '../../lib/format.jsx';
import { formatClassification, CLASSIFICATION_OPTIONS, classificationSelectLabel } from '../../lib/classifications.js';
import { formatContactStatus, CONTACT_STATUS_OPTIONS } from '../../lib/contactLifecycle.js';
import { MobileNumberField } from './MobileNumberField.jsx';
import { CityCountryField } from './CityCountryField.jsx';
import { countryLabel, citiesForCountry } from '../../lib/locations.js';
import { isMobileValid } from '../../lib/phone.js';
import {
  draftWithOpenToPaid,
  showIndicativeRates,
  hasCollaborationPreference,
  COLLABORATION_PREFERENCE_ERROR,
} from '../../lib/collaborationPrefs.js';
import { incompletePlatformLinkIndexes } from '../../lib/contactDraft.js';
import { TagSelectChips } from '../tags/TagSelectChips.jsx';

export function ContactEditOverview({
  contact,
  extras,
  editing,
  draft,
  onDraftChange,
  tagOptions = [],
  categoryOptions = [],
  cityOptions = [],
  duplicate,
  onCheckMobile,
  contactId,
}) {
  const setField = (field, value) => onDraftChange((d) => ({ ...d, [field]: value }));

  const updateLocationCountry = (countryCode) => {
    onDraftChange((d) => {
      const stillValid = citiesForCountry(cityOptions, countryCode).some((c) => c.name === d.city);
      return { ...d, country: countryCode, city: stillValid ? d.city : '' };
    });
  };

  const tagLabels = (contact.tags ?? []).map((t) => (typeof t === 'string' ? t : t.name));

  const openToPaid = editing
    ? Boolean(draft.open_to_paid)
    : Boolean(extras.open_to_paid ?? contact.open_to_paid);
  const indicativeRatesVisible = showIndicativeRates(openToPaid);
  const missingPreference =
    editing && !hasCollaborationPreference(draft.open_to_paid, draft.open_to_barter);
  const incompleteLinkIndexes = editing
    ? incompletePlatformLinkIndexes(draft.other_platform_links)
    : [];

  if (!editing) {
    return (
      <ContactReadOverview
        contact={contact}
        extras={extras}
        tagLabels={tagLabels}
      />
    );
  }

  return (
    <div className="space-y-3">
      <ExpandableSection title="Vital information" defaultOpen>
        <dl className="grid gap-4 sm:grid-cols-2 text-sm">
          <ProfileField
            label="Full name"
            editing={editing}
            value={editing ? draft.full_name : contact.full_name}
            input={
              <input
                className="input-field mt-1 w-full"
                value={draft.full_name ?? ''}
                onChange={(e) => setField('full_name', e.target.value)}
              />
            }
          />
          <ProfileField
            label="Mobile"
            editing={editing}
            value={contact.mobile_number ?? '—'}
            input={
              <div>
                <MobileNumberField
                  countryCode={draft.mobile_country_code ?? 'IN'}
                  nationalNumber={draft.mobile_number ?? ''}
                  onCountryChange={(code) => setField('mobile_country_code', code)}
                  onNumberChange={(value) => setField('mobile_number', value)}
                  onBlur={() => onCheckMobile?.()}
                />
                {editing && draft.mobile_number && !isMobileValid(draft.mobile_number, draft.mobile_country_code) && (
                  <p className="mt-1 text-2xs text-red-700">Enter a valid mobile number for the selected country.</p>
                )}
                {editing && duplicate && duplicate.id !== contactId && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-2xs text-amber-900">
                    Matches existing contact: <strong>{duplicate.full_name}</strong>
                    <Link to={`/contacts/${duplicate.id}`} className="ml-1 text-brand hover:underline">
                      View profile →
                    </Link>
                  </div>
                )}
              </div>
            }
          />
          <ProfileField
            label="Email"
            editing={editing}
            value={extras.email ?? contact.email ?? '—'}
            input={
              <input
                className="input-field mt-1 w-full"
                type="email"
                value={draft.email ?? ''}
                onChange={(e) => setField('email', e.target.value)}
              />
            }
          />
          <ProfileField
            label="City"
            editing={editing}
            value={
              contact.city
                ? `${contact.city}${contact.country ? ` · ${countryLabel(contact.country)}` : ''}`
                : '—'
            }
            input={
              <CityCountryField
                countryCode={draft.country ?? 'IN'}
                city={draft.city ?? ''}
                cities={cityOptions}
                onCountryChange={updateLocationCountry}
                onCityChange={(value) => setField('city', value)}
              />
            }
          />
          <ProfileField
            label="State"
            editing={editing}
            value={extras.state ?? contact.state ?? '—'}
            input={
              <input
                className="input-field mt-1 w-full"
                value={draft.state ?? ''}
                onChange={(e) => setField('state', e.target.value)}
              />
            }
          />
        </dl>
      </ExpandableSection>

      <ExpandableSection title="Social links">
        <dl className="grid gap-4 sm:grid-cols-2 text-sm">
          <ProfileField
            label="Instagram"
            editing={editing}
            value={linkOrDash(extras.instagram_url ?? contact.instagram_url)}
            input={
              <input
                className="input-field mt-1 w-full"
                value={draft.instagram_url ?? ''}
                onChange={(e) => setField('instagram_url', e.target.value)}
                placeholder="https://instagram.com/…"
              />
            }
          />
          <ProfileField
            label="YouTube"
            editing={editing}
            value={linkOrDash(extras.youtube_url ?? contact.youtube_url)}
            input={
              <input
                className="input-field mt-1 w-full"
                value={draft.youtube_url ?? ''}
                onChange={(e) => setField('youtube_url', e.target.value)}
                placeholder="https://youtube.com/…"
              />
            }
          />
        </dl>
        <div className="mt-4">
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">Other platforms</p>
          {editing ? (
            <div className="mt-2 space-y-2">
              {(draft.other_platform_links ?? []).map((link, index) => {
                const incomplete = incompleteLinkIndexes.includes(index);
                return (
                  <div key={index}>
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input
                        className={`input-field ${incomplete ? 'border-red-400' : ''}`}
                        placeholder="Label"
                        value={link.label ?? ''}
                        onChange={(e) => {
                          onDraftChange((d) => {
                            const links = [...(d.other_platform_links ?? [])];
                            links[index] = { ...links[index], label: e.target.value };
                            return { ...d, other_platform_links: links };
                          });
                        }}
                      />
                      <input
                        className={`input-field ${incomplete ? 'border-red-400' : ''}`}
                        placeholder="URL"
                        value={link.url ?? ''}
                        onChange={(e) => {
                          onDraftChange((d) => {
                            const links = [...(d.other_platform_links ?? [])];
                            links[index] = { ...links[index], url: e.target.value };
                            return { ...d, other_platform_links: links };
                          });
                        }}
                      />
                      <button
                        type="button"
                        className="btn-secondary text-2xs"
                        onClick={() => {
                          onDraftChange((d) => ({
                            ...d,
                            other_platform_links: (d.other_platform_links ?? []).filter((_, i) => i !== index),
                          }));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    {incomplete && (
                      <p className="mt-1 text-2xs text-red-700">
                        Add both a label and a URL, or remove this row.
                      </p>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="btn-secondary text-2xs"
                onClick={() => {
                  onDraftChange((d) => ({
                    ...d,
                    other_platform_links: [...(d.other_platform_links ?? []), { label: '', url: '' }],
                  }));
                }}
              >
                + Add platform
              </button>
            </div>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {(extras.other_platform_links ?? contact.other_platform_links ?? []).length === 0 ? (
                <li className="text-ink-secondary">—</li>
              ) : (
                (extras.other_platform_links ?? contact.other_platform_links ?? []).map((link, i) => (
                  <li key={i}>
                    <span className="text-ink-secondary">{link.label}: </span>
                    <a href={link.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      {link.url.replace(/^https?:\/\//, '')}
                    </a>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </ExpandableSection>

      <ExpandableSection title="Profile & categories">
        <dl className="grid gap-4 sm:grid-cols-2 text-sm">
          <div className="sm:col-span-2">
            <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">Primary category</dt>
            <dd className="mt-1">
              {editing ? (
                <select
                  className="input-field w-full max-w-md"
                  value={draft.primary_category_id ?? ''}
                  onChange={(e) => setField('primary_category_id', e.target.value)}
                >
                  <option value="">— None —</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-ink">{contact.primary_category?.name ?? extras.primary_category?.name ?? '—'}</span>
              )}
            </dd>
          </div>
          <ProfileField
            label="Open to barter"
            editing={editing}
            value={boolLabel(extras.open_to_barter ?? contact.open_to_barter)}
            input={
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(draft.open_to_barter)}
                  onChange={(e) => setField('open_to_barter', e.target.checked)}
                />
                Open to barter collaborations
              </label>
            }
          />
          <ProfileField
            label="Open to paid"
            editing={editing}
            value={boolLabel(extras.open_to_paid ?? contact.open_to_paid)}
            input={
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(draft.open_to_paid)}
                  onChange={(e) => onDraftChange((d) => draftWithOpenToPaid(d, e.target.checked))}
                />
                Open to paid collaborations
              </label>
            }
          />
          {missingPreference && (
            <p className="sm:col-span-2 text-2xs text-red-700">{COLLABORATION_PREFERENCE_ERROR}</p>
          )}
        </dl>
      </ExpandableSection>

      {indicativeRatesVisible && (
        <ExpandableSection title="Indicative rates">
          <p className="mb-3 text-2xs text-ink-tertiary">
            Current indicative rates only — not historical. Changing these does not alter past engagement fees.
          </p>
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            {['reel_rate', 'story_rate', 'post_rate', 'other_rate'].map((key) => (
              <ProfileField
                key={key}
                label={rateLabel(key)}
                editing={editing}
                value={extras[key] != null ? formatFee(extras[key]) : '—'}
                input={
                  <input
                    className="input-field mt-1 w-full"
                    type="number"
                    min={0}
                    value={draft[key] ?? ''}
                    onChange={(e) => setField(key, e.target.value)}
                    placeholder="₹"
                  />
                }
              />
            ))}
          </dl>
        </ExpandableSection>
      )}

      <ExpandableSection title="Classification & tags">
        <dl className="grid gap-4 sm:grid-cols-2 text-sm">
          <ProfileField
            label="Classification"
            editing={editing}
            value={formatClassification(contact.classification)}
            input={
              <select
                className="input-field mt-1 w-full"
                value={draft.classification ?? ''}
                onChange={(e) => setField('classification', e.target.value)}
              >
                <option value="">— None —</option>
                {CLASSIFICATION_OPTIONS.map(({ value }) => (
                  <option key={value} value={value}>{classificationSelectLabel(value)}</option>
                ))}
              </select>
            }
          />
          <div className="sm:col-span-2">
            <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">Tags</dt>
            <dd className="mt-2">
              {editing ? (
                <TagSelectChips
                  tags={tagOptions}
                  allowedTypes={['influencer']}
                  appliedTags={Array.isArray(contact.tags) ? contact.tags : []}
                  selectedIds={draft.tag_ids ?? []}
                  onChange={(tag_ids) => onDraftChange((d) => ({ ...d, tag_ids }))}
                />
              ) : tagLabels.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {tagLabels.map((t) => (
                    <Pill key={t} tone="info">{t}</Pill>
                  ))}
                </div>
              ) : (
                <span className="text-ink-secondary">—</span>
              )}
            </dd>
          </div>
        </dl>
      </ExpandableSection>

      <ExpandableSection title="Lifecycle status">
        {editing ? (
          <div className="flex flex-wrap gap-2">
            {CONTACT_STATUS_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setField('status', value)}
                className={`rounded-lg border px-3 py-2 text-2xs font-medium transition-colors ${
                  draft.status === value
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line bg-white text-ink-secondary hover:border-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <Pill tone={contact.status === 'active' ? 'success' : contact.status === 'archived' ? 'muted' : 'warning'}>
            {formatContactStatus(contact.status)}
          </Pill>
        )}
      </ExpandableSection>
    </div>
  );
}

/**
 * Compact READ view — same data as the edit accordions, but grouped into a few
 * glass cards (matching the Campaign View treatment) and with empty fields
 * hidden rather than rendered as rows of "—".
 */
function ContactReadOverview({ contact, extras, tagLabels }) {
  const email = extras.email ?? contact.email ?? null;
  const location = contact.city
    ? `${contact.city}${contact.country ? ` · ${countryLabel(contact.country)}` : ''}`
    : null;
  const state = extras.state ?? contact.state ?? null;
  const classification = contact.classification
    ? classificationSelectLabel(contact.classification)
    : null;

  const instagram = extras.instagram_url ?? contact.instagram_url ?? null;
  const youtube = extras.youtube_url ?? contact.youtube_url ?? null;
  const otherLinks = (extras.other_platform_links ?? contact.other_platform_links ?? []).filter((l) => l?.url);

  const primaryCategory = contact.primary_category?.name ?? extras.primary_category?.name ?? null;
  const openToPaid = Boolean(extras.open_to_paid ?? contact.open_to_paid);
  const openToBarter = Boolean(extras.open_to_barter ?? contact.open_to_barter);
  const terms = [openToBarter && 'Barter', openToPaid && 'Paid'].filter(Boolean);

  const rates = openToPaid
    ? [
        ['Reel', extras.reel_rate],
        ['Story', extras.story_rate],
        ['Post', extras.post_rate],
        ['Other', extras.other_rate],
      ].filter(([, v]) => v != null)
    : [];

  const hasCategoriesOrTags = primaryCategory || tagLabels.length > 0;
  const hasSocials = instagram || youtube || otherLinks.length > 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ReadCard title="Contact & classification">
        <dl className="space-y-2.5">
          <ReadRow label="Mobile" value={contact.mobile_number} />
          <ReadRow label="Email" value={email} />
          <ReadRow label="Location" value={location} />
          <ReadRow label="State" value={state} />
          <ReadRow label="Classification" value={classification} />
        </dl>
      </ReadCard>

      <ReadCard title="Collaboration terms">
        <div className="space-y-2.5">
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">Open to</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {terms.length > 0 ? (
                terms.map((t) => <Pill key={t} tone="info">{t}</Pill>)
              ) : (
                <span className="text-2xs text-ink-tertiary">Not specified</span>
              )}
            </div>
          </div>
          {rates.length > 0 && (
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">
                Indicative rates
              </span>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {rates.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-2">
                    <dt className="text-2xs text-ink-secondary">{label}</dt>
                    <dd className="text-2xs font-medium tabular-nums text-ink">{formatFee(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </ReadCard>

      {(hasCategoriesOrTags || hasSocials) && (
        <ReadCard title="Categories, tags & socials" className="sm:col-span-2">
          <div className="space-y-3">
            {primaryCategory && (
              <div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">Primary category</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Pill tone="brand">{primaryCategory}</Pill>
                </div>
              </div>
            )}
            {tagLabels.length > 0 && (
              <div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">Tags</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {tagLabels.map((t) => (
                    <Pill key={t} tone="info">{t}</Pill>
                  ))}
                </div>
              </div>
            )}
            {hasSocials && (
              <div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">Social links</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {instagram && <LinkChip label="Instagram" url={instagram} />}
                  {youtube && <LinkChip label="YouTube" url={youtube} />}
                  {otherLinks.map((link, i) => (
                    <LinkChip key={i} label={link.label || 'Link'} url={link.url} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </ReadCard>
      )}
    </div>
  );
}

function ReadCard({ title, children, className = '' }) {
  return (
    <section className={`campaign-glass-tile p-4 ${className}`}>
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">{title}</h3>
      {children}
    </section>
  );
}

function ReadRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-2xs uppercase tracking-wide text-ink-tertiary">{label}</dt>
      <dd className="text-right text-sm text-ink">{value}</dd>
    </div>
  );
}

function LinkChip({ label, url }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="campaign-glass-chip text-brand hover:text-brand">
      {label}
    </a>
  );
}

function ProfileField({ label, editing, value, input }) {
  return (
    <div>
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">{label}</dt>
      <dd className="mt-1 text-ink">{editing ? input : value}</dd>
    </div>
  );
}

function linkOrDash(url) {
  if (!url) return '—';
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
      {url.replace(/^https?:\/\//, '')}
    </a>
  );
}

function boolLabel(value) {
  if (value == null) return '—';
  return value ? 'Yes' : 'No';
}

function rateLabel(key) {
  const map = {
    reel_rate: 'Reel',
    story_rate: 'Story',
    post_rate: 'Post',
    other_rate: 'Other',
  };
  return map[key] ?? key;
}

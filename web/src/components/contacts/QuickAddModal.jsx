import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Toast } from '../ui/Primitives.jsx';
import { contactsApi, campaignsApi } from '../../lib/api.js';
import {
  addContactImports,
  importContactsToCampaignDemo,
  isContactInCampaign,
  getDemoCampaigns,
  getDemoContacts,
} from '../../lib/demo.js';
import { findContactByMobile, normalizeMobile } from '../../lib/phone.js';
import { useAuth } from '../../context/AuthContext.jsx';

const EMPTY = { full_name: '', mobile_number: '', instagram_url: '', city: '' };

export function QuickAddModal({ open, onClose, onSaved, defaultCampaignId = '' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [duplicate, setDuplicate] = useState(null);
  const [continueAnyway, setContinueAnyway] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [campaignId, setCampaignId] = useState('');
  const [campaigns, setCampaigns] = useState(() => getDemoCampaigns());

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setDuplicate(null);
    setContinueAnyway(false);
    setCampaignId(defaultCampaignId || '');
    campaignsApi
      .list()
      .then((data) => {
        setCampaigns(Array.isArray(data) && data.length > 0 ? data : getDemoCampaigns());
      })
      .catch(() => setCampaigns(getDemoCampaigns()));
  }, [open, defaultCampaignId]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'mobile_number') {
      setDuplicate(null);
      setContinueAnyway(false);
    }
  }

  async function checkDuplicate(mobile) {
    const norm = normalizeMobile(mobile);
    if (norm.length < 10) {
      setDuplicate(null);
      setContinueAnyway(false);
      return;
    }

    try {
      const match = await contactsApi.lookupMobile(mobile);
      if (match) {
        setDuplicate(match);
        return;
      }
    } catch {
      /* demo fallback below */
    }

    const local = findContactByMobile(mobile, getDemoContacts());
    setDuplicate(local ? { id: local.id, full_name: local.full_name } : null);
    if (!local) setContinueAnyway(false);
  }

  const mobileValid = normalizeMobile(form.mobile_number).length >= 10;
  const canSave = form.full_name.trim() && mobileValid && (!duplicate || continueAnyway);

  async function persistContact() {
    const body = {
      full_name: form.full_name.trim(),
      mobile_number: form.mobile_number.trim(),
      instagram_url: form.instagram_url.trim() || null,
      city: form.city.trim() || null,
    };

    try {
      const result = await contactsApi.quickAdd(body);
      return result.contact;
    } catch {
      const contact = {
        id: `qa-${Date.now()}`,
        ...body,
        classification: 'micro',
        status: 'active',
        tags: [],
        is_blacklisted: false,
      };
      addContactImports([contact]);
      return contact;
    }
  }

  async function assignToCampaign(contact) {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;

    if (isContactInCampaign(campaignId, contact.id)) {
      throw new Error(`${contact.full_name} is already on this campaign`);
    }

    try {
      const result = await campaignsApi.populate(campaignId, { contact_ids: [contact.id] });
      const created = Array.isArray(result) ? result : result?.created ?? [];
      if (created.length === 0) {
        const { added } = importContactsToCampaignDemo({
          campaignId,
          campaignName: campaign.campaign_name ?? campaign.name,
          contacts: [contact],
          ownerName: user?.full_name,
        });
        if (added.length === 0) {
          throw new Error(`${contact.full_name} is already on this campaign`);
        }
      }
    } catch (err) {
      if (err.message?.includes('already on this campaign')) throw err;
      const { added } = importContactsToCampaignDemo({
        campaignId,
        campaignName: campaign.campaign_name ?? campaign.name,
        contacts: [contact],
        ownerName: user?.full_name,
      });
      if (added.length === 0) {
        throw new Error(`${contact.full_name} is already on this campaign`);
      }
    }
  }

  async function handleSave(withCampaign) {
    if (!canSave || saving) return;
    if (withCampaign && !campaignId) {
      setToast('Pick a campaign first');
      return;
    }

    setSaving(true);
    try {
      const contact = await persistContact();
      if (withCampaign) await assignToCampaign(contact);

      const campaign = campaigns.find((c) => c.id === campaignId);
      setToast(
        withCampaign && campaign
          ? `${contact.full_name} saved and added to ${campaign.campaign_name ?? campaign.name}`
          : `${contact.full_name} saved`,
      );
      onSaved?.(contact);
      onClose();
    } catch (err) {
      setToast(err.message ?? 'Could not save contact');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        title="Quick Add"
        onClose={onClose}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!canSave || saving || !campaignId}
              onClick={() => handleSave(true)}
            >
              Save &amp; add to campaign
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canSave || saving}
              onClick={() => handleSave(false)}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <p className="mb-4 text-2xs text-ink-secondary">
          Capture a creator in under 15 seconds — name and mobile only required.
        </p>

        <div className="grid gap-3">
          <label className="block text-2xs text-ink-secondary">
            Full name
            <input
              className="input-field mt-1"
              placeholder="Creator name"
              value={form.full_name}
              onChange={(e) => updateField('full_name', e.target.value)}
              autoFocus
            />
          </label>

          <label className="block text-2xs text-ink-secondary">
            Mobile number
            <input
              className="input-field mt-1"
              placeholder="+91…"
              value={form.mobile_number}
              onChange={(e) => updateField('mobile_number', e.target.value)}
              onBlur={() => checkDuplicate(form.mobile_number)}
            />
          </label>

          {duplicate && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-2xs text-amber-900">
              A contact with this number exists: <strong>{duplicate.full_name}</strong>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary text-2xs"
                  onClick={() => {
                    navigate(`/contacts/${duplicate.id}`);
                    onClose();
                  }}
                >
                  Open existing
                </button>
                {!continueAnyway && (
                  <button
                    type="button"
                    className="btn-secondary text-2xs"
                    onClick={() => setContinueAnyway(true)}
                  >
                    Continue anyway
                  </button>
                )}
              </div>
            </div>
          )}

          <label className="block text-2xs text-ink-secondary">
            Instagram URL
            <input
              className="input-field mt-1"
              placeholder="https://instagram.com/…"
              value={form.instagram_url}
              onChange={(e) => updateField('instagram_url', e.target.value)}
            />
          </label>

          <label className="block text-2xs text-ink-secondary">
            City
            <input
              className="input-field mt-1"
              placeholder="Delhi"
              value={form.city}
              onChange={(e) => updateField('city', e.target.value)}
            />
          </label>

          <label className="block text-2xs text-ink-secondary">
            Add to campaign (optional)
            <select
              className="input-field mt-1"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">— None —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.campaign_name ?? c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Modal>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

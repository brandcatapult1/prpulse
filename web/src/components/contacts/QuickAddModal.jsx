import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Toast } from '../ui/Primitives.jsx';
import { contactsApi, campaignsApi } from '../../lib/api.js';
import { populateCampaign } from '../../lib/persistence.js';
import { mergeContactsCache } from '../../lib/contactsCache.js';
import { normalizeMobile } from '../../lib/phone.js';
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
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setDuplicate(null);
    setContinueAnyway(false);
    setCampaignId(defaultCampaignId || '');
    campaignsApi
      .list()
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => setCampaigns([]));
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
      setDuplicate(match ?? null);
      if (!match) setContinueAnyway(false);
    } catch {
      setDuplicate(null);
    }
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

    const result = await contactsApi.quickAdd(body);
    mergeContactsCache([result.contact]);
    return result.contact;
  }

  async function assignToCampaign(contact) {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;

    const result = await populateCampaign(campaignId, [contact.id], user?.id);
    const created = result?.created ?? [];
    if (created.length === 0) {
      throw new Error(`${contact.full_name} is already on this campaign`);
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
        withCampaign
          ? `${contact.full_name} added and assigned to ${campaign?.campaign_name ?? 'campaign'}`
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

  if (!open) return null;

  return (
    <>
      <Modal
        open={open}
        title="Quick add contact"
        onClose={onClose}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-secondary" disabled={!canSave || saving} onClick={() => handleSave(false)}>
              Save contact
            </button>
            <button type="button" className="btn-primary" disabled={!canSave || saving} onClick={() => handleSave(true)}>
              Save & assign
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block text-2xs text-ink-secondary">
            Full name
            <input className="input-field mt-1" value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} />
          </label>
          <label className="block text-2xs text-ink-secondary">
            Mobile
            <input
              className="input-field mt-1"
              value={form.mobile_number}
              onChange={(e) => updateField('mobile_number', e.target.value)}
              onBlur={(e) => checkDuplicate(e.target.value)}
            />
          </label>
          {duplicate && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-2xs text-amber-900">
              Matches existing contact: <strong>{duplicate.full_name}</strong>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={continueAnyway} onChange={(e) => setContinueAnyway(e.target.checked)} />
                Continue anyway
              </label>
              <button type="button" className="mt-2 text-brand hover:underline" onClick={() => navigate(`/contacts/${duplicate.id}`)}>
                View profile →
              </button>
            </div>
          )}
          <label className="block text-2xs text-ink-secondary">
            Instagram URL
            <input className="input-field mt-1" value={form.instagram_url} onChange={(e) => updateField('instagram_url', e.target.value)} />
          </label>
          <label className="block text-2xs text-ink-secondary">
            City
            <input className="input-field mt-1" value={form.city} onChange={(e) => updateField('city', e.target.value)} />
          </label>
          <label className="block text-2xs text-ink-secondary">
            Assign to campaign (optional)
            <select className="input-field mt-1" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">— None —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.campaign_name}</option>
              ))}
            </select>
          </label>
        </div>
      </Modal>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

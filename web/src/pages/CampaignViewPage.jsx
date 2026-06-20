import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { FilterBar, DataTable, MetricStrip } from '../components/ui/DataKit.jsx';
import { Drawer, Toast } from '../components/ui/Primitives.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { CampaignKanbanBoard } from '../components/campaign/CampaignKanbanBoard.jsx';
import { CampaignQuickEditDrawer } from '../components/campaign/CampaignQuickEditDrawer.jsx';
import { QuickAddModal } from '../components/contacts/QuickAddModal.jsx';
import { Pill, healthTone, formatStatus, formatDate, formatFee, statusTone } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { campaignsApi, engagementsApi } from '../lib/api.js';
import {
  getDemoCampaign,
  getDemoContacts,
  getDemoDeliverables,
  getDemoEngagementsForCampaign,
  getDemoEngagement,
  getContactIdsInCampaign,
  importContactsToCampaignDemo,
  pickList,
  pickRecord,
  saveDeliverablesOverride,
} from '../lib/demo.js';
import { DemoBanner } from '../components/ui/DemoBanner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { todayIso } from '../lib/dates.js';
import {
  clearBlacklistOverride,
  getEngagementOverride,
  getBlacklistOverride,
  saveBlacklistOverride,
  saveContactProfileOverride,
  saveEngagementOverride,
  saveFeedbackOverride,
  getContactProfileOverride,
  getFeedbackOverride,
} from '../lib/demoStore.js';
import { getContactProfileExtras } from '../lib/contactProfile.js';
import { setActivityActor, clearActivityActor } from '../lib/activityActor.js';
import {
  recordFeedbackActivity,
  recordDeliverablesPatchActivity,
  recordDidntDeliverActivity,
  recordEngagementPatchActivity,
  recordReopenActivity,
} from '../lib/activityLog.js';

export function CampaignViewPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState(() => getDemoCampaign(id));
  const [engagements, setEngagements] = useState(() => getDemoEngagementsForCampaign(id));
  const [demo, setDemo] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [viewMode, setViewMode] = useState('board');
  const [quickEditId, setQuickEditId] = useState(null);
  const [toast, setToast] = useState(null);
  const [boardRevision, setBoardRevision] = useState(0);

  function reloadEngagements() {
    setEngagements(getDemoEngagementsForCampaign(id));
  }

  useEffect(() => {
    if (user) setActivityActor(user);
    return () => clearActivityActor();
  }, [user]);

  useEffect(() => {
    if (!id) return;
    setCampaign(getDemoCampaign(id));
    reloadEngagements();
    setDemo(true);

    Promise.all([
      campaignsApi.get(id).catch(() => null),
      engagementsApi.byCampaign(id).catch(() => []),
    ]).then(([camp, engs]) => {
      const campEmpty = !camp?.campaign_name;
      const engsEmpty = !Array.isArray(engs) || engs.length === 0;
      setCampaign(pickRecord(camp, getDemoCampaign(id)));
      setEngagements(pickList(engs, getDemoEngagementsForCampaign(id)));
      setDemo(campEmpty || engsEmpty);
    });
  }, [id, location.key]);

  const filteredEngagements = useMemo(() => {
    let rows = engagements;
    if (activeFilters.includes('Follow-up due')) {
      rows = rows.filter((r) => r.next_follow_up_date);
    }
    if (activeFilters.includes('Status')) {
      rows = rows.filter((r) => r.conversation_status && r.conversation_status !== 'collaboration_complete');
    }
    return rows;
  }, [engagements, activeFilters]);

  const boardEngagements = useMemo(
    () =>
      filteredEngagements.map((row) => ({
        ...getDemoEngagement(row.id),
        ...row,
        ...getEngagementOverride(row.id),
      })),
    [filteredEngagements],
  );

  function bumpBoard() {
    reloadEngagements();
    setBoardRevision((r) => r + 1);
  }

  function showActionToast(message, onUndo) {
    setToast({ message, onUndo });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 8000);
  }

  function applyEngagementLogging(engagementId, patch, message, snapshotKeys) {
    const base = {
      ...getDemoEngagement(engagementId),
      ...getEngagementOverride(engagementId),
    };
    const snapshot = {};
    for (const key of snapshotKeys) {
      snapshot[key] = base[key];
    }
    saveEngagementOverride(engagementId, patch);
    recordEngagementPatchActivity(engagementId, base, patch);
    bumpBoard();
    showActionToast(message, () => {
      saveEngagementOverride(engagementId, snapshot);
      bumpBoard();
      setToast(null);
    });
  }

  function applyDeliverablesLogging(engagementId, nextList, message) {
    const baseEngagement = {
      ...getDemoEngagement(engagementId),
      ...getEngagementOverride(engagementId),
    };
    const snapshot = getDemoDeliverables(engagementId).map((d) => ({ ...d }));
    saveDeliverablesOverride(engagementId, nextList);
    recordDeliverablesPatchActivity(
      engagementId,
      baseEngagement.campaign_id,
      snapshot,
      nextList,
    );
    bumpBoard();
    showActionToast(message, () => {
      saveDeliverablesOverride(engagementId, snapshot);
      bumpBoard();
      setToast(null);
    });
  }

  function applyDidntDeliverLogging(engagementId, { engagementPatch, blacklist, message }) {
    const base = {
      ...getDemoEngagement(engagementId),
      ...getEngagementOverride(engagementId),
    };
    const engagementSnapshot = {};
    for (const key of Object.keys(engagementPatch)) {
      engagementSnapshot[key] = base[key];
    }
    const contactId = base.contact_id;
    const priorBlacklistOverride = contactId ? getBlacklistOverride(contactId) : null;
    const wasBlacklistedBefore = Boolean(priorBlacklistOverride);

    saveEngagementOverride(engagementId, engagementPatch);
    if (blacklist && contactId) {
      saveBlacklistOverride(contactId, {
        reason: "Didn't deliver",
        blacklisted_at: todayIso(),
      });
    }
    recordEngagementPatchActivity(engagementId, base, engagementPatch);
    recordDidntDeliverActivity(engagementId, base.campaign_id, {
      engagementPatch,
      blacklist,
      contactId,
    });
    bumpBoard();
    showActionToast(message, () => {
      saveEngagementOverride(engagementId, engagementSnapshot);
      if (blacklist && contactId) {
        if (wasBlacklistedBefore) {
          saveBlacklistOverride(contactId, priorBlacklistOverride);
        } else {
          clearBlacklistOverride(contactId);
        }
      }
      bumpBoard();
      setToast(null);
    });
  }

  function applyReopenLogging(engagementId, { engagementPatch, clearBlacklist, message }) {
    const base = {
      ...getDemoEngagement(engagementId),
      ...getEngagementOverride(engagementId),
    };
    const engagementSnapshot = {};
    for (const key of Object.keys(engagementPatch)) {
      engagementSnapshot[key] = base[key];
    }
    engagementSnapshot.dropped_from = base.dropped_from ?? base.drop_failed_at_stage ?? null;

    const contactId = base.contact_id;
    const priorBlacklistOverride = contactId ? getBlacklistOverride(contactId) : null;
    const wasBlacklistedBefore = Boolean(priorBlacklistOverride);

    saveEngagementOverride(engagementId, engagementPatch);
    if (clearBlacklist && contactId) {
      clearBlacklistOverride(contactId);
    }
    recordReopenActivity(engagementId, base.campaign_id, {
      engagementPatch,
      clearBlacklist,
      contactId,
      before: base,
    });
    bumpBoard();
    showActionToast(message, () => {
      saveEngagementOverride(engagementId, engagementSnapshot);
      if (clearBlacklist && contactId && wasBlacklistedBefore) {
        saveBlacklistOverride(contactId, priorBlacklistOverride);
      }
      bumpBoard();
      setToast(null);
    });
  }

  function applyContactFeedbackLogging(
    engagementId,
    { contactId, contactProfilePatch, engagementFeedback, message },
  ) {
    const priorProfile = {
      ...getContactProfileExtras(contactId),
      ...getContactProfileOverride(contactId),
    };
    const priorFeedback = getFeedbackOverride(engagementId);

    const baseEngagement = {
      ...getDemoEngagement(engagementId),
      ...getEngagementOverride(engagementId),
    };

    saveContactProfileOverride(contactId, contactProfilePatch);
    saveFeedbackOverride(engagementId, engagementFeedback);
    recordFeedbackActivity(engagementId, baseEngagement.campaign_id, { engagementFeedback });
    bumpBoard();
    showActionToast(message, () => {
      const profileSnapshot = {};
      for (const key of Object.keys(contactProfilePatch)) {
        profileSnapshot[key] = priorProfile[key];
      }
      saveContactProfileOverride(contactId, profileSnapshot);
      if (priorFeedback) {
        saveFeedbackOverride(engagementId, priorFeedback);
      }
      bumpBoard();
      setToast(null);
    });
  }

  const columns = [
    {
      key: 'contact_name',
      label: 'Creator',
      render: (r) => (
        <span className="font-medium text-brand">{r.contact_name}</span>
      ),
    },
    { key: 'owner_name', label: 'Owner' },
    {
      key: 'conversation_status',
      label: 'Status',
      render: (r) => <Pill tone={statusTone(r.conversation_status)}>{formatStatus(r.conversation_status)}</Pill>,
    },
    { key: 'next_follow_up_date', label: 'Next FU', render: (r) => formatDate(r.next_follow_up_date) },
    { key: 'agreed_fee', label: 'Fee', render: (r) => formatFee(r.agreed_fee) },
    {
      key: 'open',
      label: '',
      render: () => <span className="text-2xs font-medium text-brand">Open →</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={campaign.campaign_name}
        subtitle={`${MODULES.campaignView.pageTitle} · ${campaign.brand_name}`}
        actions={<button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>Add Creators</button>}
      />

      <DemoBanner show={demo} />

      <div className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MetricStrip
            items={[
              { label: 'Target', value: campaign.target_collaborations ?? '—' },
              { label: 'Completed', value: campaign.completed_collaborations, tone: 'accent' },
              { label: 'Remaining', value: campaign.remaining_collaborations ?? '—' },
              {
                label: 'Health',
                value: campaign.campaign_health === 'not_set'
                  ? 'No target set'
                  : `${campaign.achievement_pct ?? 0}%`,
                tone: 'accent',
              },
            ]}
          />
          <Pill tone={healthTone(campaign.campaign_health)}>
            {campaign.campaign_health === 'not_set' ? 'Not set' : campaign.campaign_health}
          </Pill>
        </div>
      </div>

      <p className="text-2xs text-ink-tertiary">
        {viewMode === 'board'
          ? <>Click a creator card for a quick summary, or switch to <span className="font-medium text-ink-secondary">List</span> for the full table.</>
          : <>Click any creator row to open their <span className="font-medium text-ink-secondary">Engagement Record</span></>}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterBar
          filters={['Status', 'Owner', 'Interest', 'Follow-up due']}
          active={activeFilters}
          onToggle={(f) =>
            setActiveFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))
          }
          onClear={() => setActiveFilters([])}
        />
        <div className="flex rounded-md border border-line p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('board')}
            className={`rounded px-2.5 py-1 text-2xs font-medium transition-colors ${
              viewMode === 'board' ? 'bg-ink text-white' : 'text-ink-secondary hover:text-ink'
            }`}
          >
            Board
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`rounded px-2.5 py-1 text-2xs font-medium transition-colors ${
              viewMode === 'list' ? 'bg-ink text-white' : 'text-ink-secondary hover:text-ink'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {viewMode === 'board' ? (
        <CampaignKanbanBoard
          engagements={boardEngagements}
          userRole={user?.role}
          boardRevision={boardRevision}
          onCardClick={(row) => setQuickEditId(row.id)}
          onApplyLogging={applyEngagementLogging}
          onApplyDeliverables={applyDeliverablesLogging}
          onApplyDidntDeliver={applyDidntDeliverLogging}
          onApplyReopen={applyReopenLogging}
          onApplyContactFeedback={applyContactFeedbackLogging}
          onLoggingError={(message) => {
            setToast({ message, onUndo: null });
            window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 5000);
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={filteredEngagements}
          onRowClick={(row) => navigate(`/engagements/${row.id}`)}
        />
      )}

      <CampaignQuickEditDrawer
        engagementId={quickEditId}
        open={Boolean(quickEditId)}
        onClose={() => setQuickEditId(null)}
        onUpdated={reloadEngagements}
      />

      <AddCreatorsDrawer
        open={addOpen}
        campaignId={id}
        campaignName={campaign.campaign_name}
        onClose={() => setAddOpen(false)}
        onAdded={reloadEngagements}
      />

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-zinc-700 bg-ink px-4 py-3 text-sm text-white shadow-lg shadow-ink/30">
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            {toast.onUndo && (
              <button
                type="button"
                className="shrink-0 text-2xs font-medium text-white/90 underline-offset-2 hover:underline"
                onClick={toast.onUndo}
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddCreatorsDrawer({ open, onClose, campaignId, campaignName, onAdded }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [adding, setAdding] = useState(false);
  const contacts = getDemoContacts().filter((c) => !c.is_blacklisted && c.status !== 'archived');

  const inCampaignIds = useMemo(
    () => getContactIdsInCampaign(campaignId),
    [campaignId, open],
  );

  const toggle = (rowId) => {
    if (inCampaignIds.has(String(rowId))) return;
    setSelected((s) => (s.includes(rowId) ? s.filter((x) => x !== rowId) : [...s, rowId]));
  };

  useEffect(() => {
    if (!open) {
      setSelected([]);
    }
  }, [open]);

  async function handleAddToCampaign() {
    const picked = contacts.filter(
      (c) => selected.includes(c.id) && !inCampaignIds.has(String(c.id)),
    );
    if (picked.length === 0) {
      if (selected.length > 0) {
        setToast('Selected creators are already on this campaign');
      } else {
        setToast('Select at least one creator');
      }
      return;
    }

    setAdding(true);
    const skippedCount = selected.length - picked.length;

    try {
      const result = await campaignsApi.populate(campaignId, {
        contact_ids: picked.map((c) => c.id),
      });
      const created = Array.isArray(result) ? result : result?.created ?? [];
      if (created.length === 0 && picked.length > 0) {
        importContactsToCampaignDemo({
          campaignId,
          campaignName,
          contacts: picked,
          ownerName: user?.full_name,
        });
      }
    } catch {
      importContactsToCampaignDemo({
        campaignId,
        campaignName,
        contacts: picked,
        ownerName: user?.full_name,
      });
    }

    setAdding(false);
    let message = `Added ${picked.length} creator${picked.length === 1 ? '' : 's'} to campaign`;
    if (skippedCount > 0) {
      message += ` · ${skippedCount} already on campaign`;
    }
    setToast(message);
    onAdded?.();
    setSelected([]);
    onClose();
  }

  return (
    <>
      <Drawer
        open={open}
        title="Add creators"
        onClose={onClose}
        footer={
          <div className="flex items-center justify-between">
            <span className="text-2xs text-ink-tertiary">
              {selected.length} selected · blacklisted hidden
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => setQuickOpen(true)}>
                Quick Add
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={adding || selected.length === 0}
                onClick={handleAddToCampaign}
              >
                {adding ? 'Adding…' : 'Add to campaign'}
              </button>
            </div>
          </div>
        }
      >
        <FilterBar filters={['Category', 'City', 'Classification', 'Tags', 'Saved list']} />
        <div className="mt-4">
        <DataTable
          selectable
          selected={selected}
          onSelect={toggle}
          isRowDisabled={(row) => inCampaignIds.has(String(row.id))}
          columns={[
            {
              key: 'full_name',
              label: 'Name',
              render: (r, { disabled }) => (
                <div>
                  <span className={disabled ? 'text-ink-tertiary' : 'font-medium text-ink'}>
                    {r.full_name}
                  </span>
                  {disabled && (
                    <span className="mt-0.5 block text-2xs text-ink-tertiary">Already on campaign</span>
                  )}
                </div>
              ),
            },
            { key: 'city', label: 'City' },
            { key: 'classification', label: 'Class', render: (r) => r.classification?.replace('_', ' ') ?? '—' },
          ]}
          rows={contacts}
        />
        </div>
      </Drawer>

      <QuickAddModal
        open={quickOpen}
        defaultCampaignId={campaignId}
        onClose={() => setQuickOpen(false)}
        onSaved={() => {
          onAdded?.();
          setToast('Contact saved — select them above to add to campaign');
        }}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

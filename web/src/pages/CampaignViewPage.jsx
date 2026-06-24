import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { DataTable } from '../components/ui/DataKit.jsx';
import { Drawer, EmptyState, Toast } from '../components/ui/Primitives.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { CampaignKanbanBoard } from '../components/campaign/CampaignKanbanBoard.jsx';
import { CampaignQuickEditDrawer } from '../components/campaign/CampaignQuickEditDrawer.jsx';
import { CampaignMetricTiles } from '../components/campaign/CampaignMetricTiles.jsx';
import { CampaignFilterBar, CAMPAIGN_EMPTY_FILTERS } from '../components/campaign/CampaignFilterBar.jsx';
import { QuickAddModal } from '../components/contacts/QuickAddModal.jsx';
import { filterCampaignEngagements } from '../lib/campaignBoardFilters.js';
import { Pill, formatStatus, formatDate, formatFee, statusTone } from '../lib/format.jsx';
import { MODULES } from '../lib/modules.js';
import { campaignsApi, contactsApi, engagementsApi } from '../lib/api.js';
import {
  patchEngagement,
  syncDeliverables,
  saveFeedback,
  patchContact,
  blacklistContact,
  clearBlacklist,
  populateCampaign,
  fetchPopulationContacts,
  fetchDeliverables,
} from '../lib/persistence.js';
import { setDeliverablesCache, updateEngagementDeliverables } from '../lib/deliverablesCache.js';
import { BoardFeedbackDrawer } from '../components/feedback/FeedbackDrawer.jsx';
import { DeliverableProofDrawer } from '../components/deliverables/DeliverableProofDrawer.jsx';
import { buildContactFeedbackUpdate, contactFeedbackToastMessage } from '../lib/contactFeedbackLogging.js';
import { getContactProfileExtras } from '../lib/contactProfile.js';
import { mergeContactsCache } from '../lib/contactsCache.js';
import { useAuth } from '../context/AuthContext.jsx';

async function loadCampaignData(campaignId) {
  const [camp, engs] = await Promise.all([
    campaignsApi.get(campaignId),
    engagementsApi.byCampaign(campaignId),
  ]);

  const deliverablesMap = {};
  await Promise.all(
    (engs ?? []).map(async (eng) => {
      deliverablesMap[eng.id] = await fetchDeliverables(eng.id);
    }),
  );

  setDeliverablesCache(deliverablesMap);
  return { camp, engs: engs ?? [], deliverablesMap };
}

export function CampaignViewPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState(CAMPAIGN_EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState('board');
  const [quickEditId, setQuickEditId] = useState(null);
  const [scheduleIntent, setScheduleIntent] = useState(false);
  const [scheduleLogContact, setScheduleLogContact] = useState(false);
  const [proofEngagement, setProofEngagement] = useState(null);
  const [feedbackEngagement, setFeedbackEngagement] = useState(null);
  const [toast, setToast] = useState(null);
  const [boardRevision, setBoardRevision] = useState(0);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { camp, engs, deliverablesMap } = await loadCampaignData(id);
      setCampaign(camp);
      setEngagements(engs);
      setDeliverablesCache(deliverablesMap);
      setBoardRevision((r) => r + 1);
    } catch (err) {
      setError(err.message ?? 'Could not load campaign');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [id, location.key, reload]);

  useEffect(() => {
    const scheduleId = location.state?.scheduleEngagementId;
    if (!scheduleId) return;
    setScheduleIntent(true);
    setScheduleLogContact(Boolean(location.state?.scheduleLogContact));
    setQuickEditId(scheduleId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  const filteredEngagements = useMemo(
    () => filterCampaignEngagements(engagements, activeFilters),
    [engagements, activeFilters, boardRevision],
  );

  function showActionToast(message, onUndo) {
    setToast({ message, onUndo });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 8000);
  }

  async function applyEngagementLogging(engagementId, patch, message, snapshotKeys) {
    const base = engagements.find((e) => e.id === engagementId);
    const snapshot = {};
    for (const key of snapshotKeys) snapshot[key] = base?.[key];

    try {
      const updated = await patchEngagement(engagementId, patch);
      setEngagements((rows) => rows.map((r) => (r.id === engagementId ? { ...r, ...updated } : r)));
      setBoardRevision((r) => r + 1);
      showActionToast(message, async () => {
        const restored = await patchEngagement(engagementId, snapshot);
        setEngagements((rows) => rows.map((r) => (r.id === engagementId ? { ...r, ...restored } : r)));
        setBoardRevision((r) => r + 1);
        setToast(null);
      });
    } catch (err) {
      setToast({ message: err.message ?? 'Save failed', onUndo: null });
    }
  }

  async function applyDeliverablesLogging(engagementId, nextList, message) {
    const beforeList = await fetchDeliverables(engagementId);
    try {
      const saved = await syncDeliverables(engagementId, beforeList, nextList);
      updateEngagementDeliverables(engagementId, saved);
      setBoardRevision((r) => r + 1);
      showActionToast(message, async () => {
        await syncDeliverables(engagementId, saved, beforeList);
        updateEngagementDeliverables(engagementId, beforeList);
        setBoardRevision((r) => r + 1);
        setToast(null);
      });
    } catch (err) {
      setToast({ message: err.message ?? 'Save failed', onUndo: null });
    }
  }

  async function applyDidntDeliverLogging(engagementId, { engagementPatch, blacklist, message }) {
    const base = engagements.find((e) => e.id === engagementId);
    const engagementSnapshot = {};
    for (const key of Object.keys(engagementPatch)) {
      engagementSnapshot[key] = base?.[key];
    }
    const contactId = base?.contact_id;

    try {
      await patchEngagement(engagementId, { ...engagementPatch, blacklist });
      if (blacklist && contactId) {
        await blacklistContact(contactId, "Didn't deliver");
      }
      await reload();
      showActionToast(message, async () => {
        await patchEngagement(engagementId, engagementSnapshot);
        setToast(null);
        await reload();
      });
    } catch (err) {
      setToast({ message: err.message ?? 'Save failed', onUndo: null });
    }
  }

  async function applyReopenLogging(engagementId, { engagementPatch, clearBlacklist: shouldClear, message }) {
    const base = engagements.find((e) => e.id === engagementId);
    const engagementSnapshot = {};
    for (const key of Object.keys(engagementPatch)) {
      engagementSnapshot[key] = base?.[key];
    }
    engagementSnapshot.dropped_from = base?.dropped_from ?? null;
    engagementSnapshot.drop_reason = base?.drop_reason ?? null;
    const contactId = base?.contact_id;

    try {
      await patchEngagement(engagementId, engagementPatch);
      if (shouldClear && contactId) {
        try {
          await clearBlacklist(contactId);
        } catch {
          /* no active blacklist */
        }
      }
      await reload();
      showActionToast(message, async () => {
        await patchEngagement(engagementId, engagementSnapshot);
        setToast(null);
        await reload();
      });
    } catch (err) {
      setToast({ message: err.message ?? 'Save failed', onUndo: null });
    }
  }

  async function applyContactFeedbackLogging(
    engagementId,
    { contactId, contactProfilePatch, engagementFeedback, message },
  ) {
    try {
      if (contactProfilePatch && Object.keys(contactProfilePatch).length) {
        await patchContact(contactId, contactProfilePatch);
        mergeContactsCache([{ id: contactId, ...contactProfilePatch }]);
      }
      await saveFeedback(engagementId, engagementFeedback);
      showActionToast(message, null);
      setBoardRevision((r) => r + 1);
    } catch (err) {
      setToast({ message: err.message ?? 'Save failed', onUndo: null });
    }
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

  if (loading && !campaign) {
    return (
      <div className="mx-auto max-w-6xl py-12 text-center text-sm text-ink-secondary">
        Loading campaign…
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState title="Campaign unavailable" description={error ?? 'Not found'} />
      </div>
    );
  }

  return (
    <div className="relative -mx-4 min-h-[calc(100vh-8rem)] px-4 pb-6">
      <CampaignAuroraBackground />
      <div className="relative z-10 mx-auto max-w-6xl space-y-1.5">
      <PageHeader
        title={campaign.campaign_name}
        subtitle={`${MODULES.campaignView.pageTitle} · ${campaign.brand_name}`}
        actions={<button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>Add Creators</button>}
      />

      <CampaignMetricTiles campaign={campaign} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <CampaignFilterBar
          engagements={filteredEngagements}
          filters={activeFilters}
          onChange={setActiveFilters}
        />
        <div className="campaign-glass-segment">
          <button
            type="button"
            onClick={() => setViewMode('board')}
            className={
              viewMode === 'board'
                ? 'campaign-glass-segment-btn-selected'
                : 'campaign-glass-segment-btn'
            }
          >
            Board
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={
              viewMode === 'list'
                ? 'campaign-glass-segment-btn-selected'
                : 'campaign-glass-segment-btn'
            }
          >
            List
          </button>
        </div>
      </div>

      {viewMode === 'board' ? (
        <CampaignKanbanBoard
          engagements={filteredEngagements}
          userRole={user?.role}
          boardRevision={boardRevision}
          onCardClick={(row) => {
            setScheduleIntent(false);
            setScheduleLogContact(false);
            setQuickEditId(row.id);
          }}
          onRequestSchedule={(row) => {
            setScheduleIntent(true);
            setScheduleLogContact(true);
            setQuickEditId(row.id);
          }}
          onOpenDrawer={(row) => {
            setScheduleIntent(false);
            setScheduleLogContact(false);
            setQuickEditId(row.id);
          }}
          onRequestProof={(row) => setProofEngagement(row)}
          onRequestFeedback={(row) => setFeedbackEngagement(row)}
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
        scheduleMode={scheduleIntent}
        scheduleLogContact={scheduleLogContact}
        onClose={() => {
          setQuickEditId(null);
          setScheduleIntent(false);
          setScheduleLogContact(false);
        }}
        onScheduleModeCleared={() => {
          setScheduleIntent(false);
          setScheduleLogContact(false);
        }}
        onUpdated={reload}
      />

      <DeliverableProofDrawer
        engagementId={proofEngagement?.id}
        contactName={proofEngagement?.contact_name}
        open={Boolean(proofEngagement)}
        onClose={() => setProofEngagement(null)}
      />

      <BoardFeedbackDrawer
        open={Boolean(feedbackEngagement)}
        contactName={feedbackEngagement?.contact_name ?? ''}
        contactId={feedbackEngagement?.contact_id}
        onClose={() => setFeedbackEngagement(null)}
        onSubmit={({ rating, wouldWorkAgain, note }) => {
          if (!feedbackEngagement) return;
          const existing = getContactProfileExtras(feedbackEngagement.contact_id);
          const { contactProfilePatch, engagementFeedback } = buildContactFeedbackUpdate(existing, {
            rating,
            wouldWorkAgain,
            note,
          });
          applyContactFeedbackLogging(feedbackEngagement.id, {
            contactId: feedbackEngagement.contact_id,
            contactProfilePatch,
            engagementFeedback,
            message: contactFeedbackToastMessage(rating, wouldWorkAgain),
          });
          setFeedbackEngagement(null);
        }}
      />

      <AddCreatorsDrawer
        open={addOpen}
        campaignId={id}
        campaignName={campaign.campaign_name}
        engagementContactIds={engagements.map((e) => e.contact_id)}
        onClose={() => setAddOpen(false)}
        onAdded={reload}
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
    </div>
  );
}

function CampaignAuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-[#f7f5fa]/90 via-[#f3f5f8]/85 to-[#f0f6f4]/90" />
      <div className="absolute -left-20 -top-24 h-[420px] w-[420px] rounded-full bg-violet-200/30 blur-[120px]" />
      <div className="absolute -right-12 top-[8%] h-[360px] w-[360px] rounded-full bg-orange-100/25 blur-[120px]" />
      <div className="absolute bottom-[-8%] left-[20%] h-[340px] w-[340px] rounded-full bg-teal-100/22 blur-[120px]" />
    </div>
  );
}

function AddCreatorsDrawer({
  open,
  onClose,
  campaignId,
  campaignName,
  engagementContactIds,
  onAdded,
}) {
  const { user } = useAuth();
  const [selected, setSelected] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [adding, setAdding] = useState(false);

  const inCampaignIds = useMemo(
    () => new Set(engagementContactIds.map(String)),
    [engagementContactIds],
  );

  useEffect(() => {
    if (!open || !campaignId) return;
    setSelected([]);
    fetchPopulationContacts(campaignId)
      .then((rows) => {
        setContacts(rows ?? []);
        mergeContactsCache(rows);
      })
      .catch(() => setContacts([]));
  }, [open, campaignId]);

  const toggle = (rowId) => {
    if (inCampaignIds.has(String(rowId))) return;
    setSelected((s) => (s.includes(rowId) ? s.filter((x) => x !== rowId) : [...s, rowId]));
  };

  async function handleAddToCampaign() {
    const picked = contacts.filter(
      (c) => selected.includes(c.id) && !inCampaignIds.has(String(c.id)),
    );
    if (picked.length === 0) {
      setToast(selected.length > 0 ? 'Selected creators are already on this campaign' : 'Select at least one creator');
      return;
    }

    setAdding(true);
    const skippedCount = selected.length - picked.length;

    try {
      const result = await populateCampaign(
        campaignId,
        picked.map((c) => c.id),
        user?.id,
      );
      const created = result?.created ?? [];
      if (created.length === 0 && picked.length > 0) {
        throw new Error('No new engagements created');
      }
    } catch (err) {
      setToast(err.message ?? 'Could not add creators');
      setAdding(false);
      return;
    }

    setAdding(false);
    let message = `Added ${picked.length} creator${picked.length === 1 ? '' : 's'} to campaign`;
    if (skippedCount > 0) message += ` · ${skippedCount} already on campaign`;
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
        <div className="mt-4">
          {contacts.length === 0 ? (
            <p className="text-2xs text-ink-tertiary">No eligible contacts — try Quick Add.</p>
          ) : (
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
          )}
        </div>
      </Drawer>

      <QuickAddModal
        open={quickOpen}
        defaultCampaignId={campaignId}
        onClose={() => setQuickOpen(false)}
        onSaved={() => {
          fetchPopulationContacts(campaignId).then(setContacts).catch(() => {});
          setToast('Contact saved — select them above to add to campaign');
        }}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

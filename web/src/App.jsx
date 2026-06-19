import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ContactsPage, ContactProfilePage } from './pages/ContactsPage.jsx';
import { CampaignViewPage } from './pages/CampaignViewPage.jsx';
import { EngagementRecordPage, PlaceholderPage } from './pages/EngagementRecordPage.jsx';
import { Modal } from './components/ui/Primitives.jsx';

export default function App() {
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <>
      <Routes>
        <Route element={<AppShell onQuickAdd={() => setQuickAddOpen(true)} />}>
          <Route index element={<DashboardPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="contacts/:id" element={<ContactProfilePage />} />
          <Route path="campaigns/:id" element={<CampaignViewPage />} />
          <Route path="engagements/:id" element={<EngagementRecordPage />} />
          <Route path="brands" element={<PlaceholderPage title="Brands" description="Brand roster — coming in build step 5" />} />
          <Route path="registrations" element={<PlaceholderPage title="Registrations" description="Approval queue — coming in build step 11" />} />
          <Route path="reports" element={<PlaceholderPage title="Reports" description="Monthly reporting — coming in build step 10" />} />
        </Route>
      </Routes>

      <Modal
        open={quickAddOpen}
        title="Quick Add"
        onClose={() => setQuickAddOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setQuickAddOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={() => setQuickAddOpen(false)}>Save</button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-slate-500">Capture a creator in under 15 seconds.</p>
        <div className="grid gap-3">
          <input className="input-field" placeholder="Full name" />
          <input className="input-field" placeholder="Mobile number" />
          <input className="input-field" placeholder="Instagram URL" />
          <input className="input-field" placeholder="City" />
        </div>
      </Modal>
    </>
  );
}

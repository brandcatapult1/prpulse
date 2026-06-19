import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { RequireAuth } from './components/layout/RequireAuth.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ContactsPage, ContactProfilePage } from './pages/ContactsPage.jsx';
import { CampaignsPage } from './pages/CampaignsPage.jsx';
import { CampaignViewPage } from './pages/CampaignViewPage.jsx';
import { EngagementRecordPage, PlaceholderPage } from './pages/EngagementRecordPage.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { RegistrationsPage } from './pages/RegistrationsPage.jsx';
import { BrandsPage } from './pages/BrandsPage.jsx';
import { PublicRegistrationPage } from './pages/PublicRegistrationPage.jsx';
import { Modal } from './components/ui/Primitives.jsx';

export default function App() {
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <AuthProvider>
      <Routes>
        <Route path="/signup" element={<PublicRegistrationPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell onQuickAdd={() => setQuickAddOpen(true)} />}>
            <Route index element={<DashboardPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="contacts/:id" element={<ContactProfilePage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="campaigns/:id" element={<CampaignViewPage />} />
            <Route path="engagements/:id" element={<EngagementRecordPage />} />
            <Route path="brands" element={<BrandsPage />} />
            <Route path="registrations" element={<RegistrationsPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
        </Route>
      </Routes>

      <Modal
        open={quickAddOpen}
        title="Quick Add"
        onClose={() => setQuickAddOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setQuickAddOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary" onClick={() => setQuickAddOpen(false)}>Save</button>
          </div>
        }
      >
        <p className="mb-4 text-2xs text-ink-secondary">Capture a creator in under 15 seconds.</p>
        <div className="grid gap-3">
          <input className="input-field" placeholder="Full name" />
          <input className="input-field" placeholder="Mobile number" />
          <input className="input-field" placeholder="Instagram URL" />
          <input className="input-field" placeholder="City" />
        </div>
      </Modal>
    </AuthProvider>
  );
}

import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { RequireAuth } from './components/layout/RequireAuth.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ContactsPage } from './pages/ContactsPage.jsx';
import { ContactProfilePage } from './pages/ContactProfilePage.jsx';
import { CampaignsPage } from './pages/CampaignsPage.jsx';
import { CampaignViewPage } from './pages/CampaignViewPage.jsx';
import { EngagementRecordPage, PlaceholderPage } from './pages/EngagementRecordPage.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { RegistrationsPage } from './pages/RegistrationsPage.jsx';
import { BrandsPage } from './pages/BrandsPage.jsx';
import { BulkImportPage } from './pages/BulkImportPage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { PublicRegistrationPage } from './pages/PublicRegistrationPage.jsx';
import { AddContactDrawer } from './components/contacts/AddContactDrawer.jsx';

export default function App() {
  const [addContactOpen, setAddContactOpen] = useState(false);

  return (
    <AuthProvider>
      <Routes>
        <Route path="/signup" element={<PublicRegistrationPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell onAddContact={() => setAddContactOpen(true)} />}>
            <Route index element={<DashboardPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="contacts/:id" element={<ContactProfilePage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="campaigns/:id" element={<CampaignViewPage />} />
            <Route path="engagements/:id" element={<EngagementRecordPage />} />
            <Route path="brands" element={<BrandsPage />} />
            <Route path="registrations" element={<RegistrationsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="import" element={<BulkImportPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/:sectionKey" element={<SettingsPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Routes>

      <AddContactDrawer open={addContactOpen} onClose={() => setAddContactOpen(false)} />
    </AuthProvider>
  );
}

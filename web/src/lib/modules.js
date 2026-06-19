/**
 * PRD / UX spec module names — single source for nav labels, page titles, and routes.
 * Sidebar labels follow AppShell (UX §0.2); page titles follow each screen section.
 */
export const MODULES = {
  dashboard: {
    prd: 7,
    navLabel: 'Dashboard',
    pageTitle: 'Dashboard',
    subtitle: 'What needs action today',
    path: '/',
  },
  contactDatabase: {
    prd: 1,
    navLabel: 'Contacts',
    pageTitle: 'Contact Database',
    subtitle: 'Find a creator fast and act on them',
    path: '/contacts',
  },
  contactProfile: {
    prd: 1,
    pageTitle: 'Contact Profile',
    subtitle: 'Relationship memory',
  },
  registration: {
    prd: 2,
    navLabel: 'Registrations',
    pageTitle: 'Approval Queue',
    subtitle: 'Clear pending creator registrations',
    path: '/registrations',
  },
  brands: {
    prd: 3,
    navLabel: 'Brands',
    pageTitle: 'Brand Management',
    subtitle: 'Client roster and reference data',
    path: '/brands',
  },
  campaigns: {
    prd: 4,
    navLabel: 'Campaigns',
    pageTitle: 'Campaigns',
    subtitle: 'Select a campaign to run outreach',
    path: '/campaigns',
  },
  campaignView: {
    prd: 4,
    pageTitle: 'Campaign View',
    subtitle: 'Run a campaign — see progress and act on engagements',
  },
  engagementRecord: {
    prd: 5,
    pageTitle: 'Engagement Record',
    subtitle: 'Advance one creator\'s outreach',
  },
  deliverables: {
    prd: 6,
    pageTitle: 'Deliverables',
  },
  reporting: {
    prd: 8,
    navLabel: 'Reports',
    pageTitle: 'Reporting',
    subtitle: 'Build a client-ready monthly report',
    path: '/reports',
  },
  feedback: {
    prd: 9,
    pageTitle: 'Feedback',
  },
  admin: {
    prd: 11,
    navLabel: 'Admin',
    pageTitle: 'Admin',
    subtitle: 'Users, roles, and audit log',
    path: '/admin',
  },
};

export const NAV_ITEMS = [
  MODULES.dashboard,
  MODULES.contactDatabase,
  MODULES.campaigns,
  MODULES.brands,
  MODULES.registration,
  MODULES.reporting,
  MODULES.admin,
].map((m) => ({ to: m.path, label: m.navLabel, end: m.path === '/' }));

export const CONTACT_PROFILE_TABS = [
  'Overview',
  'Collaboration History',
  'Active Engagements',
  'Feedback History',
  'Notes',
];

export const DASHBOARD_WIDGETS = {
  followUpsDueToday: 'Follow-ups Due Today',
  overdueDeliverables: 'Overdue Deliverables',
  deliverablesDue: 'Deliverables Due',
  upcomingVisits: 'Upcoming Visits',
  stalled: 'Stalled Engagements',
  campaignTargetTracker: 'Campaign Target Tracker',
};

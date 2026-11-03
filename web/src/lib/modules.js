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
    navLabel: 'PR Progress - Client',
    pageTitle: 'PR Progress - Client',
    subtitle: 'Build a client-ready monthly report',
    path: '/reports/client',
  },
  prProgress: {
    navLabel: 'PR Progress - Campaign',
    pageTitle: 'PR Progress - Campaign',
    subtitle: 'Campaign-wise outreach progress for a cycle',
    path: '/reports/campaign',
  },
  prProgressTeam: {
    navLabel: 'PR Progress - Team',
    pageTitle: 'PR Progress - Team',
    subtitle: 'Account manager-wise outreach progress for a cycle',
    path: '/reports/team',
  },
  feedback: {
    prd: 9,
    pageTitle: 'Feedback',
  },
  settings: {
    navLabel: 'Settings',
    pageTitle: 'Settings',
    subtitle: 'Organization configuration',
    path: '/settings',
  },
};

export const NAV_ITEMS = [
  MODULES.dashboard,
  MODULES.contactDatabase,
  MODULES.campaigns,
  MODULES.brands,
  MODULES.registration,
  {
    // "Reports" is a parent menu; its pages are the PR Progress views.
    to: '/reports',
    label: 'Reports',
    children: [MODULES.reporting, MODULES.prProgress, MODULES.prProgressTeam],
  },
  MODULES.settings,
].map((m) => (m.children
  ? { to: m.to, label: m.label, children: m.children.map((c) => ({ to: c.path, label: c.navLabel })) }
  : { to: m.path, label: m.navLabel, end: m.path === '/' }));

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

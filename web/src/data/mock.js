export const MOCK_USER = {
  id: '1',
  full_name: 'Priya Sharma',
  role: 'campaign_manager',
  email: 'priya@brandcatapult.com',
};

export const MOCK_CONTACTS = [
  { id: '1', full_name: 'Aisha K.', city: 'Delhi', classification: 'micro', status: 'active', tags: ['Luxury', 'UGC'] },
  { id: '2', full_name: 'Rohan T.', city: 'Mumbai', classification: 'mid', status: 'active', tags: ['F&B'] },
  { id: '3', full_name: 'Neha S.', city: 'Bangalore', classification: 'nano', status: 'active', tags: ['Beauty'], is_blacklisted: true },
  { id: '4', full_name: 'Kabir M.', city: 'Jaipur', classification: 'macro', status: 'active', tags: ['Travel'] },
];

export const MOCK_CAMPAIGN = {
  id: 'c1',
  campaign_name: 'Summer F&B Push',
  brand_name: 'BrandX',
  status: 'active',
  target_collaborations: 20,
  completed_collaborations: 14,
  remaining_collaborations: 6,
  achievement_pct: 70,
  campaign_health: 'amber',
};

export const MOCK_ENGAGEMENTS = [
  {
    id: 'e1',
    contact_name: 'Aisha K.',
    owner_name: 'Priya Sharma',
    conversation_status: 'in_conversation',
    interest_level: 'medium',
    next_follow_up_date: '2026-06-24',
    agreed_fee: null,
  },
  {
    id: 'e2',
    contact_name: 'Rohan T.',
    owner_name: 'Priya Sharma',
    conversation_status: 'collaboration_complete',
    interest_level: 'high',
    next_follow_up_date: null,
    agreed_fee: 40000,
  },
];

export const MOCK_ENGAGEMENT = {
  id: 'e1',
  contact_name: 'Aisha K.',
  campaign_name: 'Summer F&B Push',
  brand_name: 'BrandX',
  owner_name: 'Priya Sharma',
  conversation_status: 'in_conversation',
  interest_level: 'medium',
  last_contact_date: '2026-06-18',
  next_follow_up_date: '2026-06-24',
  agreed_fee: null,
  primary_collaboration_reason: null,
  notes: 'Interested in barter for launch week. Follow up after menu tasting.',
};

export const MOCK_DELIVERABLES = [
  { id: 'd1', deliverable_type: 'reel', quantity: 1, due_date: '2026-06-20', status: 'pending', is_overdue: false },
  { id: 'd2', deliverable_type: 'story', quantity: 3, due_date: '2026-06-18', status: 'posted', is_overdue: true },
];

export const MOCK_DASHBOARD = {
  follow_ups_due: [
    { id: 'e1', full_name: 'Aisha K.', campaign_name: 'Summer F&B Push', next_follow_up_date: '2026-06-24' },
    { id: 'e3', full_name: 'Kabir M.', campaign_name: 'Luxury Launch', next_follow_up_date: '2026-06-19' },
  ],
  overdue_deliverables: [
    { id: 'd2', deliverable_type: 'story', full_name: 'Aisha K.', campaign_name: 'Summer F&B Push' },
  ],
  active_campaigns: [MOCK_CAMPAIGN],
};

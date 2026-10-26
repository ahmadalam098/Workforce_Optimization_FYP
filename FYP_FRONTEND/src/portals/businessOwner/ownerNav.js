// Sidebar of the Business Owner portal.
export const OWNER_NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', icon: 'dashboard', to: '/owner/dashboard', ready: true }],
  },
  {
    title: 'Business',
    items: [
      { label: 'Employees', icon: 'users', to: '/owner/employees', ready: true },
      { label: 'My Payouts', icon: 'chart', to: '/owner/payouts', ready: true },
      { label: 'Balance Sheet', icon: 'file', to: '/owner/balance-sheet', ready: true },
    ],
  },
  {
    title: 'Account',
    items: [{ label: 'Settings', icon: 'settings', to: '/owner/settings', ready: true }],
  },
]

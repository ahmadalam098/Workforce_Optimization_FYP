// Sidebar of the Organization portal. More sections are added when the dashboard requirements are known.
export const ORGANIZATION_NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', icon: 'dashboard', to: '/organization/dashboard', ready: true }],
  },
  {
    title: 'Agreements',
    items: [{ label: 'Contracts', icon: 'file', to: '/organization/contracts', ready: true }],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Invoices', icon: 'file', to: '/organization/invoices', ready: true },
      { label: 'Payments', icon: 'chart', to: '/organization/payments', ready: true },
      { label: 'Statements', icon: 'file', to: '/organization/statements', ready: true },
    ],
  },
  {
    title: 'Insights',
    items: [{ label: 'Reports', icon: 'chart', to: '/organization/reports', ready: true }],
  },
  {
    title: 'Communication',
    items: [{ label: 'Chat', icon: 'send', to: '/organization/chat', ready: true }],
  },
  {
    title: 'Staff',
    items: [
      { label: 'Live Team', icon: 'phone', to: '/organization/team', ready: true },
      { label: 'Employees', icon: 'users', to: '/organization/employees', ready: true },
      { label: 'Staff Requests', icon: 'inbox', to: '/organization/requests', ready: true },
    ],
  },
  {
    title: 'Account',
    items: [{ label: 'Settings', icon: 'settings', to: '/organization/settings', ready: true }],
  },
]

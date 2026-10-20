// Sidebar of the Organization Manager portal. `ready: false` items are shown as "Soon" until their pages and APIs exist.
export const MANAGER_NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', icon: 'dashboard', to: '/manager/dashboard', ready: true }],
  },
  {
    title: 'My organizations',
    items: [
      { label: 'Employee Pool', icon: 'users', to: '/manager/employee-pool', ready: true },
      { label: 'Salary Status', icon: 'chart', to: '/manager/salaries', ready: true },
      { label: 'Performance Monitoring', icon: 'activity', to: '/manager/performance', ready: true },
      { label: 'My Organizations', icon: 'building', to: '/manager/organizations', ready: true },
      { label: 'Minimum Staff', icon: 'users', to: '/manager/minimum-staff', ready: true },
      { label: 'Staff Requests', icon: 'inbox', to: '/manager/requests', ready: true },
      { label: 'Assignment Offers', icon: 'send', to: '/manager/offers', ready: true },
      { label: 'Employee Reviews', icon: 'activity', to: '/manager/reviews', ready: true },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Chat', icon: 'send', to: '/manager/chat', ready: true },
      { label: 'Calls', icon: 'phone', to: '/manager/calls', ready: true },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Invoices', icon: 'file', to: '/manager/invoices', ready: true },
      { label: 'Payments', icon: 'chart', to: '/manager/payments', ready: true },
      { label: 'Payment Notices', icon: 'inbox', to: '/manager/payment-submissions', ready: true },
      { label: 'Late Payments', icon: 'alert', to: '/manager/receivables', ready: true },
      { label: 'Statements', icon: 'file', to: '/manager/statements', ready: true },
    ],
  },
  {
    title: 'Support',
    items: [{ label: 'Queries & Complaints', icon: 'inbox', to: '/manager/queries', ready: true }],
  },
  {
    title: 'Account',
    items: [{ label: 'Settings', icon: 'settings', to: '/manager/settings', ready: true }],
  },
]

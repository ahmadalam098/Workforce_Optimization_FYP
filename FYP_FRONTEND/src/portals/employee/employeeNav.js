// Sidebar of the Employee portal. `ready: false` items are shown as "Soon" until their pages and APIs exist.
export const EMPLOYEE_NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', icon: 'dashboard', to: '/employee/dashboard', ready: true }],
  },
  {
    title: 'My work',
    items: [
      { label: 'My Shifts', icon: 'clock', to: '/employee/shifts', ready: true },
      { label: 'My Hours', icon: 'activity', to: '/employee/hours', ready: true },
      { label: 'My Assignments', icon: 'building', to: '/employee/assignments', ready: true },
      { label: 'My Salary', icon: 'chart', to: '/employee/salary', ready: true },
    ],
  },
  {
    title: 'Communication',
    items: [{ label: 'Calls', icon: 'phone', to: '/employee/calls', ready: true }],
  },
  {
    title: 'Support',
    items: [{ label: 'My Queries', icon: 'inbox', to: '/employee/queries', ready: true }],
  },
  {
    title: 'Account',
    items: [{ label: 'Settings', icon: 'settings', to: '/employee/settings', ready: true }],
  },
]

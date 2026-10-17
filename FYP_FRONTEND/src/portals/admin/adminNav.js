// Sidebar of the Admin portal (from the WorkForceNexus mockup), grouped into sections.
// `ready: false` items are shown as "Soon" until their pages and APIs exist.
export const ADMIN_NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', icon: 'dashboard', to: '/admin/dashboard', ready: true }],
  },
  {
    title: 'Clients',
    items: [
      { label: 'Organizations', icon: 'building', to: '/admin/organizations', ready: true },
      { label: 'Contracts', icon: 'file', to: '/admin/contracts', ready: true },
    ],
  },
  {
    title: 'Workforce',
    items: [
      { label: 'Employee Pool', icon: 'users', to: '/admin/employees', ready: true },
      { label: 'Skills', icon: 'sparkles', to: '/admin/skills', ready: true },
      { label: 'Shifts', icon: 'clock', to: '/admin/shifts', ready: true },
      { label: 'Team', icon: 'team', to: '/admin/team', ready: true },
    ],
  },
  {
    title: 'Allocation',
    items: [
      { label: 'Staff Requests', icon: 'inbox', to: '/admin/requests', ready: true },
      { label: 'Allocations', icon: 'swap', to: '/admin/allocations', ready: true },
      { label: 'Allocation History', icon: 'history', to: '/admin/allocation-history', ready: true },
      { label: 'Availability', icon: 'signal', to: '/admin/availability', ready: true },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Invoices', icon: 'file', to: '/admin/invoices', ready: true },
      { label: 'Payroll', icon: 'users', to: '/admin/payroll', ready: true },
      { label: 'Salaries', icon: 'chart', to: '/admin/salaries', ready: true },
      { label: 'Payment Rules', icon: 'settings', to: '/admin/payment-rules', ready: true },
    ],
  },
  {
    title: 'Support & Insights',
    items: [
      { label: 'Queries', icon: 'inbox', to: '/admin/tickets', ready: true },
      { label: 'Reports', icon: 'chart', to: '/admin/reports', ready: true },
      { label: 'Review Requests', icon: 'alert', to: '/admin/review-requests', ready: true },
      { label: 'Audit Logs', icon: 'shield', to: '/admin/audit-logs', ready: true },
    ],
  },
  {
    title: 'System',
    items: [{ label: 'Settings', icon: 'settings', to: '/admin/settings', ready: true }],
  },
]

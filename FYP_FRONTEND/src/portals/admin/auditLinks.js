// Shared by the audit log page and the notification bell: where an audited item can be opened,
// and what colour an action gets.

const DETAIL_PAGES = {
  Employee: (id) => `/admin/employees/${id}`,
  Organization: (id) => `/admin/organizations/${id}`,
  Contract: (id) => `/admin/contracts/${id}`,
  Shift: (id) => `/admin/shifts/${id}`,
  Invoice: (id) => `/admin/invoices/${id}`,
  Payroll: (id) => `/admin/payroll/${id}`,
  Ticket: (id) => `/admin/tickets/${id}`,
  WorkforceRequest: (id) => `/admin/requests/${id}`,
}

// Items that have a list page but no page of their own.
const LIST_PAGES = {
  User: '/admin/team',
  Skill: '/admin/skills',
  Setting: '/admin/settings',
  PaymentRule: '/admin/payment-rules',
  ExchangeRate: '/admin/payment-rules',
  Allocation: '/admin/allocations',
}

/** The page to open for an audited item, or null when there is none. */
export function entityLink(entityType, entityId) {
  if (!entityType) return null
  if (entityId && DETAIL_PAGES[entityType]) return DETAIL_PAGES[entityType](entityId)
  return LIST_PAGES[entityType] ?? null
}

/** Tone of an action by what it does: creating is green, removing/rejecting red, the rest blue. */
export function actionTone(action) {
  if (/(DELETED|REJECTED|CANCELLED|TERMINATED|DEACTIVATED|SUSPENDED|REMOVED|OVERRIDE|FAILED)/.test(action)) return 'danger'
  if (/(CREATED|ADDED|APPROVED|ACTIVATED|ISSUED|PAID|RESOLVED|RECORDED|SET)/.test(action)) return 'success'
  return 'info'
}

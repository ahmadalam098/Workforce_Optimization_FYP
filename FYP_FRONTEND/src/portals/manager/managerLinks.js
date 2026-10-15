// Where a notification of the Organization Manager portal opens (the manager has its own pages, not the admin ones).

const DETAIL_PAGES = {
  Employee: (id) => `/manager/employees/${id}`,
  Organization: (id) => `/manager/organizations/${id}`,
  Invoice: (id) => `/manager/invoices/${id}`,
  Ticket: (id) => `/manager/queries/${id}`,
  WorkforceRequest: (id) => `/manager/requests/${id}`,
}

const LIST_PAGES = {
  Allocation: '/manager/employee-pool',
  Contract: '/manager/organizations',
  Payroll: '/manager/salaries',
}

/** The manager page to open for an audited item, or null when there is none. */
export function managerEntityLink(entityType, entityId) {
  if (!entityType) return null
  if (entityId && DETAIL_PAGES[entityType]) return DETAIL_PAGES[entityType](entityId)
  return LIST_PAGES[entityType] ?? null
}

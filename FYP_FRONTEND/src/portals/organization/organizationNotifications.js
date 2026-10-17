// What the Organization bell links to.

/** The organization page for a notification. */
export function organizationEntityLink(entityType, entityId) {
  if (entityType === 'Contract' && entityId) return `/organization/contracts/${entityId}`
  if (entityType === 'WorkforceRequest' && entityId) return `/organization/requests/${entityId}`
  if (entityType === 'Invoice' && entityId) return `/organization/invoices/${entityId}`
  if (entityType === 'Allocation') return '/organization/employees'
  return '/organization/dashboard'
}

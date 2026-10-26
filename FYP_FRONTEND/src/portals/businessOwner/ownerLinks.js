// What the Business Owner bell opens: a profit share opens its receipt, an expense opens the balance sheet, a payment the dashboard.
export function ownerEntityLink(entityType, entityId) {
  if (entityType === 'Payout' && entityId) return `/owner/documents/payout/${entityId}`
  if (entityType === 'Expense') return '/owner/balance-sheet'
  return '/owner/dashboard'
}

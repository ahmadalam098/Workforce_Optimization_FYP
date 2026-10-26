import { apiRequest } from '../apiClient.js'

// Endpoints from FYP_BACKEND/fyp_project/Controllers/BusinessOwner (Business Owner role only).

export const businessOwnerApi = {
  /** The signed-in owner: { userId, fullName, email, phone, roleName, signedInAt, previousSignInAt } */
  overview: (signal) => apiRequest('/api/business-owner/overview', { signal }),
  /**
   * period: 'allTime' | 'thisMonth' | 'lastMonth' | 'thisYear' ->
   * { period, periodLabel, organizations: { total, byStatus }, employees: { total, active, inactive }, money: { revenuePkr, expensePkr (expenses written down by the admin), profitPkr, sentToOwnersPkr, waitingToBeSentPkr },
   *   owners: { count, shares: [{ userId, fullName, email, sharePkr }] }, pendingPayments: { totals, byOrganization },
   *   utilization: { activeEmployees, working, free, percent }, allocationByOrganization: { items: [{ orgId, name, count }], otherCount },
   *   allocationActivity: [{ date, allocated, reallocated, released }], updatedAt }
   */
  dashboard: (period, signal) => apiRequest('/api/business-owner/dashboard', { params: { period }, signal }),
  /** params: { status ('active' | 'inactive'), search, page, pageSize } -> { items, total, page, pageSize, counts: { total, active, inactive } } */
  employees: (params, signal) => apiRequest('/api/business-owner/employees', { params, signal }),
}

export const ownerNotificationsApi = {
  /** { enabled, unreadCount, alerts: [], items: [{ id, action, title, message, createdAt, isUnread, ... }] } - revenue and expense changes only */
  feed: (limit, signal) => apiRequest('/api/business-owner/notifications', { params: { limit }, signal }),
  readAll: () => apiRequest('/api/business-owner/notifications/read-all', { method: 'POST' }),
}

export const ownerSettingsApi = {
  /** { userId, fullName, email, phone, roleName, createdAt } */
  profile: (signal) => apiRequest('/api/business-owner/settings/profile', { signal }),
  /** body: { fullName, phone } -> { message, user } (the email and role are fixed) */
  updateProfile: (body) => apiRequest('/api/business-owner/settings/profile', { method: 'PUT', body }),
  /** body: { currentPassword, newPassword } */
  changePassword: (body) => apiRequest('/api/business-owner/settings/password', { method: 'POST', body }),
  /** { signedInAt, previousSignInAt } */
  security: (signal) => apiRequest('/api/business-owner/settings/security', { signal }),
  /** { inApp, systemInAppEnabled } */
  notifications: (signal) => apiRequest('/api/business-owner/settings/notifications', { signal }),
  /** body: { inApp } */
  saveNotifications: (body) => apiRequest('/api/business-owner/settings/notifications', { method: 'PUT', body }),
}

/** The money of the business owner: the profit shares the admin sent (each with a receipt) and the company's balance sheet. */
export const ownerFinanceApi = {
  /** { totals: { allTimePkr, thisYearPkr, thisMonthPkr, count }, items: [{ payoutId, number, amountPkr, sentAt, label, owners }] } */
  payouts: (signal) => apiRequest('/api/business-owner/payouts', { signal }),
  /** year?, month? -> { balance, sheet, month: { label, totalPkr, byOrganization } } */
  balanceSheet: (year, month, signal) => apiRequest('/api/business-owner/balance-sheet', { params: { year, month }, signal }),
  transactions: (page, signal) => apiRequest('/api/business-owner/transactions', { params: { page, pageSize: 15 }, signal }),
}

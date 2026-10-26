import { API_BASE_URL } from '../../config/env.js'
import { apiRequest } from '../apiClient.js'

// The printable documents of every portal. One server builds them, so every portal sees the same document; the API gives each person only
// their own (an organization its invoices, a manager the invoices of the organizations they manage, a business owner the receipts of their profit shares ...).

export const documentsApi = {
  /** The invoice with its lines, payments, letterhead, amount in words and the verification code. A draft is for the admin only. */
  invoice: (id, signal) => apiRequest(`/api/documents/invoice/${id}`, { signal }),
  /** The receipt of one payment. */
  receipt: (id, signal) => apiRequest(`/api/documents/receipt/${id}`, { signal }),
  /** params: { orgId (admin / manager), from, to } -> one section per currency: opening, rows, closing */
  statement: (params, signal) => apiRequest('/api/documents/statement', { params, signal }),
  /** The receipt of one profit share the admin sent to a business owner (that owner, or the admin). */
  payout: (id, signal) => apiRequest(`/api/documents/payout/${id}`, { signal }),
}

/** The public check of a document (no sign-in): { valid, document } */
export const verifyApi = {
  check: (kind, number, code, signal) => apiRequest(`/api/verify/${kind}/${encodeURIComponent(number)}`, { params: { c: code }, signal }),
}

/** Where the proof file of a payment notice is shown (the browser sends the sign-in cookie). */
export const proofUrl = (submissionId) => `${API_BASE_URL}/api/documents/proof/${submissionId}`

/** The demo payment gateway's own side (no sign-in: the secret token is the key). A real gateway has its own hosted page; this is its stand-in. */
export const gatewayDemoApi = {
  /** { token, provider, demo, status, amount, currency, organization, invoiceNumber, failureReason, paymentId, receiptNumber } */
  checkout: (token, signal) => apiRequest(`/api/gateway/demo/${token}`, { signal }),
  /** outcome: 'pay' | 'fail' | 'cancel' -> { message, checkout } - plays the part of the gateway telling the server the result */
  result: (token, outcome) => apiRequest(`/api/gateway/demo/${token}/${outcome}`, { method: 'POST' }),
}

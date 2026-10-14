export const INVOICE_STATUS_OPTIONS = ['Draft', 'Issued', 'PartiallyPaid', 'Overdue', 'Paid', 'Cancelled'].map((value) => ({
  value,
  label: value === 'PartiallyPaid' ? 'Partly paid' : value,
}))

export const PAYMENT_METHOD_OPTIONS = ['Bank transfer', 'Cheque', 'Cash', 'Card', 'Online'].map((value) => ({ value, label: value }))

export const OVERTIME_STATUS_OPTIONS = ['Pending', 'Approved', 'Rejected'].map((value) => ({ value, label: value }))

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: new Date(2000, index, 1).toLocaleDateString(undefined, { month: 'long' }),
}))

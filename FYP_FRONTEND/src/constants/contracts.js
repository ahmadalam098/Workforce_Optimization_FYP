// Must match ContractLogic in the backend (Services/ContractLogic.cs).
export const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'].map((value) => ({ value, label: value }))

export const BILLING_CYCLE_OPTIONS = ['Weekly', 'Biweekly', 'Monthly', 'Quarterly'].map((value) => ({ value, label: value }))

export const CURRENCY_OPTIONS = ['USD', 'PKR', 'EUR', 'GBP', 'AED', 'SAR'].map((value) => ({ value, label: value }))

export const RULE_CATEGORIES = ['Staffing', 'Borrowing', 'Payment', 'Operational'].map((value) => ({ value, label: value }))

export const YES_NO_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

export const ORGANIZATION_STATUS_OPTIONS = ['Pending', 'Active', 'Rejected', 'Suspended'].map((value) => ({ value, label: value }))

export const CONTRACT_STATUS_OPTIONS = ['Pending', 'Active', 'Rejected', 'Terminated'].map((value) => ({ value, label: value }))

// Contract terms shown on the details page, in groups .
export const TERM_GROUPS = [
  {
    title: 'Staffing',
    fields: [
      { key: 'minEmployees', label: 'Minimum employees', type: 'number' },
      { key: 'maxEmployees', label: 'Maximum employees', type: 'number' },
      { key: 'priorityLevel', label: 'Priority', type: 'text' },
    ],
  },
  {
    title: 'Borrowing',
    fields: [
      { key: 'borrowingAllowed', label: 'Borrowing allowed', type: 'bool' },
      { key: 'maxBorrowedEmployees', label: 'Max borrowed employees', type: 'number' },
    ],
  },
  {
    title: 'Payment',
    fields: [
      { key: 'baseHourlyRate', label: 'Base hourly rate', type: 'money' },
      { key: 'extraHourlyRate', label: 'Extra hourly rate', type: 'money' },
      { key: 'billingCurrency', label: 'Currency', type: 'text' },
      { key: 'billingCycle', label: 'Billing cycle', type: 'text' },
    ],
  },
  {
    title: 'Period',
    fields: [
      { key: 'startDate', label: 'Start date', type: 'date' },
      { key: 'endDate', label: 'End date', type: 'date' },
      { key: 'startTime', label: 'Daily start time', type: 'time' },
      { key: 'endTime', label: 'Daily end time', type: 'time' },
    ],
  },
]

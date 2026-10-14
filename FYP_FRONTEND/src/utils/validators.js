// Every check returns '' when the value is fine, or a short message for the person filling in the form.
// The backend checks the same rules again (never trust the browser alone), so keep the two in step.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PERSON_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u
const ORGANIZATION_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s&.,'’()/-]*$/u
const COUNTRY_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’()-]*$/u
const CNIC_PATTERN = /^\d{5}-?\d{7}-?\d$/
const PHONE_CHARACTERS = /^\+?[\d\s()-]+$/
const RULE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{2,49}$/

const isBlank = (value) => value === undefined || value === null || String(value).trim() === ''
const text = (value) => String(value ?? '').trim()

// ---------------------------------------------------------------- text

/** Required / length checks for any piece of text. `pattern` + `patternMessage` add a character rule. */
export function validateText(value, { label = 'This field', required = true, min = 0, max = 255, pattern, patternMessage } = {}) {
  const value1 = text(value)
  if (!value1) return required ? `${label} is required.` : ''
  if (value1.length < min) return `${label} must be at least ${min} characters.`
  if (value1.length > max) return `${label} must be at most ${max} characters.`
  if (pattern && !pattern.test(value1)) return patternMessage || `${label} has characters that are not allowed.`
  return ''
}

export function validateRequired(value, label) {
  return isBlank(value) ? `${label} is required.` : ''
}

/** A person's name: letters, spaces and . ' - only (no digits or symbols), 2 to 100 characters. */
export function validatePersonName(value, label = 'Full name', { required = true } = {}) {
  return validateText(value, {
    label,
    required,
    min: 2,
    max: 100,
    pattern: PERSON_NAME_PATTERN,
    patternMessage: `${label} can only contain letters, spaces and . ' -`,
  })
}

export function validateOrganizationName(value, label = 'Organization name') {
  return validateText(value, {
    label,
    min: 2,
    max: 150,
    pattern: ORGANIZATION_NAME_PATTERN,
    patternMessage: `${label} can only contain letters, numbers, spaces and & . , ' ( ) / -`,
  })
}

export function validateCountry(value, { required = false } = {}) {
  return validateText(value, {
    label: 'Country',
    required,
    min: 2,
    max: 100,
    pattern: COUNTRY_PATTERN,
    patternMessage: 'Country can only contain letters and spaces.',
  })
}

export function validateAddress(value, { required = false } = {}) {
  return validateText(value, { label: 'Address', required, min: 5, max: 255 })
}

// ---------------------------------------------------------------- contact details

export function validateEmail(value, { required = true } = {}) {
  const email = text(value)
  if (!email) return required ? 'Email is required.' : ''
  if (email.length > 150) return 'Email must be at most 150 characters.'
  if (!EMAIL_PATTERN.test(email) || email.includes('..')) return 'Enter a valid email address, like name@example.com.'
  return ''
}

/** Phone: optional + at the start, then digits (spaces, dashes and brackets are allowed). 7 to 15 digits. */
export function validatePhone(value, { required = false } = {}) {
  const phone = text(value)
  if (!phone) return required ? 'Phone is required.' : ''
  if (phone.length > 20) return 'Phone must be at most 20 characters.'
  if (!PHONE_CHARACTERS.test(phone)) return 'Phone can only contain digits, spaces and + - ( ).'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return 'Phone must have 7 to 15 digits.'
  return ''
}

/** Pakistani CNIC: 13 digits, written 12345-1234567-1 (the dashes are optional). */
export function validateCnic(value, { required = true } = {}) {
  const cnic = text(value)
  if (!cnic) return required ? 'CNIC is required.' : ''
  if (!CNIC_PATTERN.test(cnic)) return 'CNIC must have 13 digits, like 12345-1234567-1.'
  return ''
}

// ---------------------------------------------------------------- numbers

/** A whole number between min and max. */
export function validateInteger(value, { label = 'This field', required = true, min, max } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : ''
  const raw = text(value)
  if (!/^-?\d+$/.test(raw)) return `${label} must be a whole number.`
  const number = Number(raw)
  if (min !== undefined && number < min) return `${label} must be at least ${min}.`
  if (max !== undefined && number > max) return `${label} must be at most ${max}.`
  return ''
}

/** A number (decimals allowed) between min and max, with at most `decimals` digits after the point. */
export function validateNumber(value, { label = 'This field', required = true, min, max, decimals = 2, positive = false } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : ''
  const raw = text(value)
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return `${label} must be a number.`
  const number = Number(raw)
  if (positive && number <= 0) return `${label} must be more than 0.`
  if (min !== undefined && number < min) return `${label} must be at least ${min}.`
  if (max !== undefined && number > max) return `${label} must be at most ${max}.`
  const places = raw.includes('.') ? raw.split('.')[1].length : 0
  if (places > decimals) return decimals === 0 ? `${label} must be a whole number.` : `${label} can have at most ${decimals} decimal places.`
  return ''
}

// ---------------------------------------------------------------- dates and times

function parseDate(value) {
  const raw = text(value)
  if (!raw) return null
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
  return Number.isNaN(date.getTime()) ? null : date
}

const todayStart = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** A date (yyyy-mm-dd) or date-time. `notInPast` / `notInFuture` compare with today. */
export function validateDate(value, { label = 'Date', required = true, notInPast = false, notInFuture = false } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : ''
  const date = parseDate(value)
  if (!date) return `${label} is not a valid date.`
  if (date.getFullYear() < 1900 || date.getFullYear() > 2100) return `${label} must be between 1900 and 2100.`
  if (notInPast && date < todayStart()) return `${label} cannot be in the past.`
  if (notInFuture && date > new Date(todayStart().getTime() + 86400000 - 1)) return `${label} cannot be in the future.`
  return ''
}

/** The end must come after the start (or on the same day when `allowSame`). Both must already be valid dates. */
export function validateDateOrder(start, end, { endLabel = 'The end', startLabel = 'the start', allowSame = false } = {}) {
  const from = parseDate(start)
  const to = parseDate(end)
  if (!from || !to) return ''
  if (allowSame ? to < from : to <= from) return `${endLabel} must be ${allowSame ? 'on or after' : 'after'} ${startLabel}.`
  return ''
}

export function validateTime(value, { label = 'Time', required = true } = {}) {
  if (isBlank(value)) return required ? `${label} is required.` : ''
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(text(value)) ? '' : `${label} must be a valid time.`
}

// ---------------------------------------------------------------- choices and codes

export function validateChoice(value, options, label) {
  if (isBlank(value)) return `${label} is required.`
  const allowed = options.map((option) => (typeof option === 'object' ? String(option.value) : String(option)))
  return allowed.includes(String(value)) ? '' : `Choose a valid ${label.toLowerCase()}.`
}

/** Three capital letters, like PKR or USD. */
export function validateCurrencyCode(value, label = 'Currency') {
  if (isBlank(value)) return `${label} is required.`
  return /^[A-Z]{3}$/.test(text(value)) ? '' : `${label} must be 3 capital letters, like PKR.`
}

/** Capital letters, digits and underscores, starting with a letter: EARLY_PAYMENT_DISCOUNT. */
export function validateRuleKey(value) {
  if (isBlank(value)) return 'Key is required.'
  return RULE_KEY_PATTERN.test(text(value)) ? '' : 'Use 3 to 50 capital letters, digits or _ , starting with a letter.'
}

// ---------------------------------------------------------------- passwords and codes

export function validateOtp(value) {
  if (!value) return 'OTP is required.'
  if (!/^\d{6}$/.test(value)) return 'OTP must be exactly 6 digits.'
  return ''
}

export function validateNewPassword(value) {
  if (!value) return 'New password is required.'
  if (value.length < 8) return 'Password must be at least 8 characters.'
  if (value.length > 100) return 'Password must be at most 100 characters.'
  if (/\s/.test(value)) return 'Password cannot contain spaces.'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Use at least one letter and one number.'
  return ''
}

export function validateConfirmPassword(password, confirm) {
  if (!confirm) return 'Please confirm your password.'
  if (password !== confirm) return 'Passwords do not match.'
  return ''
}

// ---------------------------------------------------------------- typing helpers

/** Keeps only what a phone number can hold while the person types. */
export function cleanPhoneInput(value) {
  return String(value ?? '').replace(/[^\d\s()+-]/g, '').slice(0, 20)
}

/** Keeps digits and adds the dashes of a CNIC while the person types: 12345-1234567-1. */
export function formatCnicInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 13)
  const parts = [digits.slice(0, 5), digits.slice(5, 12), digits.slice(12)]
  return parts.filter(Boolean).join('-')
}

/** Takes the messages out of a validation result so only the failed fields remain. */
export function onlyErrors(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message))
}

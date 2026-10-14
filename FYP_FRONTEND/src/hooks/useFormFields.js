import { useCallback, useRef, useState } from 'react'
import { onLeave } from '../utils/onLeave.js'

/**
 * Form state with validation that works while the person fills the form:
 *  - a field is checked when they leave it (blur), and again on every change after that;
 *  - pressing the submit button checks every field at once;
 *  - errors sent back by the server are shown on their own fields.
 *
 * `validate(form)` must return an object with a message for every field that is wrong: { email: 'Enter a valid email.' }.
 * Use it like:  <TextField label="Email" {...field('email')} />
 */
export function useFormFields(initialForm, validate) {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const touched = useRef({})

  // Checks the fields that were already visited. Other fields (end date after start date ...) can change with this one.
  const recheck = useCallback(
    (nextForm, current) => {
      const found = validate(nextForm)
      const next = { ...current }
      for (const name of Object.keys(touched.current)) next[name] = found[name] || ''
      return next
    },
    [validate],
  )

  /** Props for a TextField, SelectField or TextArea. `clean` can tidy what is typed (phone digits, CNIC dashes ...). */
  const field = useCallback(
    (name, { clean } = {}) => ({
      value: form[name] ?? '',
      error: errors[name],
      onChange: (event) => {
        const raw = event.target.type === 'checkbox' ? event.target.checked : event.target.value
        const value = clean ? clean(raw) : raw
        const nextForm = { ...form, [name]: value }
        setForm(nextForm)
        setErrors((current) => (touched.current[name] ? recheck(nextForm, current) : current[name] ? { ...current, [name]: '' } : current))
      },
      onBlur: onLeave(() => {
        touched.current[name] = true
        setErrors((current) => recheck(form, current))
      }),
    }),
    [form, errors, recheck],
  )

  /** Changes a value from code (not from typing). */
  const setValue = useCallback(
    (name, value) => {
      const nextForm = { ...form, [name]: value }
      setForm(nextForm)
      setErrors((current) => (touched.current[name] ? recheck(nextForm, current) : current))
    },
    [form, recheck],
  )

  /** Checks everything. Returns true when the form can be sent. */
  const checkAll = useCallback(() => {
    const found = validate(form)
    for (const name of Object.keys(form)) touched.current[name] = true
    setErrors(found)
    return Object.keys(found).filter((name) => found[name]).length === 0
  }, [form, validate])

  /** Puts server-side field errors on their fields. */
  const addServerErrors = useCallback((fieldErrors) => {
    if (fieldErrors) setErrors((current) => ({ ...current, ...fieldErrors }))
  }, [])

  /** Back to the first values, with no messages. */
  const reset = useCallback(() => {
    touched.current = {}
    setForm(initialForm)
    setErrors({})
  }, [initialForm])

  return { form, setForm, setValue, reset, errors, setErrors, field, checkAll, addServerErrors }
}

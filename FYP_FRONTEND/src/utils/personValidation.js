import { PROFICIENCY_OPTIONS } from '../constants/employee.js'
import {
  onlyErrors,
  validateChoice,
  validateCnic,
  validateCountry,
  validateEmail,
  validateInteger,
  validateNewPassword,
  validatePersonName,
  validatePhone,
} from './validators.js'

/** The details every person account has (employee, admin, business owner, organization manager). */
export function validatePerson(form, { isEdit = false } = {}) {
  const errors = {
    fullName: validatePersonName(form.fullName),
    email: validateEmail(form.email),
    phone: validatePhone(form.phone, { required: true }),
    cnic: validateCnic(form.cnic),
    age: validateInteger(form.age, { label: 'Age', required: false, min: 16, max: 80 }),
    country: validateCountry(form.country),
  }
  if (!isEdit) errors.password = validateNewPassword(form.password)
  return onlyErrors(errors)
}

/** Problem with the skills list, or '' when it is fine. Used by the employee form. */
export function validateSkillList(skills) {
  for (const skill of skills ?? []) {
    const level = validateChoice(skill.proficiency, PROFICIENCY_OPTIONS, `Level of ${skill.skillName}`)
    if (level) return level
    const years = validateInteger(skill.yearsOfExperience, { label: `Years of ${skill.skillName}`, required: false, min: 0, max: 60 })
    if (years) return years
  }
  return ''
}


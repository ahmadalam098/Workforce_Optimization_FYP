import { useState } from 'react'
import Modal from '../../../components/ui/Modal.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import TextArea from '../../../components/ui/TextArea.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Button from '../../../components/ui/Button.jsx'
import Alert from '../../../components/ui/Alert.jsx'
import { QUERY_CATEGORY_OPTIONS, TICKET_PRIORITY_OPTIONS } from '../../../constants/support.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { useFormFields } from '../../../hooks/useFormFields.js'
import { employeesApi, ticketsApi } from '../../../services/admin/adminService.js'
import { onlyErrors, validateChoice, validateText } from '../../../utils/validators.js'

const FROM_OPTIONS = [
  { value: 'organization', label: 'An organization' },
  { value: 'employee', label: 'An employee' },
]

function validateQuery(form) {
  const fromEmployee = form.from === 'employee'
  return onlyErrors({
    organizationId: fromEmployee || form.organizationId ? '' : 'Select the organization the query is from.',
    employeeId: fromEmployee && !form.employeeId ? 'Select the employee.' : '',
    subject: validateText(form.subject, { label: 'Subject', min: 5, max: 150 }),
    description: validateText(form.description, { label: 'Description', min: 10, max: 2000 }),
    category: validateChoice(form.category, QUERY_CATEGORY_OPTIONS, 'Category'),
    priority: validateChoice(form.priority, TICKET_PRIORITY_OPTIONS, 'Priority'),
  })
}

/**
 * Adds a query from an organization or from an employee. The organization and employee sides will send their own later; this is for trying
 * the screens out. An employee's query goes to the manager of the organization the employee works for.
 */
function TicketCreateModal({ organizations, onClose, onCreated }) {
  const { form, field, checkAll, addServerErrors } = useFormFields(
    { from: 'organization', organizationId: '', employeeId: '', subject: '', description: '', category: 'Query', priority: 'Medium' },
    validateQuery,
  )
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fromEmployee = form.from === 'employee'
  const { data: employees } = useFetch((signal) => employeesApi.lookup(signal), 'employee-lookup')
  const employeeOptions = (employees ?? []).map((employee) => ({ value: String(employee.employeeId), label: `${employee.fullName} (${employee.orgName || 'central pool'})` }))

  const organizationOptions = organizations
    .filter((org) => org.status === 'Active' || org.status === 'Approved')
    .map((org) => ({ value: String(org.organizationId), label: org.name }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (!checkAll()) {
      setServerError('Please correct the highlighted fields.')
      return
    }

    setSubmitting(true)
    setServerError('')
    try {
      const result = await ticketsApi.create({
        organizationId: fromEmployee ? undefined : Number(form.organizationId),
        employeeId: fromEmployee ? Number(form.employeeId) : undefined,
        subject: form.subject.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
      })
      onCreated(result)
    } catch (error) {
      addServerErrors(error.fieldErrors)
      setServerError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Add query"
      subtitle="Record a query from an organization or an employee so it can be viewed and resolved."
      size="lg"
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="query-form" loading={submitting}>
            Add query
          </Button>
        </>
      }
    >
      <form id="query-form" onSubmit={handleSubmit} noValidate className="form-stack">
        {serverError && <Alert type="error">{serverError}</Alert>}
        <SelectField label="It comes from" required options={FROM_OPTIONS} {...field('from')} />
        {fromEmployee ? (
          <SelectField
            label="Employee"
            required
            options={employeeOptions}
            placeholder="Select an employee"
            hint="It goes to the manager of the organization the employee works for, who can answer it or send it back to you."
            {...field('employeeId')}
          />
        ) : (
          <SelectField label="Organization" required options={organizationOptions} placeholder="Select an organization" hint="The resolution is emailed to this organization and its managers." {...field('organizationId')} />
        )}
        <TextField label="Subject" required maxLength={150} autoComplete="off" {...field('subject')} />
        <TextArea label="Description" required rows={4} maxLength={2000} {...field('description')} />
        <div className="form-grid">
          <SelectField label="Category" required options={QUERY_CATEGORY_OPTIONS} {...field('category')} />
          <SelectField label="Priority" required options={TICKET_PRIORITY_OPTIONS} {...field('priority')} />
        </div>
      </form>
    </Modal>
  )
}

export default TicketCreateModal

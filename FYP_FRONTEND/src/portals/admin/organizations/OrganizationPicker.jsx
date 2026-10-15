import './OrganizationPicker.css'

/** Checklist of organizations; a manager can handle one or as many organizations as the admin selects. */
function OrganizationPicker({ organizations, selectedIds, onChange, error, hint }) {
  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id])
  }

  return (
    <fieldset className="org-picker">
      <legend className="org-picker__legend">
        Organizations <span className="org-picker__count">{selectedIds.length} selected</span>
      </legend>

      {organizations.length === 0 ? (
        <p className="org-picker__empty">No organizations exist yet. You can assign organizations later.</p>
      ) : (
        <ul className="org-picker__list">
          {organizations.map((org) => {
            const checked = selectedIds.includes(org.organizationId)
            return (
              <li key={org.organizationId}>
                <label className={`org-picker__item ${checked ? 'is-checked' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(org.organizationId)} />
                  <span>{org.name || `Organization #${org.organizationId}`}</span>
                  {org.status && <span className="org-picker__status">{org.status}</span>}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {error ? (
        <p className="org-picker__error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="org-picker__hint">{hint}</p>
      )}
    </fieldset>
  )
}

export default OrganizationPicker

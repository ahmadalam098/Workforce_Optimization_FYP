import { useState } from 'react'
import Badge from '../../../../components/ui/Badge.jsx'
import Button from '../../../../components/ui/Button.jsx'
import Checkbox from '../../../../components/ui/Checkbox.jsx'
import SelectField from '../../../../components/ui/SelectField.jsx'
import TextField from '../../../../components/ui/TextField.jsx'
import { settingsApi } from '../../../../services/adminService.js'
import { formatDateTime } from '../../../../utils/format.js'
import { validateInteger, validateText } from '../../../../utils/validators.js'

function describeDefault(setting) {
  if (setting.kind === 'bool') return setting.default === 'true' ? 'on' : 'off'
  if (setting.kind === 'choice') return setting.options.find((option) => option.value === setting.default)?.label ?? setting.default
  return `${setting.default}${setting.unit ? ` ${setting.unit}` : ''}`
}

function describeLimits(setting) {
  if (setting.kind === 'int') return ` · allowed ${setting.min} – ${setting.max}`
  if (setting.kind === 'text') return ` · ${setting.min} – ${setting.max} characters`
  return ''
}

/** One editable setting: shows the current value, saves when changed, can go back to the default. */
function SettingRow({ setting, onChanged, onError }) {
  const [draft, setDraft] = useState(setting.value)
  const [fieldError, setFieldError] = useState('')
  const [busy, setBusy] = useState(false)

  const changed = draft !== setting.value

  function check() {
    if (setting.kind === 'int') return validateInteger(draft, { label: setting.label, min: setting.min, max: setting.max })
    if (setting.kind === 'text') return validateText(draft, { label: setting.label, min: setting.min, max: setting.max })
    return ''
  }

  async function save(value) {
    setBusy(true)
    setFieldError('')
    onError('')
    try {
      const result = await settingsApi.save(setting.key, value)
      onChanged(result?.message || 'Setting saved.')
    } catch (error) {
      if (error.fieldErrors?.value) setFieldError(error.fieldErrors.value)
      else onError(error.message)
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const problem = check()
    if (problem) {
      setFieldError(problem)
      return
    }
    save(setting.kind === 'text' ? draft.trim() : draft)
  }

  function update(value) {
    setDraft(value)
    setFieldError('')
  }

  let control
  if (setting.kind === 'bool') {
    control = <Checkbox label={draft === 'true' ? 'Switched on' : 'Switched off'} checked={draft === 'true'} onChange={(on) => update(on ? 'true' : 'false')} />
  } else if (setting.kind === 'choice') {
    control = <SelectField label={setting.label} hideLabel options={setting.options} value={draft} onChange={(event) => update(event.target.value)} error={fieldError} />
  } else if (setting.kind === 'text') {
    control = <TextField label={setting.label} hideLabel value={draft} maxLength={setting.max} onChange={(event) => update(event.target.value)} error={fieldError} />
  } else {
    control = (
      <TextField
        label={`Value (${setting.unit})`}
        type="number"
        min={setting.min}
        max={setting.max}
        value={draft}
        onChange={(event) => update(event.target.value)}
        error={fieldError}
      />
    )
  }

  return (
    <form className="setting-row" onSubmit={handleSubmit} noValidate>
      <div className="setting-row__text">
        <h4 className="setting-row__label">
          {setting.label} {!setting.isDefault && <Badge tone="gold">Changed</Badge>}
        </h4>
        <p className="setting-row__description">{setting.description}</p>
        <p className="setting-row__meta">
          Default {describeDefault(setting)}
          {describeLimits(setting)}
          {setting.updatedAt && ` · changed ${formatDateTime(setting.updatedAt)}${setting.updatedBy ? ` by ${setting.updatedBy}` : ''}`}
        </p>
      </div>
      <div className="setting-row__control">
        {control}
        {setting.kind === 'bool' && fieldError && <p className="field__error" role="alert">{fieldError}</p>}
        <div className="setting-row__buttons">
          <Button type="submit" loading={busy} disabled={!changed}>
            Save
          </Button>
          {!setting.isDefault && (
            <Button variant="secondary" disabled={busy} onClick={() => save(null)}>
              Reset
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}

export default SettingRow

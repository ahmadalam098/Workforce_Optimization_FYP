import SelectField from '../../../components/ui/SelectField.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { PROFICIENCY_OPTIONS } from '../../../constants/employee.js'

/**
 * The skills of one employee, edited inside the employee form: pick a skill from the catalog, then set the level and
 * the years of experience. `value` is [{ skillId, skillName, proficiency, yearsOfExperience }].
 */
function EmployeeSkillsEditor({ value, onChange, catalog, error }) {
  const owned = new Set(value.map((skill) => skill.skillId))
  const options = (catalog ?? [])
    .filter((item) => !owned.has(item.skillId))
    .map((item) => ({ value: String(item.skillId), label: item.category ? `${item.name} (${item.category})` : item.name }))

  function addSkill(event) {
    const skill = (catalog ?? []).find((item) => String(item.skillId) === event.target.value)
    if (!skill) return
    onChange([...value, { skillId: skill.skillId, skillName: skill.name, proficiency: 'Intermediate', yearsOfExperience: '' }])
  }

  function change(skillId, patch) {
    onChange(value.map((skill) => (skill.skillId === skillId ? { ...skill, ...patch } : skill)))
  }

  return (
    <fieldset className="skill-editor">
      <legend className="skill-editor__legend">Skills</legend>

      {value.length === 0 ? (
        <p className="skill-editor__empty">No skills yet. Add the skills this employee has.</p>
      ) : (
        <ul className="skill-editor__list">
          {value.map((skill) => (
            <li className="skill-editor__row" key={skill.skillId}>
              <span className="skill-editor__name">{skill.skillName}</span>
              <SelectField
                label={`Level of ${skill.skillName}`}
                hideLabel
                options={PROFICIENCY_OPTIONS}
                value={skill.proficiency}
                onChange={(event) => change(skill.skillId, { proficiency: event.target.value })}
              />
              <TextField
                label={`Years of ${skill.skillName}`}
                type="number"
                inputMode="numeric"
                min="0"
                max="60"
                step="1"
                placeholder="Years"
                value={skill.yearsOfExperience}
                onChange={(event) => change(skill.skillId, { yearsOfExperience: event.target.value })}
              />
              <button type="button" className="icon-btn icon-btn--danger" onClick={() => onChange(value.filter((item) => item.skillId !== skill.skillId))} aria-label={`Remove ${skill.skillName}`} title="Remove">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <SelectField
        label="Add a skill"
        value=""
        onChange={addSkill}
        options={options}
        placeholder={options.length === 0 ? 'No more skills in the catalog' : 'Choose a skill to add'}
        hint="Skills come from the Skills page."
      />

      {error && (
        <p className="skill-editor__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

export default EmployeeSkillsEditor

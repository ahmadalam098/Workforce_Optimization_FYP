import SettingRow from './SettingRow.jsx'

/** The settings of one tab, grouped under headings. */
function SettingsSection({ settings, section, onChanged, onError }) {
  const inSection = settings.filter((setting) => setting.section === section)
  const groups = [...new Set(inSection.map((setting) => setting.group))]

  return groups.map((group) => (
    <section className="card" key={group}>
      <div className="card__header">
        <h3 className="card__title">{group}</h3>
      </div>
      <div className="card__body setting-list">
        {inSection
          .filter((setting) => setting.group === group)
          // The key changes when the stored value changes, so the input shows the saved value again.
          .map((setting) => (
            <SettingRow key={`${setting.key}-${setting.value}`} setting={setting} onChanged={onChanged} onError={onError} />
          ))}
      </div>
    </section>
  ))
}

export default SettingsSection

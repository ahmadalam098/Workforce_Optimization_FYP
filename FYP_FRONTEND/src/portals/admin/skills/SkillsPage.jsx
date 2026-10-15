import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Badge from '../../../components/ui/Badge.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { skillsApi } from '../../../services/admin/adminService.js'
import Notice from '../shared/Notice.jsx'
import PageHeader from '../shared/PageHeader.jsx'
import SkillFormModal from './SkillFormModal.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import { ActiveBadge } from '../shared/StatusBadge.jsx'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import SkillDetailsModal from './SkillDetailsModal.jsx'
import ViewButton from '../shared/ViewButton.jsx'

const PAGE_SIZE = 10

const ACTIVE_OPTIONS = [
  { value: 'true', label: 'Active only' },
  { value: 'false', label: 'Inactive only' },
]

/** The skill catalog: every skill an employee can have. */
function SkillsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [active, setActive] = useState('true')
  const [page, setPage] = useState(1)
  const [formTarget, setFormTarget] = useState(null) // null | 'new' | skill
  const [toggleTarget, setToggleTarget] = useState(null)
  const [notice, setNotice] = useFlashNotice()
  const [viewTarget, setViewTarget] = useState(null)

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), category, active, page, pageSize: PAGE_SIZE }
  const { data, error, loading, reload } = useFetch((signal) => skillsApi.list(params, signal), JSON.stringify(params))
  const { data: categories, reload: reloadCategories } = useFetch((signal) => skillsApi.categories(signal), 'skill-categories')

  const categoryOptions = (categories ?? []).map((value) => ({ value, label: value }))

  function handleSaved(message) {
    setFormTarget(null)
    setNotice(message)
    reload()
    reloadCategories()
  }

  async function handleToggle() {
    const makeActive = !toggleTarget.isActive
    await skillsApi.setActive(toggleTarget.skillId, makeActive)
    setNotice(`${toggleTarget.name} was ${makeActive ? 'activated' : 'deactivated'}.`)
    setToggleTarget(null)
    reload()
  }

  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch) || Boolean(category) || active !== 'true'

  return (
    <div className="page">
      <PageHeader
        title="Skills"
        description="The skill catalog. Give skills to employees from their profile; the allocation engine matches them to requests."
        actions={
          <Button onClick={() => navigate('/admin/skills/new')}>
            <Icon name="plus" size={18} /> Add skill
          </Button>
        }
      />

      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label="Search skills"
            icon="search"
            placeholder="Search by name or category"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField
            className="toolbar__filter"
            label="Category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value)
              setPage(1)
            }}
            options={categoryOptions}
            placeholder="All categories"
          />
          <SelectField
            className="toolbar__filter"
            label="Status"
            value={active}
            onChange={(event) => {
              setActive(event.target.value)
              setPage(1)
            }}
            options={ACTIVE_OPTIONS}
            placeholder="All"
          />
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label="Loading skills..." />
        ) : items.length === 0 ? (
          <EmptyState
            icon="sparkles"
            title="No skills found"
            text={filtered ? 'Try changing or clearing the filters.' : 'Add the first skill, for example English or Customer Support.'}
            action={
              filtered ? null : (
                <Button onClick={() => navigate('/admin/skills/new')}>
                  <Icon name="plus" size={18} /> Add skill
                </Button>
              )
            }
          />
        ) : (
          <>
            {error && <ErrorState error={error} onRetry={reload} />}
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Category</th>
                    <th>Employees</th>
                    <th>Status</th>
                    <th>View</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((skill) => (
                    <tr key={skill.skillId} className={skill.isActive ? '' : 'is-inactive'}>
                      <td>
                        <span className="person__name">{skill.name}</span>
                        {skill.description && <span className="person__sub">{skill.description}</span>}
                      </td>
                      <td>{skill.category ? <Badge tone="gold">{skill.category}</Badge> : <span className="cell-muted">—</span>}</td>
                      <td>
                        {skill.employeeCount > 0 ? (
                          <Link to={`/admin/employees?skillId=${skill.skillId}`}>{skill.employeeCount} employee{skill.employeeCount === 1 ? '' : 's'}</Link>
                        ) : (
                          <span className="cell-muted">None</span>
                        )}
                      </td>
                      <td>
                        <ActiveBadge isActive={skill.isActive} />
                      </td>
                      <td>
                        <ViewButton onClick={() => setViewTarget(skill)} label={`View ${skill.name}`} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="icon-btn" onClick={() => setFormTarget(skill)} aria-label={`Edit ${skill.name}`} title="Edit">
                            <Icon name="edit" size={17} />
                          </button>
                          <button
                            type="button"
                            className={`icon-btn ${skill.isActive ? 'icon-btn--danger' : ''}`}
                            onClick={() => setToggleTarget(skill)}
                            aria-label={`${skill.isActive ? 'Deactivate' : 'Activate'} ${skill.name}`}
                            title={skill.isActive ? 'Deactivate' : 'Activate'}
                          >
                            <Icon name={skill.isActive ? 'ban' : 'checkCircle'} size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>

      {viewTarget && <SkillDetailsModal skill={viewTarget} onClose={() => setViewTarget(null)} />}

      {formTarget && (
        <SkillFormModal
          skill={formTarget === 'new' ? null : formTarget}
          categories={categories ?? []}
          onClose={() => setFormTarget(null)}
          onSaved={handleSaved}
        />
      )}

      {toggleTarget && (
        <ConfirmDialog
          title={toggleTarget.isActive ? 'Deactivate skill?' : 'Activate skill?'}
          message={
            toggleTarget.isActive
              ? `${toggleTarget.name} can no longer be given to new employees. Employees who already have it keep it.`
              : `${toggleTarget.name} can be given to employees again.`
          }
          confirmLabel={toggleTarget.isActive ? 'Deactivate' : 'Activate'}
          danger={toggleTarget.isActive}
          onConfirm={handleToggle}
          onCancel={() => setToggleTarget(null)}
        />
      )}
    </div>
  )
}

export default SkillsPage

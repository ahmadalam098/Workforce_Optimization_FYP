import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../../../components/ui/Avatar.jsx'
import Button from '../../../components/ui/Button.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import Icon from '../../../components/ui/Icon.jsx'
import Pagination from '../../../components/ui/Pagination.jsx'
import SelectField from '../../../components/ui/SelectField.jsx'
import Spinner from '../../../components/ui/Spinner.jsx'
import TextField from '../../../components/ui/TextField.jsx'
import { useAuth } from '../../../context/useAuth.js'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js'
import { useFetch } from '../../../hooks/useFetch.js'
import { managersApi, organizationsApi, usersApi } from '../../../services/admin/adminService.js'
import { formatDate } from '../../../utils/format.js'
import { emailSentence } from '../../../utils/emailNote.js'
import ManagerOrganizationsModal from './ManagerOrganizationsModal.jsx'
import Notice from '../shared/Notice.jsx'
import ResetPasswordModal from '../shared/ResetPasswordModal.jsx'
import { EmptyState, ErrorState } from '../shared/StateBox.jsx'
import { ActiveBadge } from '../shared/StatusBadge.jsx'
import UserFormModal from './UserFormModal.jsx'
import { useFlashNotice } from '../../../hooks/useFlashNotice.js'
import UserDetailsModal from './UserDetailsModal.jsx'
import ViewButton from '../shared/ViewButton.jsx'

const PAGE_SIZE = 10

const ACTIVE_OPTIONS = [
  { value: 'true', label: 'Active only' },
  { value: 'false', label: 'Inactive only' },
]

/** Table + actions for one staff role. `kind` is 'Admin' | 'Business Owner' | 'Organization Manager'. */
function UsersPanel({ kind }) {
  const navigate = useNavigate()
  const tabId = { Admin: 'admins', 'Business Owner': 'owners', 'Organization Manager': 'managers' }[kind]
  const { user: currentUser } = useAuth()
  const [pictureTick, setPictureTick] = useState()
  const isManager = kind === 'Organization Manager'
  const noun = kind.toLowerCase()

  const [search, setSearch] = useState('')
  const [active, setActive] = useState('true')
  const [page, setPage] = useState(1)
  const [formTarget, setFormTarget] = useState(null) // null | 'new' | user
  const [toggleTarget, setToggleTarget] = useState(null)
  const [passwordTarget, setPasswordTarget] = useState(null)
  const [orgTarget, setOrgTarget] = useState(null)
  const [notice, setNotice] = useFlashNotice()
  const [viewTarget, setViewTarget] = useState(null)

  const debouncedSearch = useDebouncedValue(search)
  const params = { search: debouncedSearch.trim(), active, page, pageSize: PAGE_SIZE }
  const key = `${kind}|${JSON.stringify(params)}`

  const { data, error, loading, reload } = useFetch(
    (signal) => (isManager ? managersApi.list(params, signal) : usersApi.list({ ...params, roleType: kind }, signal)),
    key,
  )
  const { data: organizations } = useFetch((signal) => organizationsApi.lookup(signal), 'organizations')

  function handleSaved(message) {
    setFormTarget(null)
    setOrgTarget(null)
    setNotice(message)
    reload()
  }

  async function handleToggleActive() {
    const makeActive = !toggleTarget.isActive
    const result = await usersApi.setActive(toggleTarget.userId, makeActive)
    setNotice(`${toggleTarget.fullName} was ${makeActive ? 'activated' : 'deactivated'}.${emailSentence(result)}`)
    setToggleTarget(null)
    reload()
  }

  const items = data?.items ?? []
  const filtered = Boolean(debouncedSearch) || active !== 'true'

  return (
    <div className="page">
      <Notice message={notice} onClose={() => setNotice('')} />

      <section className="card">
        <div className="toolbar">
          <TextField
            className="toolbar__search"
            label={`Search ${noun}s`}
            icon="search"
            placeholder="Search by name, email or CNIC"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <SelectField
            className="toolbar__filter"
            label="Account"
            value={active}
            onChange={(event) => {
              setActive(event.target.value)
              setPage(1)
            }}
            options={ACTIVE_OPTIONS}
            placeholder="All accounts"
          />
          <Button onClick={() => navigate(`/admin/team/new?tab=${tabId}`)}>
            <Icon name="plus" size={18} /> Add {noun}
          </Button>
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data && loading ? (
          <Spinner label={`Loading ${noun}s...`} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="team"
            title={`No ${noun}s found`}
            text={filtered ? 'Try changing or clearing the filters.' : `Add the first ${noun} to get started.`}
          />
        ) : (
          <>
            {error && <ErrorState error={error} onRetry={reload} />}
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>CNIC</th>
                    {isManager && <th>Organizations</th>}
                    <th>Created</th>
                    <th>Account</th>
                    <th>View</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((person) => {
                    const isSelf = person.userId === currentUser?.userId
                    return (
                      <tr key={person.userId} className={person.isActive ? '' : 'is-inactive'}>
                        <td>
                          <div className="person">
                            <Avatar userId={person.userId} name={person.fullName} hasPicture={person.hasPicture || pictureTick !== undefined || (person.userId === currentUser?.userId && currentUser?.pictureVersion !== undefined)} version={pictureTick ?? (person.userId === currentUser?.userId ? currentUser?.pictureVersion : undefined)} size="sm" />
                            <span>
                              <span className="person__name">
                                {person.fullName}
                                {isSelf && <span className="cell-muted"> (you)</span>}
                              </span>
                              <span className="person__sub">{person.email}</span>
                            </span>
                          </div>
                        </td>
                        <td className="cell-muted">{person.phone || '—'}</td>
                        <td className="cell-muted">{person.cnic || '—'}</td>
                        {isManager && (
                          <td>
                            {person.organizations.length > 0 ? (
                              <div className="chip-list">
                                {person.organizations.map((assignment) => (
                                  <span className="chip" key={assignment.managerId}>
                                    {assignment.organizationName || `#${assignment.organizationId}`}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="cell-muted">None assigned</span>
                            )}
                          </td>
                        )}
                        <td className="cell-muted">{formatDate(person.createdAt)}</td>
                        <td>
                          <ActiveBadge isActive={person.isActive} />
                        </td>
                        <td>
                          <ViewButton onClick={() => setViewTarget(person)} label={`View ${person.fullName}`} />
                        </td>
                        <td>
                          <div className="row-actions">
                            {isManager && (
                              <button type="button" className="icon-btn" onClick={() => setOrgTarget(person)} aria-label={`Assign organizations to ${person.fullName}`} title="Assign organizations">
                                <Icon name="building" size={17} />
                              </button>
                            )}
                            <button type="button" className="icon-btn" onClick={() => setFormTarget(person)} aria-label={`Edit ${person.fullName}`} title="Edit">
                              <Icon name="edit" size={17} />
                            </button>
                            <button type="button" className="icon-btn" onClick={() => setPasswordTarget(person)} aria-label={`Reset password for ${person.fullName}`} title="Reset password">
                              <Icon name="key" size={17} />
                            </button>
                            <button
                              type="button"
                              className={`icon-btn ${person.isActive ? 'icon-btn--danger' : ''}`}
                              onClick={() => setToggleTarget(person)}
                              disabled={isSelf}
                              aria-label={`${person.isActive ? 'Deactivate' : 'Activate'} ${person.fullName}`}
                              title={isSelf ? 'You cannot deactivate yourself' : person.isActive ? 'Deactivate' : 'Activate'}
                            >
                              <Icon name={person.isActive ? 'ban' : 'checkCircle'} size={17} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>

      {viewTarget && <UserDetailsModal person={viewTarget} kind={kind} onClose={() => setViewTarget(null)} />}

      {formTarget && (
        <UserFormModal
          kind={kind}
          user={formTarget === 'new' ? null : formTarget}
          organizations={organizations ?? []}
          onClose={() => setFormTarget(null)}
          onSaved={handleSaved}
          onPictureChanged={setPictureTick}
        />
      )}

      {orgTarget && (
        <ManagerOrganizationsModal
          manager={orgTarget}
          organizations={organizations ?? []}
          onClose={() => setOrgTarget(null)}
          onSaved={handleSaved}
        />
      )}

      {passwordTarget && (
        <ResetPasswordModal
          name={passwordTarget.fullName}
          onSubmit={(newPassword) => usersApi.resetPassword(passwordTarget.userId, newPassword)}
          onClose={() => setPasswordTarget(null)}
          onDone={(message) => {
            setPasswordTarget(null)
            setNotice(message)
          }}
        />
      )}

      {toggleTarget && (
        <ConfirmDialog
          title={toggleTarget.isActive ? `Deactivate ${noun}?` : `Activate ${noun}?`}
          message={
            toggleTarget.isActive
              ? `${toggleTarget.fullName} will no longer be able to sign in. Their records are kept and you can activate them again later.`
              : `${toggleTarget.fullName} will be able to sign in again.`
          }
          confirmLabel={toggleTarget.isActive ? 'Deactivate' : 'Activate'}
          danger={toggleTarget.isActive}
          onConfirm={handleToggleActive}
          onCancel={() => setToggleTarget(null)}
        />
      )}
    </div>
  )
}

export default UsersPanel

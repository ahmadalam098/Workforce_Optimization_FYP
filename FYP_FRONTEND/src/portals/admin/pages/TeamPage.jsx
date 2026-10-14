import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import UsersPanel from '../components/UsersPanel.jsx'

const TABS = [
  { id: 'admins', label: 'Admins', kind: 'Admin', description: 'People who can manage the whole system.' },
  { id: 'owners', label: 'Business Owners', kind: 'Business Owner', description: 'Owners who follow business performance and revenue.' },
  { id: 'managers', label: 'Organization Managers', kind: 'Organization Manager', description: 'Managers who handle up to 5 organizations each.' },
]

function TeamPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = TABS.find((tab) => tab.id === searchParams.get('tab')) ?? TABS[0]

  return (
    <div className="page">
      <PageHeader title="Team" description={activeTab.description} />

      <div className="tabs" role="tablist" aria-label="Team roles">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab.id}
            className={`tabs__tab ${tab.id === activeTab.id ? 'is-active' : ''}`}
            onClick={() => setSearchParams({ tab: tab.id }, { replace: true })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* key resets filters and paging when switching tabs */}
      <UsersPanel key={activeTab.id} kind={activeTab.kind} />
    </div>
  )
}

export default TeamPage

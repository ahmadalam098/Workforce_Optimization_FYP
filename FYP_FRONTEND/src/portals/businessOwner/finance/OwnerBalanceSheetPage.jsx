import { useState } from 'react'
import Spinner from '../../../components/ui/Spinner.jsx'
import { BalanceTiles, MonthReceived, MonthlySheet, Transactions } from '../../../components/finance/BalanceSheetParts.jsx'
import { useFetch } from '../../../hooks/useFetch.js'
import { ownerFinanceApi } from '../../../services/businessOwner/businessOwnerService.js'
import PageHeader from '../../admin/shared/PageHeader.jsx'
import { ErrorState } from '../../admin/shared/StateBox.jsx'
import '../../admin/finance/FinanceTiles.css'

/** Business Owner: the balance sheet of the company (read only) and every money movement. */
function OwnerBalanceSheetPage() {
  const [year, setYear] = useState(undefined)
  const [month, setMonth] = useState(undefined)
  const { data, error, loading, reload } = useFetch((signal) => ownerFinanceApi.balanceSheet(year, month, signal), `owner-balance-sheet-${year ?? 'now'}-${month ?? 'now'}`)

  return (
    <div className="page">
      <PageHeader title="Balance Sheet" description="What the organizations paid, what the admin spent, what was sent to the business owners and what is still left. All in PKR." />
      {error && !data ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : !data && loading ? (
        <Spinner label="Loading the balance sheet..." />
      ) : (
        <>
          <BalanceTiles balance={data.balance} />
          <MonthReceived month={data.month} year={data.sheet.year} onMonth={setMonth} />
          <MonthlySheet sheet={data.sheet} onYear={(next) => { setYear(next); setMonth(undefined) }} />
          <Transactions cacheKey="owner-tx" load={(page, signal) => ownerFinanceApi.transactions(page, signal)} />
        </>
      )}
    </div>
  )
}

export default OwnerBalanceSheetPage

const NON_PRICEABLE = new Set(['FDRXX', 'SPAXX', 'CORE', 'FDIC', 'PENDING ACTIVITY'])

function PortfolioByAccount({ positions, lastTransactions = {}, livePrices }) {
  if (!positions || positions.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p>No positions loaded yet.</p>
      </div>
    )
  }

  // Group positions by account_name
  const accounts = {}
  for (const pos of positions) {
    const name = pos.account_name || 'Unknown Account'
    if (!accounts[name]) accounts[name] = []
    accounts[name].push(pos)
  }

  const hasLive = livePrices && Object.keys(livePrices).length > 0

  const liveValueFor = (pos) => {
    if (!hasLive) return null
    const sym = (pos.symbol || '').replace(/\*+$/, '').toUpperCase()
    if (livePrices[sym] != null && pos.quantity != null) return pos.quantity * livePrices[sym]
    if (NON_PRICEABLE.has(sym) && pos.last_price != null) return pos.quantity * pos.last_price
    return pos.current_value || 0
  }

  // Compute account total and grand total
  const grandTotal = positions.reduce((sum, p) => sum + (p.current_value || 0), 0)
  const liveGrandTotal = hasLive ? positions.reduce((sum, p) => sum + liveValueFor(p), 0) : 0

  const fmt = (n) =>
    n == null ? '—' : '$' + Math.round(n).toLocaleString()

  const fmtPct = (n) =>
    n == null ? '—' : n.toFixed(2) + '%'

  return (
    <div className="space-y-8">
      {Object.entries(accounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([accountName, rows]) => {
          const accountTotal = rows.reduce((sum, p) => sum + (p.current_value || 0), 0)
          const liveAccountTotal = hasLive ? rows.reduce((sum, p) => sum + liveValueFor(p), 0) : 0
          const accountPct = grandTotal > 0 ? (accountTotal / grandTotal) * 100 : 0

          return (
            <div key={accountName} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Account header */}
              <div className="bg-blue-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-gray-800">{accountName}</span>
                  <span className="ml-3 text-sm text-gray-500">{rows.length} holding{rows.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-gray-800">{fmt(accountTotal)}</span>
                  <span className="ml-3 text-sm text-gray-500">{fmtPct(accountPct)} of portfolio</span>
                </div>
              </div>

              {/* Holdings table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2 font-medium">Symbol</th>
                    <th className="text-left px-4 py-2 font-medium">Description</th>
                    <th className="text-right px-4 py-2 font-medium">Qty</th>
                    <th className="text-right px-4 py-2 font-medium">Current Value</th>
                    {hasLive && <th className="text-right px-4 py-2 font-medium text-green-600">Live Value</th>}
                    <th className="text-right px-4 py-2 font-medium">% of Account</th>
                    <th className="text-right px-4 py-2 font-medium">Last Buy Date</th>
                    <th className="text-right px-4 py-2 font-medium">Last Sale Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice()
                    .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))
                    .map((pos, i) => {
                      const pctOfAccount = accountTotal > 0
                        ? (pos.current_value / accountTotal) * 100
                        : 0
                      const acctTxns = lastTransactions[pos.account_number] || {}
                      const symTxns  = acctTxns[pos.symbol] || {}
                      return (
                        <tr
                          key={i}
                          className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-2 font-medium text-gray-800">{pos.symbol}</td>
                          <td className="px-4 py-2 text-gray-500 max-w-xs truncate">{pos.description}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{pos.quantity}</td>
                          <td className="px-4 py-2 text-right text-gray-800">{fmt(pos.current_value)}</td>
                          {hasLive && <td className="px-4 py-2 text-right text-green-700">{fmt(liveValueFor(pos))}</td>}
                          <td className="px-4 py-2 text-right text-gray-500">{fmtPct(pctOfAccount)}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{symTxns.lastBuy  || '—'}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{symTxns.lastSell || '—'}</td>
                        </tr>
                      )
                    })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-700">
                    <td colSpan={3} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-gray-500">Account Total</td>
                    <td className="px-4 py-2 text-right">{fmt(accountTotal)}</td>
                    {hasLive && <td className="px-4 py-2 text-right text-green-700">{fmt(liveAccountTotal)}</td>}
                    <td className="px-4 py-2 text-right text-gray-500">{fmtPct(accountPct)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        })}

      {/* Grand total */}
      <div className="border border-gray-300 rounded-lg bg-gray-50 px-4 py-3 flex justify-between items-center font-semibold text-gray-800">
        <span>Grand Total — {Object.keys(accounts).length} account{Object.keys(accounts).length !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-4">
          <span>{fmt(grandTotal)}</span>
          {hasLive && <span className="text-green-700">Live: {fmt(liveGrandTotal)}</span>}
        </div>
      </div>
    </div>
  )
}

export default PortfolioByAccount

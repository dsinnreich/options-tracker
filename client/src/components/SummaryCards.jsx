import { formatCurrencyWhole, formatPercent } from '../utils/calculations'

function SummaryCards({ positions }) {
  const openPositions = positions.filter(p => p.status === 'Open')
  const closedPositions = positions.filter(p => p.status === 'Closed')

  const totalPremiumCollected = positions.reduce((sum, p) => sum + p.net_premium, 0)
  const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0)
  const openPnL = openPositions.reduce((sum, p) => sum + p.pnl, 0)
  const realizedPnL = closedPositions.reduce((sum, p) => sum + p.pnl, 0)

  const totalCapitalAtRisk = openPositions.reduce((sum, p) => sum + p.capital_at_risk, 0)

  const avgAnnualizedYield = openPositions.length > 0
    ? openPositions.reduce((sum, p) => sum + p.annualized_yield, 0) / openPositions.length
    : 0

  const cards = [
    {
      title: 'Open Positions',
      value: openPositions.length,
      subtitle: `${closedPositions.length} closed`,
      color: 'blue'
    },
    {
      title: 'Total Premium Collected',
      value: formatCurrencyWhole(totalPremiumCollected),
      subtitle: 'Net of fees',
      color: 'green'
    },
    {
      title: 'Capital at Risk',
      value: formatCurrencyWhole(totalCapitalAtRisk),
      subtitle: 'Open positions only',
      color: 'yellow'
    },
    {
      title: 'Total P&L',
      value: formatCurrencyWhole(totalPnL),
      subtitle: `Realized: ${formatCurrencyWhole(realizedPnL)}`,
      color: totalPnL >= 0 ? 'green' : 'red'
    },
    {
      title: 'Avg Annualized Yield',
      value: formatPercent(avgAnnualizedYield),
      subtitle: 'Open positions',
      color: 'purple'
    }
  ]

  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red: 'bg-red-50 border-red-200',
    purple: 'bg-purple-50 border-purple-200',
    indigo: 'bg-indigo-50 border-indigo-200'
  }

  const textColorClasses = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    yellow: 'text-yellow-700',
    red: 'text-red-700',
    purple: 'text-purple-700',
    indigo: 'text-indigo-700'
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className={`p-4 rounded-lg border ${colorClasses[card.color]}`}
        >
          <p className="text-sm text-gray-600 mb-1">{card.title}</p>
          <p className={`text-xl font-bold ${textColorClasses[card.color]}`}>
            {card.value}
          </p>
          <p className="text-xs text-gray-500 mt-1">{card.subtitle}</p>
        </div>
      ))}
    </div>
  )
}

export default SummaryCards

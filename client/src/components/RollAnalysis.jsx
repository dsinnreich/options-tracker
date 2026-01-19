import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { usePositions } from '../hooks/usePositions'
import { format, parseISO } from 'date-fns'
import {
  formatCurrency,
  formatPercent,
  daysToExpiration,
  rollNetDebitCredit,
  rollBreakEven,
  effectiveSalePrice,
  effectiveSalePriceAfterRoll,
  estimatedThetaDecay,
  extrinsicValue,
  additionalPremiumNeeded,
  rentPerDay
} from '../utils/calculations'
import {
  analyzeRollDecision,
  getRecommendationColor,
  getActionColor
} from '../utils/rollRecommendations'

function RollAnalysis() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getPosition } = usePositions()
  const [position, setPosition] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analysis, setAnalysis] = useState(null)

  const {
    register,
    watch,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      new_expiration_date: '',
      new_strike_price: '',
      estimated_close_cost: '',
      new_premium_per_contract: '',
      new_delta: ''
    }
  })

  const watchedFields = watch()

  // Load position data
  useEffect(() => {
    if (id) {
      setLoading(true)
      getPosition(id).then(pos => {
        if (pos) {
          setPosition(pos)
        }
        setLoading(false)
      })
    }
  }, [id, getPosition])

  // Auto-fill estimated close cost from current_option_price
  useEffect(() => {
    if (position && position.current_option_price && !watchedFields.estimated_close_cost) {
      setValue('estimated_close_cost', position.current_option_price.toFixed(3))
    }
  }, [position, setValue, watchedFields.estimated_close_cost])

  // Calculate analysis in real-time as user inputs change
  useEffect(() => {
    if (!position) return

    const {
      new_expiration_date,
      new_strike_price,
      estimated_close_cost,
      new_premium_per_contract,
      new_delta
    } = watchedFields

    // Only calculate if we have minimum required fields
    if (!new_expiration_date || !new_strike_price || !estimated_close_cost || !new_premium_per_contract) {
      setAnalysis(null)
      return
    }

    const closePrice = parseFloat(estimated_close_cost)
    const newPremium = parseFloat(new_premium_per_contract)
    const newStrike = parseFloat(new_strike_price)
    const newDelta = new_delta ? parseFloat(new_delta) : null

    // Validate inputs
    if (isNaN(closePrice) || isNaN(newPremium) || isNaN(newStrike)) {
      setAnalysis(null)
      return
    }

    if (closePrice < 0 || newPremium < 0 || newStrike < 0) {
      setAnalysis(null)
      return
    }

    if (newDelta !== null && (newDelta < 0 || newDelta > 1)) {
      setAnalysis(null)
      return
    }

    // Calculate metrics
    const currentDTE = position.dte
    const newDTE = daysToExpiration(new_expiration_date)
    const additionalDays = newDTE - currentDTE

    const netDebitCredit = rollNetDebitCredit(
      closePrice,
      newPremium,
      position.quantity,
      position.fees || 0
    )

    const breakEven = rollBreakEven(newStrike, netDebitCredit, position.quantity)

    const effectiveSaleCurrent = effectiveSalePrice(
      position.strike_price,
      position.premium_per_contract,
      position.quantity,
      position.fees || 0
    )

    const effectiveSaleAfterRoll = effectiveSalePriceAfterRoll(
      newStrike,
      position.premium_per_contract,
      position.quantity,
      position.fees || 0,
      netDebitCredit,
      position.quantity
    )

    const currentExtrinsic = extrinsicValue(
      position.current_option_price || 0,
      position.stock_price,
      position.strike_price
    )

    const estimatedTheta = estimatedThetaDecay(currentExtrinsic, currentDTE, newDTE)

    const currentRentPerDay = rentPerDay(
      position.premium_per_contract,
      position.quantity,
      position.fees || 0,
      position.expiration_date,
      position.open_date
    )

    const additionalPremium = additionalPremiumNeeded(currentRentPerDay, additionalDays)

    // Get recommendation
    const recommendation = analyzeRollDecision({
      netDebitCredit,
      estimatedTheta,
      currentPnL: position.pnl,
      effectiveSaleCurrent,
      effectiveSaleAfterRoll,
      additionalDays,
      newDelta,
      additionalPremiumNeeded: additionalPremium
    })

    setAnalysis({
      netDebitCredit,
      breakEven,
      effectiveSaleCurrent,
      effectiveSaleAfterRoll,
      estimatedTheta,
      additionalDays,
      currentRentPerDay,
      additionalPremium,
      recommendation
    })
  }, [watchedFields, position])

  if (loading) {
    return <div className="text-center py-8">Loading position...</div>
  }

  if (!position) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Position not found</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          Return to Dashboard
        </button>
      </div>
    )
  }

  if (position.status !== 'Open') {
    return (
      <div className="text-center py-8">
        <p className="text-yellow-600">Roll analysis is only available for open positions</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          Return to Dashboard
        </button>
      </div>
    )
  }

  const actionColors = analysis ? getActionColor(analysis.recommendation.action) : null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Roll Analysis</h1>
        <button
          onClick={() => navigate('/')}
          className="text-gray-600 hover:text-gray-800"
        >
          Back to Dashboard
        </button>
      </div>

      {/* Current Position Summary */}
      <div className="bg-blue-50 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-4">Current Position</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-blue-700">Ticker</div>
            <div className="font-medium text-blue-900">{position.ticker}</div>
          </div>
          <div>
            <div className="text-sm text-blue-700">Strike</div>
            <div className="font-medium text-blue-900">${position.strike_price.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-blue-700">Expiration</div>
            <div className="font-medium text-blue-900">
              {format(parseISO(position.expiration_date), 'MMM dd, yyyy')}
            </div>
          </div>
          <div>
            <div className="text-sm text-blue-700">DTE</div>
            <div className="font-medium text-blue-900">{position.dte} days</div>
          </div>
          <div>
            <div className="text-sm text-blue-700">Stock Price</div>
            <div className="font-medium text-blue-900">${position.stock_price.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-blue-700">Moneyness</div>
            <div className="font-medium text-blue-900">{position.moneyness}</div>
          </div>
          <div>
            <div className="text-sm text-blue-700">Current P&L</div>
            <div className={`font-medium ${position.pnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatCurrency(position.pnl)}
            </div>
          </div>
          <div>
            <div className="text-sm text-blue-700">Delta</div>
            <div className="font-medium text-blue-900">
              {position.delta ? (position.delta * 100).toFixed(1) + '%' : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Roll Target Parameters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Roll Target Parameters</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Expiration Date *
              </label>
              <input
                type="date"
                {...register('new_expiration_date', {
                  required: 'New expiration date is required',
                  validate: (value) => {
                    const newDate = new Date(value)
                    const currentDate = new Date(position.expiration_date)
                    return newDate > currentDate || 'New expiration must be after current expiration'
                  }
                })}
                className="w-full px-3 py-2 border rounded-md focus:ring-purple-500 focus:border-purple-500"
              />
              {errors.new_expiration_date && (
                <p className="text-red-500 text-sm mt-1">{errors.new_expiration_date.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Strike Price *
              </label>
              <input
                type="number"
                step="0.01"
                {...register('new_strike_price', {
                  required: 'New strike price is required',
                  min: { value: 0, message: 'Must be positive' }
                })}
                className="w-full px-3 py-2 border rounded-md focus:ring-purple-500 focus:border-purple-500"
                placeholder="0.00"
              />
              {errors.new_strike_price && (
                <p className="text-red-500 text-sm mt-1">{errors.new_strike_price.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estimated Close Cost *
              </label>
              <input
                type="number"
                step="0.001"
                {...register('estimated_close_cost', {
                  required: 'Close cost is required',
                  min: { value: 0, message: 'Must be positive' }
                })}
                className="w-full px-3 py-2 border rounded-md focus:ring-purple-500 focus:border-purple-500"
                placeholder="0.000"
              />
              {errors.estimated_close_cost && (
                <p className="text-red-500 text-sm mt-1">{errors.estimated_close_cost.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Premium Per Contract *
              </label>
              <input
                type="number"
                step="0.01"
                {...register('new_premium_per_contract', {
                  required: 'New premium is required',
                  min: { value: 0, message: 'Must be positive' }
                })}
                className="w-full px-3 py-2 border rounded-md focus:ring-purple-500 focus:border-purple-500"
                placeholder="0.00"
              />
              {errors.new_premium_per_contract && (
                <p className="text-red-500 text-sm mt-1">{errors.new_premium_per_contract.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Delta (optional)
              </label>
              <input
                type="number"
                step="0.01"
                {...register('new_delta', {
                  min: { value: 0, message: 'Must be between 0 and 1' },
                  max: { value: 1, message: 'Must be between 0 and 1' }
                })}
                className="w-full px-3 py-2 border rounded-md focus:ring-purple-500 focus:border-purple-500"
                placeholder="0.00 - 1.00"
              />
              {errors.new_delta && (
                <p className="text-red-500 text-sm mt-1">{errors.new_delta.message}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Results */}
      {analysis && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Analysis Results</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Net Debit/Credit</div>
                <div className={`text-lg font-semibold ${analysis.netDebitCredit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCurrency(analysis.netDebitCredit)}
                </div>
                <div className="text-xs text-gray-500">
                  {analysis.netDebitCredit >= 0 ? 'Credit received' : 'Debit paid'}
                </div>
              </div>

              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Break-Even Price</div>
                <div className="text-lg font-semibold text-gray-900">
                  ${analysis.breakEven.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">Stock price for zero P&L</div>
              </div>

              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Additional Days</div>
                <div className="text-lg font-semibold text-gray-900">
                  {analysis.additionalDays}
                </div>
                <div className="text-xs text-gray-500">Time extension</div>
              </div>

              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Current Effective Sale</div>
                <div className="text-lg font-semibold text-gray-900">
                  ${analysis.effectiveSaleCurrent.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">If assigned now</div>
              </div>

              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">New Effective Sale</div>
                <div className="text-lg font-semibold text-gray-900">
                  ${analysis.effectiveSaleAfterRoll.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">If assigned after roll</div>
              </div>

              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Price Improvement</div>
                <div className={`text-lg font-semibold ${
                  (analysis.effectiveSaleAfterRoll - analysis.effectiveSaleCurrent) >= 0
                    ? 'text-green-700'
                    : 'text-red-700'
                }`}>
                  {(analysis.effectiveSaleAfterRoll - analysis.effectiveSaleCurrent) >= 0 ? '+' : ''}
                  ${(analysis.effectiveSaleAfterRoll - analysis.effectiveSaleCurrent).toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">Per share</div>
              </div>

              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Estimated Theta</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatCurrency(analysis.estimatedTheta)}
                </div>
                <div className="text-xs text-gray-500">Expected decay for period</div>
              </div>

              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Current Rent/Day</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatCurrency(analysis.currentRentPerDay)}
                </div>
                <div className="text-xs text-gray-500">Daily premium rate</div>
              </div>

              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm text-gray-600">Benchmark Premium</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatCurrency(analysis.additionalPremium)}
                </div>
                <div className="text-xs text-gray-500">For {analysis.additionalDays} days</div>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className={`${actionColors.bg} border-l-4 ${actionColors.border} rounded-lg shadow p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recommendation</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${actionColors.badge}`}>
                {analysis.recommendation.action}
              </span>
            </div>

            <p className={`${actionColors.text} mb-4`}>{analysis.recommendation.summary}</p>

            <div className="space-y-3">
              {analysis.recommendation.recommendations.map((rec, index) => {
                const colors = getRecommendationColor(rec.type)
                return (
                  <div
                    key={index}
                    className={`${colors.bg} border ${colors.border} rounded-md p-3`}
                  >
                    <div className="flex items-start">
                      <span className="text-lg mr-2">{colors.icon}</span>
                      <div className="flex-1">
                        <div className={`font-medium ${colors.text}`}>{rec.title}</div>
                        <div className={`text-sm ${colors.text} opacity-90`}>{rec.message}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {!analysis && (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-600">
          Fill in the roll target parameters above to see analysis and recommendations
        </div>
      )}
    </div>
  )
}

export default RollAnalysis

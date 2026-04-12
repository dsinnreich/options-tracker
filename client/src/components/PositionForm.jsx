import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { usePositions } from '../hooks/usePositions'
import { generateOptionTicker, formatCurrency, netPremium, annualizedYield, capitalAtRisk } from '../utils/calculations'
import { format } from 'date-fns'

const MONTH_MAP = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
}

function parseBrokerDate(dateStr) {
  // "Mar-05-2026" → "2026-03-05"
  const parts = dateStr.trim().split('-')
  if (parts.length === 3) {
    const month = MONTH_MAP[parts[0]] || parts[0]
    return `${parts[2]}-${month}-${parts[1].padStart(2, '0')}`
  }
  return dateStr
}

function parseSymbol(symbol) {
  // "-MSCI260417C620" → { ticker, expiration_date, strike_price }
  const sym = symbol.replace(/^-/, '')
  const match = sym.match(/^([A-Z]+)(\d{6})([CP])(\d+(?:\.\d+)?)$/)
  if (!match) return null
  const [, ticker, dateStr, , strikeRaw] = match
  const yy = dateStr.substring(0, 2)
  const mm = dateStr.substring(2, 4)
  const dd = dateStr.substring(4, 6)
  return {
    ticker,
    expiration_date: `20${yy}-${mm}-${dd}`,
    strike_price: parseFloat(strikeRaw)
  }
}

function parseMoney(str) {
  return parseFloat(str.replace(/[$,]/g, ''))
}

function parseBrokerConfirmation(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l)
  const kv = {}
  for (let i = 0; i < lines.length - 1; i += 2) {
    kv[lines[i].toLowerCase()] = lines[i + 1]
  }

  const result = {}

  if (kv['date']) result.open_date = parseBrokerDate(kv['date'])

  if (kv['symbol']) {
    const parsed = parseSymbol(kv['symbol'])
    if (parsed) Object.assign(result, parsed)
  }

  if (kv['contracts']) {
    result.quantity = Math.abs(parseInt(parseFloat(kv['contracts'])))
  }

  if (kv['price']) result.premium_per_contract = parseMoney(kv['price'])

  let totalFees = 0
  if (kv['commission']) totalFees += parseMoney(kv['commission'])
  if (kv['fees']) totalFees += parseMoney(kv['fees'])
  if (totalFees > 0) result.fees = parseFloat(totalFees.toFixed(2))

  return result
}

function PositionForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { positions, getPosition, createPosition, updatePosition } = usePositions()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const [showPastePanel, setShowPastePanel] = useState(!id)
  const [parseError, setParseError] = useState('')
  const [stockPriceLoading, setStockPriceLoading] = useState(false)
  const [stockPriceError, setStockPriceError] = useState(false)

  const knownAccounts = [...new Set(positions.map(p => p.account).filter(Boolean))]

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      account: '',
      ticker: '',
      strike_price: '',
      stock_price: '',
      option_ticker: '',
      quantity: 1,
      open_date: format(new Date(), 'yyyy-MM-dd'),
      expiration_date: '',
      premium_per_contract: '',
      fees: 0,
      current_option_price: 0,
      status: 'Open',
      close_date: '',
      close_price: '',
      close_fees: 0
    }
  })

  const watchedFields = watch()

  useEffect(() => {
    if (id) {
      setLoading(true)
      getPosition(id).then(position => {
        if (position) {
          reset({
            account: position.account,
            ticker: position.ticker,
            strike_price: position.strike_price,
            stock_price: position.stock_price,
            option_ticker: position.option_ticker || '',
            quantity: position.quantity,
            open_date: position.open_date,
            expiration_date: position.expiration_date,
            premium_per_contract: position.premium_per_contract,
            fees: position.fees || 0,
            current_option_price: position.current_option_price || 0,
            status: position.status || 'Open',
            close_date: position.close_date || '',
            close_price: position.close_price ?? '',
            close_fees: position.close_fees || 0
          })
        }
        setLoading(false)
      })
    }
  }, [id, getPosition, reset])

  // Auto-fetch stock price when ticker changes (new positions only)
  useEffect(() => {
    if (id) return
    const ticker = watchedFields.ticker?.trim().toUpperCase()
    if (!ticker) return

    setStockPriceError(false)
    const timer = setTimeout(async () => {
      setStockPriceLoading(true)
      try {
        const res = await fetch(`/api/prices/stock/${ticker}`, { credentials: 'include' })
        if (!res.ok) throw new Error('fetch failed')
        const data = await res.json()
        if (data.price != null) {
          setValue('stock_price', data.price)
          setStockPriceError(false)
        } else {
          setStockPriceError(true)
        }
      } catch {
        setStockPriceError(true)
      } finally {
        setStockPriceLoading(false)
      }
    }, 600)

    return () => clearTimeout(timer)
  }, [watchedFields.ticker, id, setValue])

  // Auto-generate option ticker
  useEffect(() => {
    const { ticker, expiration_date, strike_price } = watchedFields
    if (ticker && expiration_date && strike_price) {
      const optionTicker = generateOptionTicker(ticker, expiration_date, parseFloat(strike_price))
      setValue('option_ticker', optionTicker)
    }
  }, [watchedFields.ticker, watchedFields.expiration_date, watchedFields.strike_price, setValue])

  // Calculate preview
  useEffect(() => {
    const { premium_per_contract, quantity, fees, stock_price, expiration_date, open_date } = watchedFields
    if (premium_per_contract && quantity && stock_price && expiration_date) {
      const net = netPremium(parseFloat(premium_per_contract), parseInt(quantity), parseFloat(fees) || 0)
      const capital = capitalAtRisk(parseFloat(stock_price), parseInt(quantity))
      const annualized = annualizedYield(
        parseFloat(premium_per_contract),
        parseInt(quantity),
        parseFloat(fees) || 0,
        parseFloat(stock_price),
        expiration_date,
        open_date
      )
      setPreview({ net, capital, annualized })
    } else {
      setPreview(null)
    }
  }, [watchedFields])

  function handleParse() {
    setParseError('')
    const parsed = parseBrokerConfirmation(pasteText)
    if (!parsed.ticker) {
      setParseError('Could not parse symbol. Make sure the confirmation text is pasted correctly.')
      return
    }
    if (parsed.open_date) setValue('open_date', parsed.open_date)
    if (parsed.ticker) setValue('ticker', parsed.ticker.toUpperCase())
    if (parsed.expiration_date) setValue('expiration_date', parsed.expiration_date)
    if (parsed.strike_price != null) setValue('strike_price', parsed.strike_price)
    if (parsed.quantity != null) setValue('quantity', parsed.quantity)
    if (parsed.premium_per_contract != null) setValue('premium_per_contract', parsed.premium_per_contract)
    if (parsed.fees != null) setValue('fees', parsed.fees)
    setPasteText('')
    setShowPastePanel(false)
  }

  const onSubmit = async (data) => {
    setLoading(true)
    const formattedData = {
      ...data,
      strike_price: parseFloat(data.strike_price),
      stock_price: parseFloat(data.stock_price),
      quantity: parseInt(data.quantity),
      premium_per_contract: parseFloat(data.premium_per_contract),
      fees: parseFloat(data.fees) || 0,
      current_option_price: parseFloat(data.current_option_price) || 0,
      close_price: data.close_price !== '' ? parseFloat(data.close_price) : null,
      close_fees: parseFloat(data.close_fees) || 0,
      close_date: data.close_date || null
    }

    const success = id
      ? await updatePosition(id, formattedData)
      : await createPosition(formattedData)

    setLoading(false)
    if (success) {
      navigate('/')
    }
  }

  if (loading && id) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {id ? 'Edit Position' : 'Add New Position'}
      </h1>

      {!id && (
        <div className="mb-6 bg-white rounded-lg shadow overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPastePanel(!showPastePanel)}
            className="w-full flex items-center justify-between px-6 py-4 text-left font-medium text-gray-700 hover:bg-gray-50"
          >
            <span>Paste broker confirmation</span>
            <span className="text-gray-400 text-xs">{showPastePanel ? '▲' : '▼'}</span>
          </button>
          {showPastePanel && (
            <div className="px-6 pb-5 space-y-3 border-t border-gray-100 pt-4">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                className="w-full h-40 px-3 py-2 border rounded-md text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
                placeholder="Paste your broker confirmation here..."
              />
              {parseError && <p className="text-red-500 text-sm">{parseError}</p>}
              <button
                type="button"
                onClick={handleParse}
                disabled={!pasteText.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-40 text-sm font-medium"
              >
                Fill form from confirmation
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
            <input
              type="text"
              list="accounts-list"
              {...register('account', { required: 'Account is required' })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Fidelity"
              autoComplete="off"
            />
            <datalist id="accounts-list">
              {knownAccounts.map(acc => (
                <option key={acc} value={acc} />
              ))}
            </datalist>
            {errors.account && <p className="text-red-500 text-sm mt-1">{errors.account.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ticker</label>
            <input
              type="text"
              {...register('ticker', { required: 'Ticker is required' })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 uppercase"
              placeholder="e.g., AAPL"
            />
            {errors.ticker && <p className="text-red-500 text-sm mt-1">{errors.ticker.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stock Price (at open)
              {stockPriceLoading && <span className="ml-2 text-xs text-gray-400">Fetching...</span>}
            </label>
            <input
              type="number"
              step="0.01"
              {...register('stock_price', { min: 0 })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
            {stockPriceError && (
              <p className="text-amber-600 text-sm mt-1">Could not fetch price — please enter manually.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Strike Price</label>
            <input
              type="number"
              step="0.01"
              {...register('strike_price', { required: 'Strike price is required', min: 0 })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
            {errors.strike_price && <p className="text-red-500 text-sm mt-1">{errors.strike_price.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Open Date</label>
            <input
              type="date"
              {...register('open_date', { required: 'Open date is required' })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.open_date && <p className="text-red-500 text-sm mt-1">{errors.open_date.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date</label>
            <input
              type="date"
              {...register('expiration_date', { required: 'Expiration date is required' })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.expiration_date && <p className="text-red-500 text-sm mt-1">{errors.expiration_date.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (contracts)</label>
            <input
              type="number"
              {...register('quantity', { required: 'Quantity is required', min: 1 })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="1"
            />
            {errors.quantity && <p className="text-red-500 text-sm mt-1">{errors.quantity.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Premium (per contract)</label>
            <input
              type="number"
              step="0.01"
              {...register('premium_per_contract', { required: 'Premium is required', min: 0 })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
            {errors.premium_per_contract && <p className="text-red-500 text-sm mt-1">{errors.premium_per_contract.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fees</label>
            <input
              type="number"
              step="0.01"
              {...register('fees')}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Option Ticker (auto-generated)</label>
          <input
            type="text"
            {...register('option_ticker')}
            className="w-full px-3 py-2 border rounded-md bg-gray-50 text-gray-600"
            readOnly
          />
        </div>

        {id && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Option Price</label>
            <input
              type="number"
              step="0.001"
              {...register('current_option_price')}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.000"
            />
          </div>
        )}

        {id && watchedFields.status === 'Closed' && (
          <div className="border-t pt-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Close Details</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Close Date</label>
                <input
                  type="date"
                  {...register('close_date')}
                  className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Close Price (per contract)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('close_price')}
                  className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Close Fees</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('close_fees')}
                  className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        )}

        {preview && (
          <div className="bg-blue-50 p-4 rounded-md">
            <h3 className="font-medium text-blue-900 mb-2">Preview</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-blue-700">Net Premium:</span>
                <span className="ml-2 font-medium">{formatCurrency(preview.net)}</span>
              </div>
              <div>
                <span className="text-blue-700">Capital at Risk:</span>
                <span className="ml-2 font-medium">{formatCurrency(preview.capital)}</span>
              </div>
              <div>
                <span className="text-blue-700">Annualized Yield:</span>
                <span className="ml-2 font-medium">{preview.annualized.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : id ? 'Update Position' : 'Add Position'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default PositionForm

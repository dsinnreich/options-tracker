import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { usePositions } from '../hooks/usePositions'
import { generateOptionTicker, formatCurrency, netPremium, annualizedYield, capitalAtRisk } from '../utils/calculations'
import { format } from 'date-fns'

function PositionForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getPosition, createPosition, updatePosition } = usePositions()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)

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
      current_option_price: 0
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
            current_option_price: position.current_option_price || 0
          })
        }
        setLoading(false)
      })
    }
  }, [id, getPosition, reset])

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

  const onSubmit = async (data) => {
    setLoading(true)
    const formattedData = {
      ...data,
      strike_price: parseFloat(data.strike_price),
      stock_price: parseFloat(data.stock_price),
      quantity: parseInt(data.quantity),
      premium_per_contract: parseFloat(data.premium_per_contract),
      fees: parseFloat(data.fees) || 0,
      current_option_price: parseFloat(data.current_option_price) || 0
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
            <input
              type="text"
              {...register('account', { required: 'Account is required' })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Fidelity"
            />
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Stock Price (at open)</label>
            <input
              type="number"
              step="0.01"
              {...register('stock_price', { required: 'Stock price is required', min: 0 })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
            {errors.stock_price && <p className="text-red-500 text-sm mt-1">{errors.stock_price.message}</p>}
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

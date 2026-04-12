import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { usePositions } from '../hooks/usePositions'
import { format } from 'date-fns'

const MONTH_MAP = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
}

function parseBrokerDate(dateStr) {
  const parts = dateStr.trim().split('-')
  if (parts.length === 3) {
    const month = MONTH_MAP[parts[0]] || parts[0]
    return `${parts[2]}-${month}-${parts[1].padStart(2, '0')}`
  }
  return dateStr
}

function parseMoney(str) {
  return parseFloat(str.replace(/[$,]/g, ''))
}

function parseCloseConfirmation(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l)
  const kv = {}
  for (let i = 0; i < lines.length - 1; i += 2) {
    kv[lines[i].toLowerCase()] = lines[i + 1]
  }

  const result = {}

  if (kv['date']) result.close_date = parseBrokerDate(kv['date'])
  if (kv['price']) result.close_price = parseMoney(kv['price'])

  let totalFees = 0
  if (kv['commission']) totalFees += parseMoney(kv['commission'])
  if (kv['fees']) totalFees += parseMoney(kv['fees'])
  if (totalFees > 0) result.close_fees = parseFloat(totalFees.toFixed(2))

  return result
}

function ClosePositionForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getPosition, closePosition } = usePositions()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [position, setPosition] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const [showPastePanel, setShowPastePanel] = useState(true)
  const [parseError, setParseError] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      close_date: format(new Date(), 'yyyy-MM-dd'),
      close_price: '',
      close_fees: 0
    }
  })

  useEffect(() => {
    getPosition(id).then(pos => {
      setPosition(pos)
      setLoading(false)
    })
  }, [id, getPosition])

  function handleParse() {
    setParseError('')
    const parsed = parseCloseConfirmation(pasteText)
    if (!parsed.close_price) {
      setParseError('Could not parse price. Make sure the confirmation text is pasted correctly.')
      return
    }
    if (parsed.close_date) setValue('close_date', parsed.close_date)
    if (parsed.close_price != null) setValue('close_price', parsed.close_price)
    if (parsed.close_fees != null) setValue('close_fees', parsed.close_fees)
    setPasteText('')
    setShowPastePanel(false)
  }

  const onSubmit = async (data) => {
    setSubmitting(true)
    const success = await closePosition(id, {
      close_price: parseFloat(data.close_price),
      close_fees: parseFloat(data.close_fees) || 0,
      close_date: data.close_date || null
    })
    setSubmitting(false)
    if (success) navigate('/')
  }

  if (loading) return <div className="text-center py-8">Loading...</div>
  if (!position) return <div className="text-center py-8 text-red-500">Position not found.</div>

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Close Position</h1>
      <p className="text-gray-500 mb-6">
        {position.ticker} — {position.quantity} contract{position.quantity !== 1 ? 's' : ''} @ ${position.strike_price} strike
      </p>

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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Close Date</label>
            <input
              type="date"
              {...register('close_date', { required: 'Close date is required' })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.close_date && <p className="text-red-500 text-sm mt-1">{errors.close_date.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Close Price (per contract)</label>
            <input
              type="number"
              step="0.01"
              {...register('close_price', { required: 'Close price is required', min: 0 })}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
            {errors.close_price && <p className="text-red-500 text-sm mt-1">{errors.close_price.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fees</label>
            <input
              type="number"
              step="0.01"
              {...register('close_fees')}
              className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
        </div>

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
            disabled={submitting}
            className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
          >
            {submitting ? 'Closing...' : 'Close Position'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ClosePositionForm

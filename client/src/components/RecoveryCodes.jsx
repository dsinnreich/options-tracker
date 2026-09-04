import { useState } from 'react'

function RecoveryCodes({ codes, onContinue, compact = false }) {
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const text = codes.join('\n')

  const copyCodes = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const downloadCodes = () => {
    const blob = new Blob([
      `Options Tracker recovery codes\n\n${text}\n\nEach code can be used once. Store these somewhere secure.\n`
    ], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'options-tracker-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={compact ? 'space-y-4' : 'mt-8 space-y-6'}>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-amber-900">Save your recovery codes now</h3>
        <p className="text-sm text-amber-800">
          Each code works once if you lose access to your authenticator. They will not be shown again.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 bg-gray-50 p-4">
        {codes.map(code => (
          <code key={code} className="text-center text-sm font-semibold tracking-wide text-gray-800">
            {code}
          </code>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={copyCodes}
          className="flex-1 py-2 px-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? 'Copied' : 'Copy codes'}
        </button>
        <button
          type="button"
          onClick={downloadCodes}
          className="flex-1 py-2 px-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Download
        </button>
      </div>

      {onContinue && (
        <>
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={event => setConfirmed(event.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            I saved these recovery codes somewhere secure.
          </label>
          <button
            type="button"
            disabled={!confirmed}
            onClick={onContinue}
            className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue to Options Tracker
          </button>
        </>
      )}
    </div>
  )
}

export default RecoveryCodes

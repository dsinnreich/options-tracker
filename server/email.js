export async function sendEmail(to, subject, html) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    }),
    signal: AbortSignal.timeout(15000),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Resend API returned ${response.status}: ${result.message || 'Unknown error'}`)
  }

  return result
}

export async function sendSecurityNotice(to, subject, message) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return
  try {
    await sendEmail(
      to,
      `${subject} - Options Tracker`,
      `<h2>${subject}</h2><p>${message}</p><p>If this was you, no further action is needed.</p>`
    )
  } catch (err) {
    console.error('Security notification email failed:', err.message)
  }
}

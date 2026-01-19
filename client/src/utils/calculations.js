import { differenceInDays, parseISO, format } from 'date-fns'

/**
 * Calculate days to expiration (TTE - Time To Expiration)
 */
export function daysToExpiration(expirationDate) {
  const expDate = typeof expirationDate === 'string' ? parseISO(expirationDate) : expirationDate
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, differenceInDays(expDate, today))
}

/**
 * Generate option ticker symbol
 * Format: TICKER YYMMDD C/P STRIKE
 */
export function generateOptionTicker(ticker, expirationDate, strikePrice, optionType = 'C') {
  const expDate = typeof expirationDate === 'string' ? parseISO(expirationDate) : expirationDate
  const dateStr = format(expDate, 'yyMMdd')
  const strikeStr = (strikePrice * 1000).toString().padStart(8, '0')
  return `${ticker.toUpperCase()}${dateStr}${optionType}${strikeStr}`
}

/**
 * Determine moneyness of option
 * For covered calls: ITM if stock price > strike, OTM if stock price < strike
 */
export function getMoneyness(stockPrice, strikePrice) {
  const diff = stockPrice - strikePrice
  const threshold = strikePrice * 0.01 // 1% threshold for ATM

  if (Math.abs(diff) <= threshold) return 'ATM'
  if (stockPrice > strikePrice) return 'ITM'
  return 'OTM'
}

/**
 * Calculate intrinsic value of call option
 */
export function intrinsicValue(stockPrice, strikePrice) {
  return Math.max(0, stockPrice - strikePrice)
}

/**
 * Calculate extrinsic (time) value of option
 */
export function extrinsicValue(optionPrice, stockPrice, strikePrice) {
  return Math.max(0, optionPrice - intrinsicValue(stockPrice, strikePrice))
}

/**
 * Calculate total premium received
 */
export function totalPremium(premiumPerContract, quantity) {
  return premiumPerContract * quantity * 100 // Each contract = 100 shares
}

/**
 * Calculate net premium (after fees)
 */
export function netPremium(premiumPerContract, quantity, fees = 0) {
  return totalPremium(premiumPerContract, quantity) - fees
}

/**
 * Calculate capital at risk (for covered call, it's the stock value)
 */
export function capitalAtRisk(stockPrice, quantity) {
  return stockPrice * quantity * 100
}

/**
 * Calculate return on capital
 */
export function returnOnCapital(premiumPerContract, quantity, fees, stockPrice) {
  const premium = netPremium(premiumPerContract, quantity, fees)
  const capital = capitalAtRisk(stockPrice, quantity)
  if (capital === 0) return 0
  return (premium / capital) * 100
}

/**
 * Calculate annualized yield
 */
export function annualizedYield(premiumPerContract, quantity, fees, stockPrice, expirationDate, openDate = new Date()) {
  const roc = returnOnCapital(premiumPerContract, quantity, fees, stockPrice)
  const expDate = typeof expirationDate === 'string' ? parseISO(expirationDate) : expirationDate
  const startDate = typeof openDate === 'string' ? parseISO(openDate) : openDate
  const days = Math.max(1, differenceInDays(expDate, startDate))
  return (roc / days) * 365
}

/**
 * Calculate rent per day (premium earned per day)
 */
export function rentPerDay(premiumPerContract, quantity, fees, expirationDate, openDate = new Date()) {
  const premium = netPremium(premiumPerContract, quantity, fees)
  const expDate = typeof expirationDate === 'string' ? parseISO(expirationDate) : expirationDate
  const startDate = typeof openDate === 'string' ? parseISO(openDate) : openDate
  const days = Math.max(1, differenceInDays(expDate, startDate))
  return premium / days
}

/**
 * Calculate current P&L for open position
 * For sold calls: Profit if current price < sold price
 */
export function unrealizedPnL(premiumPerContract, currentOptionPrice, quantity, fees = 0) {
  const received = netPremium(premiumPerContract, quantity, fees)
  const currentValue = currentOptionPrice * quantity * 100
  return received - currentValue
}

/**
 * Calculate realized P&L for closed position
 */
export function realizedPnL(premiumPerContract, closePrice, quantity, fees = 0) {
  const received = netPremium(premiumPerContract, quantity, fees)
  const closeCost = closePrice * quantity * 100
  return received - closeCost
}

/**
 * Calculate extrinsic buffer
 * current_option_price - (stock_price - strike_price)
 */
export function extrinsicBuffer(currentOptionPrice, stockPrice, strikePrice) {
  return currentOptionPrice - (stockPrice - strikePrice)
}

/**
 * Calculate P&L based on position status
 */
export function calculatePnL(position) {
  if (position.status === 'Closed') {
    return realizedPnL(
      position.premium_per_contract,
      position.close_price || 0,
      position.quantity,
      position.fees
    )
  }
  return unrealizedPnL(
    position.premium_per_contract,
    position.current_option_price || 0,
    position.quantity,
    position.fees
  )
}

/**
 * Calculate all derived fields for a position
 */
export function calculateDerivedFields(position) {
  const dte = daysToExpiration(position.expiration_date)
  const moneyness = getMoneyness(position.stock_price, position.strike_price)
  const total = totalPremium(position.premium_per_contract, position.quantity)
  const net = netPremium(position.premium_per_contract, position.quantity, position.fees)
  const capital = capitalAtRisk(position.stock_price, position.quantity)
  const roc = returnOnCapital(position.premium_per_contract, position.quantity, position.fees, position.stock_price)
  const annualized = annualizedYield(
    position.premium_per_contract,
    position.quantity,
    position.fees,
    position.stock_price,
    position.expiration_date,
    position.open_date
  )
  const rent = rentPerDay(
    position.premium_per_contract,
    position.quantity,
    position.fees,
    position.expiration_date,
    position.open_date
  )
  const pnl = calculatePnL(position)
  const extBuffer = extrinsicBuffer(
    position.current_option_price || 0,
    position.stock_price,
    position.strike_price
  )

  return {
    ...position,
    dte,
    moneyness,
    total_premium: total,
    net_premium: net,
    capital_at_risk: capital,
    return_on_capital: roc,
    annualized_yield: annualized,
    rent_per_day: rent,
    pnl,
    extrinsic_buffer: extBuffer
  }
}

/**
 * Calculate net debit/credit of a roll
 * Positive = net credit received, Negative = net debit paid
 */
export function rollNetDebitCredit(currentClosePrice, newPremiumPerContract, quantity, fees = 0) {
  const newPremium = newPremiumPerContract * quantity * 100
  const closeCost = currentClosePrice * quantity * 100
  return newPremium - closeCost - fees
}

/**
 * Calculate break-even price after rolling
 */
export function rollBreakEven(newStrikePrice, netDebitCredit, quantity) {
  const netPerShare = netDebitCredit / (quantity * 100)
  return newStrikePrice + netPerShare
}

/**
 * Calculate effective sale price if assigned on current position
 */
export function effectiveSalePrice(strikePrice, premiumPerContract, quantity, fees = 0) {
  const net = netPremium(premiumPerContract, quantity, fees)
  const shares = quantity * 100
  return strikePrice + (net / shares)
}

/**
 * Calculate effective sale price if assigned after rolling
 * Includes original premium + roll net credit/debit
 */
export function effectiveSalePriceAfterRoll(
  newStrikePrice,
  originalPremiumPerContract,
  originalQuantity,
  originalFees,
  rollNetDebitCredit,
  quantity
) {
  const originalNet = netPremium(originalPremiumPerContract, originalQuantity, originalFees)
  const totalNet = originalNet + rollNetDebitCredit
  const shares = quantity * 100
  return newStrikePrice + (totalNet / shares)
}

/**
 * Estimate theta decay for extended time period
 * Uses simple linear decay model: daily theta = extrinsic / DTE
 */
export function estimatedThetaDecay(currentExtrinsicValue, currentDTE, newDTE) {
  if (currentDTE <= 0) return 0
  const dailyTheta = currentExtrinsicValue / currentDTE
  const additionalDays = newDTE - currentDTE
  return dailyTheta * additionalDays
}

/**
 * Alias for extrinsicValue with clearer semantics
 * Returns the time value portion of an option price
 */
export function timeValue(optionPrice, stockPrice, strikePrice) {
  return extrinsicValue(optionPrice, stockPrice, strikePrice)
}

/**
 * Calculate additional premium needed based on current rent per day
 * Benchmark for evaluating roll credit
 */
export function additionalPremiumNeeded(currentRentPerDay, additionalDays) {
  return currentRentPerDay * additionalDays
}

/**
 * Format currency
 */
export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value)
}

/**
 * Format currency with no decimals
 */
export function formatCurrencyWhole(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.round(value))
}

/**
 * Format percentage
 */
export function formatPercent(value) {
  return `${value.toFixed(2)}%`
}

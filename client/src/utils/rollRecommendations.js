/**
 * Roll Analysis Recommendation Engine
 * Provides strategy-aligned guidance for roll decisions
 */

/**
 * Analyze roll decision and provide recommendation
 *
 * @param {Object} analysisData - Calculated metrics for the roll
 * @param {number} analysisData.netDebitCredit - Net debit/credit of the roll
 * @param {number} analysisData.estimatedTheta - Expected theta decay for additional days
 * @param {number} analysisData.currentPnL - Current unrealized P&L
 * @param {number} analysisData.effectiveSaleCurrent - Effective sale price of current position
 * @param {number} analysisData.effectiveSaleAfterRoll - Effective sale price after rolling
 * @param {number} analysisData.additionalDays - Additional days from rolling
 * @param {number} analysisData.newDelta - Delta of new position (optional)
 * @param {number} analysisData.additionalPremiumNeeded - Benchmark premium for additional days
 *
 * @returns {Object} Recommendation object
 * @returns {string} .action - 'ROLL', 'HOLD', or 'NEUTRAL'
 * @returns {number} .score - Numerical score (-100 to 100)
 * @returns {Array} .recommendations - Array of recommendation items
 * @returns {string} .summary - Brief summary of recommendation
 */
export function analyzeRollDecision(analysisData) {
  const {
    netDebitCredit,
    estimatedTheta,
    currentPnL,
    effectiveSaleCurrent,
    effectiveSaleAfterRoll,
    additionalDays,
    newDelta,
    additionalPremiumNeeded
  } = analysisData

  const recommendations = []
  let score = 0

  // Rule 1: Paying to avoid assignment (red flag for this strategy)
  if (netDebitCredit < 0) {
    recommendations.push({
      type: 'warning',
      title: 'Net Debit Roll',
      message: `You're paying $${Math.abs(netDebitCredit).toFixed(2)} to delay assignment. Since you're comfortable with assignment, this may not align with your strategy.`
    })
    score -= 50
  }

  // Rule 2 & 3: Net credit vs expected theta
  if (netDebitCredit > 0) {
    if (netDebitCredit < estimatedTheta) {
      recommendations.push({
        type: 'caution',
        title: 'Below Expected Theta',
        message: `Rolling for $${netDebitCredit.toFixed(2)} when estimated theta decay is $${estimatedTheta.toFixed(2)}. You're getting less than expected time decay.`
      })
      score -= 20
    } else if (netDebitCredit >= estimatedTheta) {
      const premium = netDebitCredit - estimatedTheta
      recommendations.push({
        type: 'positive',
        title: 'Above Expected Theta',
        message: `Rolling for $${netDebitCredit.toFixed(2)} exceeds estimated theta of $${estimatedTheta.toFixed(2)} by $${premium.toFixed(2)}. Good premium collection.`
      })
      score += 30
    }

    // Compare to benchmark rent
    if (additionalPremiumNeeded && netDebitCredit >= additionalPremiumNeeded) {
      recommendations.push({
        type: 'positive',
        title: 'Maintains Rent Rate',
        message: `New premium of $${netDebitCredit.toFixed(2)} meets or exceeds your current rent rate benchmark of $${additionalPremiumNeeded.toFixed(2)}.`
      })
      score += 20
    }
  }

  // Rule 4: High delta warning
  if (newDelta && newDelta > 0.3) {
    recommendations.push({
      type: 'info',
      title: 'Higher Assignment Risk',
      message: `New delta of ${(newDelta * 100).toFixed(1)}% indicates higher probability of assignment. Consider if this aligns with your goals.`
    })
    score -= 10
  }

  // Rule 5: Effective sale price improvement
  const priceImprovement = effectiveSaleAfterRoll - effectiveSaleCurrent
  if (priceImprovement > 0) {
    recommendations.push({
      type: 'positive',
      title: 'Improved Sale Price',
      message: `Rolling improves your effective sale price by $${priceImprovement.toFixed(2)} per share (from $${effectiveSaleCurrent.toFixed(2)} to $${effectiveSaleAfterRoll.toFixed(2)}).`
    })
    score += 25
  } else if (priceImprovement < 0) {
    recommendations.push({
      type: 'warning',
      title: 'Lower Sale Price',
      message: `Rolling decreases your effective sale price by $${Math.abs(priceImprovement).toFixed(2)} per share.`
    })
    score -= 30
  }

  // Rule 6: Short time extension
  if (additionalDays < 7) {
    recommendations.push({
      type: 'caution',
      title: 'Short Time Extension',
      message: `Only extending by ${additionalDays} days. Consider if the premium justifies the transaction costs.`
    })
    score -= 15
  }

  // Rule 7: Current profit available
  if (currentPnL > 0) {
    recommendations.push({
      type: 'info',
      title: 'Profit Available',
      message: `You have $${currentPnL.toFixed(2)} unrealized profit. You could close now to lock in gains instead of rolling.`
    })
  }

  // Determine action based on score
  let action = 'NEUTRAL'
  let summary = ''

  if (score >= 30) {
    action = 'ROLL'
    summary = 'Rolling appears favorable based on premium collection and effective sale price improvement.'
  } else if (score <= -30) {
    action = 'HOLD'
    summary = 'Consider holding current position or closing rather than rolling. The economics may not justify the roll.'
  } else {
    action = 'NEUTRAL'
    summary = 'The roll decision is close. Review the factors below and decide based on your current market outlook.'
  }

  return {
    action,
    score,
    recommendations,
    summary
  }
}

/**
 * Get color theme for recommendation type
 */
export function getRecommendationColor(type) {
  const colors = {
    positive: {
      bg: 'bg-green-50',
      border: 'border-green-500',
      text: 'text-green-800',
      icon: '✓'
    },
    warning: {
      bg: 'bg-red-50',
      border: 'border-red-500',
      text: 'text-red-800',
      icon: '⚠'
    },
    caution: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-500',
      text: 'text-yellow-800',
      icon: '⚡'
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-500',
      text: 'text-blue-800',
      icon: 'ℹ'
    }
  }
  return colors[type] || colors.info
}

/**
 * Get color theme for action
 */
export function getActionColor(action) {
  const colors = {
    ROLL: {
      bg: 'bg-green-50',
      border: 'border-green-500',
      text: 'text-green-800',
      badge: 'bg-green-100 text-green-800'
    },
    HOLD: {
      bg: 'bg-red-50',
      border: 'border-red-500',
      text: 'text-red-800',
      badge: 'bg-red-100 text-red-800'
    },
    NEUTRAL: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-500',
      text: 'text-yellow-800',
      badge: 'bg-yellow-100 text-yellow-800'
    }
  }
  return colors[action] || colors.NEUTRAL
}

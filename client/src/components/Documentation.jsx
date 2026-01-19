import { useState } from 'react'

function Documentation() {
  const [openSection, setOpenSection] = useState(null)

  const toggleSection = (section) => {
    setOpenSection(openSection === section ? null : section)
  }

  const AccordionSection = ({ id, title, children, icon }) => {
    const isOpen = openSection === id
    return (
      <div className="border border-gray-200 rounded-lg mb-3">
        <button
          onClick={() => toggleSection(id)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <span className="text-2xl">{icon}</span>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          </div>
          <span className="text-gray-500 text-xl">{isOpen ? '−' : '+'}</span>
        </button>
        {isOpen && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            {children}
          </div>
        )}
      </div>
    )
  }

  const Formula = ({ title, formula, description }) => (
    <div className="bg-white rounded-md p-4 mb-3 border border-gray-200">
      <div className="font-semibold text-gray-900 mb-2">{title}</div>
      <div className="bg-blue-50 p-3 rounded font-mono text-sm text-blue-900 mb-2">
        {formula}
      </div>
      {description && <div className="text-sm text-gray-600">{description}</div>}
    </div>
  )

  const Example = ({ title, children }) => (
    <div className="bg-green-50 rounded-md p-4 mb-3 border border-green-200">
      <div className="font-semibold text-green-900 mb-2">📊 Example: {title}</div>
      <div className="text-sm text-gray-700 space-y-1">{children}</div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Help & Documentation</h1>
        <p className="text-gray-600">
          Complete guide to understanding calculations, metrics, and roll analysis in your options tracker.
        </p>
      </div>

      <div className="space-y-3">
        {/* Strategy Overview */}
        <AccordionSection id="strategy" title="Strategy Overview" icon="🎯">
          <div className="prose prose-sm max-w-none space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Your Covered Call Strategy</h3>
              <p className="text-gray-700 mb-3">
                This tracker is optimized for a premium collection strategy using covered calls on ETFs with the following characteristics:
              </p>
              <ul className="space-y-2 text-gray-700">
                <li><strong>Target Delta: ~0.2</strong> - Sell out-of-the-money calls with approximately 20% probability of assignment</li>
                <li><strong>No Directional Thesis</strong> - Focus on collecting premium rather than predicting market direction</li>
                <li><strong>Comfortable with Assignment</strong> - Willing to sell shares at strike price if called away</li>
                <li><strong>Premium Focus</strong> - Optimize for consistent income generation through time decay (theta)</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">When to Consider Rolling</h3>
              <p className="text-gray-700 mb-2">
                Rolling (closing current position and opening new one at later date/higher strike) makes sense when:
              </p>
              <ul className="space-y-1 text-gray-700">
                <li>• Stock price has risen toward your strike</li>
                <li>• You can collect net credit (or minimal debit) for the roll</li>
                <li>• New premium exceeds expected theta decay</li>
                <li>• You want to extend time or raise strike price</li>
              </ul>
              <p className="text-gray-700 mt-2">
                <strong>Note:</strong> Since you're comfortable with assignment, paying significant debits to avoid assignment typically doesn't align with your strategy.
              </p>
            </div>
          </div>
        </AccordionSection>

        {/* Core Calculations */}
        <AccordionSection id="calculations" title="Core Calculations Explained" icon="🧮">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Premium & Returns</h3>

            <Formula
              title="Total Premium"
              formula="Premium Per Contract × Quantity × 100"
              description="Each options contract represents 100 shares of stock."
            />

            <Example title="Total Premium">
              <div>Premium: $2.50 per contract, Quantity: 2 contracts</div>
              <div className="font-mono">= $2.50 × 2 × 100 = $500</div>
            </Example>

            <Formula
              title="Net Premium"
              formula="Total Premium − Fees"
              description="Your actual premium received after transaction costs."
            />

            <Formula
              title="Capital at Risk"
              formula="Stock Price × Quantity × 100"
              description="The total value of shares you own (and could be called away)."
            />

            <Example title="Capital at Risk">
              <div>Stock Price: $150, Quantity: 2 contracts (200 shares)</div>
              <div className="font-mono">= $150 × 2 × 100 = $30,000</div>
            </Example>

            <Formula
              title="Return on Capital (ROC)"
              formula="(Net Premium ÷ Capital at Risk) × 100"
              description="Percentage return on the capital tied up in the position."
            />

            <Example title="Return on Capital">
              <div>Net Premium: $500, Capital: $30,000</div>
              <div className="font-mono">= ($500 ÷ $30,000) × 100 = 1.67%</div>
            </Example>

            <Formula
              title="Annualized Yield"
              formula="(Return on Capital ÷ Days Held) × 365"
              description="Projects your return as an annual percentage rate."
            />

            <Example title="Annualized Yield">
              <div>ROC: 1.67%, Held for 30 days</div>
              <div className="font-mono">= (1.67% ÷ 30) × 365 = 20.3% annualized</div>
            </Example>

            <Formula
              title="Rent Per Day"
              formula="Net Premium ÷ Days in Position"
              description="Daily income generated from the position. Useful benchmark for evaluating rolls."
            />

            <Example title="Rent Per Day">
              <div>Net Premium: $500, Position duration: 30 days</div>
              <div className="font-mono">= $500 ÷ 30 = $16.67/day</div>
            </Example>
          </div>
        </AccordionSection>

        {/* Position Metrics */}
        <AccordionSection id="metrics" title="Position Metrics" icon="📊">
          <div className="space-y-4">
            <Formula
              title="Days to Expiration (DTE)"
              formula="Expiration Date − Today"
              description="Number of calendar days until the option expires."
            />

            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Moneyness</div>
              <div className="space-y-2 text-sm">
                <div><strong className="text-green-700">OTM (Out of the Money):</strong> Stock price below strike. Option has no intrinsic value. This is your target state.</div>
                <div><strong className="text-yellow-700">ATM (At the Money):</strong> Stock price within ~1% of strike. Decision point for rolling.</div>
                <div><strong className="text-red-700">ITM (In the Money):</strong> Stock price above strike. Assignment risk high. Consider rolling.</div>
              </div>
            </div>

            <Formula
              title="Intrinsic Value"
              formula="Max(0, Stock Price − Strike Price)"
              description="The amount an option is in-the-money. Zero for OTM options."
            />

            <Example title="Intrinsic Value">
              <div>Stock: $155, Strike: $150 → Intrinsic = Max(0, $155 - $150) = $5</div>
              <div>Stock: $145, Strike: $150 → Intrinsic = Max(0, $145 - $150) = $0</div>
            </Example>

            <Formula
              title="Extrinsic Value (Time Value)"
              formula="Option Price − Intrinsic Value"
              description="The 'time premium' in the option. This is what decays as expiration approaches (theta)."
            />

            <Example title="Extrinsic Value">
              <div>Option Price: $7, Stock: $155, Strike: $150</div>
              <div>Intrinsic: $5 (from previous example)</div>
              <div className="font-mono">Extrinsic = $7 - $5 = $2</div>
              <div className="text-gray-600 mt-1">The $2 represents time value that will decay to $0 by expiration.</div>
            </Example>

            <Formula
              title="Unrealized P&L (Open Positions)"
              formula="Net Premium Received − Current Option Value"
              description="Your current profit/loss. Positive when option price has decreased (good for sellers)."
            />

            <Example title="Unrealized P&L">
              <div>Sold for: $2.50/contract (2 contracts, $500 total after fees)</div>
              <div>Current price: $1.00/contract ($200 to buy back)</div>
              <div className="font-mono">P&L = $500 - $200 = +$300 profit</div>
            </Example>

            <Formula
              title="Extrinsic Buffer"
              formula="Current Option Price − (Stock Price − Strike Price)"
              description="How much extrinsic value cushion you have before assignment risk increases significantly."
            />

            <div className="bg-yellow-50 rounded-md p-4 border border-yellow-200">
              <div className="font-semibold text-yellow-900 mb-2">⚠️ Extrinsic Buffer Indicators</div>
              <div className="space-y-1 text-sm text-gray-700">
                <div><span className="text-red-600">● Red ($0 - $0.50):</span> Very low buffer - high assignment risk</div>
                <div><span className="text-orange-500">● Orange ($0.50 - $2.00):</span> Moderate buffer - watch closely</div>
                <div><span className="text-yellow-500">● Yellow ($2.00 - $5.00):</span> Adequate buffer - normal monitoring</div>
                <div>No indicator: Buffer &gt; $5.00 - comfortable range</div>
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* Roll Analysis */}
        <AccordionSection id="roll" title="Roll Analysis Calculations" icon="🔄">
          <div className="space-y-4">
            <p className="text-gray-700">
              These calculations help you evaluate whether rolling a position (closing current and opening new) makes strategic sense.
            </p>

            <Formula
              title="Roll Net Debit/Credit"
              formula="New Premium − Close Cost − Fees"
              description="Positive = net credit (you receive money). Negative = net debit (you pay money)."
            />

            <Example title="Roll Net Credit">
              <div>Current position close cost: $1.50/contract × 2 × 100 = $300</div>
              <div>New position premium: $3.00/contract × 2 × 100 = $600</div>
              <div>Fees: $2</div>
              <div className="font-mono">Net Credit = $600 - $300 - $2 = +$298</div>
              <div className="text-green-700 font-medium">You receive $298 to roll the position.</div>
            </Example>

            <Example title="Roll Net Debit">
              <div>Current position close cost: $4.00/contract × 2 × 100 = $800</div>
              <div>New position premium: $3.00/contract × 2 × 100 = $600</div>
              <div>Fees: $2</div>
              <div className="font-mono">Net Debit = $600 - $800 - $2 = -$202</div>
              <div className="text-red-700 font-medium">You pay $202 to roll the position.</div>
            </Example>

            <Formula
              title="Roll Break-Even Price"
              formula="New Strike + (Net Debit or Credit ÷ Shares)"
              description="The stock price where you break even on the rolled position."
            />

            <Example title="Break-Even Calculation">
              <div>New Strike: $155, Net Credit: $298, Shares: 200</div>
              <div className="font-mono">= $155 + ($298 ÷ 200) = $155 + $1.49 = $156.49</div>
              <div className="text-gray-600">Stock can rise to $156.49 before you have losses.</div>
            </Example>

            <Formula
              title="Effective Sale Price (Current)"
              formula="Strike + (Net Premium ÷ Shares)"
              description="Your actual sale price per share if assigned on current position."
            />

            <Example title="Current Effective Sale Price">
              <div>Original Strike: $150, Original Net Premium: $500, Shares: 200</div>
              <div className="font-mono">= $150 + ($500 ÷ 200) = $150 + $2.50 = $152.50/share</div>
            </Example>

            <Formula
              title="Effective Sale Price (After Roll)"
              formula="New Strike + (Total Net Premium ÷ Shares)"
              description="Your actual sale price per share if assigned after rolling. Includes original premium + roll credit/debit."
            />

            <Example title="Effective Sale Price After Roll">
              <div>New Strike: $155</div>
              <div>Original Premium: $500, Roll Credit: $298</div>
              <div>Total Premium: $500 + $298 = $798</div>
              <div className="font-mono">= $155 + ($798 ÷ 200) = $155 + $3.99 = $158.99/share</div>
              <div className="text-green-700 font-medium">Price improvement: $158.99 - $152.50 = $6.49/share</div>
            </Example>

            <Formula
              title="Estimated Theta Decay"
              formula="(Current Extrinsic Value ÷ Current DTE) × Additional Days"
              description="Rough estimate of expected time decay for the additional days. Uses linear decay model."
            />

            <Example title="Theta Decay Estimate">
              <div>Current extrinsic value: $2.00, Current DTE: 10 days</div>
              <div>Rolling adds 20 additional days</div>
              <div>Daily theta: $2.00 ÷ 10 = $0.20/day</div>
              <div className="font-mono">Expected decay = $0.20 × 20 = $4.00</div>
              <div className="text-gray-600">You'd expect ~$4.00 time decay over 20 extra days.</div>
            </Example>

            <Formula
              title="Additional Premium Needed"
              formula="Current Rent/Day × Additional Days"
              description="Benchmark premium to maintain your current daily rent rate."
            />

            <Example title="Premium Benchmark">
              <div>Current rent/day: $16.67, Adding 20 days</div>
              <div className="font-mono">Benchmark = $16.67 × 20 = $333.40</div>
              <div className="text-gray-600">Need ~$333 net credit to maintain current rate.</div>
            </Example>
          </div>
        </AccordionSection>

        {/* Roll Decision Framework */}
        <AccordionSection id="decisions" title="Roll Decision Framework" icon="🎲">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Understanding Recommendations</h3>

            <div className="bg-white rounded-md p-4 border border-gray-200 space-y-3">
              <div>
                <div className="font-semibold text-green-800 mb-1">✓ ROLL (Green) - Favorable</div>
                <div className="text-sm text-gray-700">
                  The analysis suggests rolling is attractive. Typically when:
                </div>
                <ul className="text-sm text-gray-600 ml-4 mt-1 space-y-1">
                  <li>• You receive net credit (or minimal debit)</li>
                  <li>• Credit exceeds expected theta decay</li>
                  <li>• Effective sale price improves</li>
                  <li>• Premium meets or beats your rent rate benchmark</li>
                </ul>
              </div>

              <div>
                <div className="font-semibold text-red-800 mb-1">⚠ HOLD (Red) - Unfavorable</div>
                <div className="text-sm text-gray-700">
                  The analysis suggests avoiding the roll. Typically when:
                </div>
                <ul className="text-sm text-gray-600 ml-4 mt-1 space-y-1">
                  <li>• You pay significant net debit to avoid assignment</li>
                  <li>• Credit is well below expected theta</li>
                  <li>• Effective sale price decreases</li>
                  <li>• Better to close position or accept assignment</li>
                </ul>
              </div>

              <div>
                <div className="font-semibold text-yellow-800 mb-1">⚡ NEUTRAL (Yellow) - Close Call</div>
                <div className="text-sm text-gray-700">
                  The analysis is mixed. Consider:
                </div>
                <ul className="text-sm text-gray-600 ml-4 mt-1 space-y-1">
                  <li>• Your current market outlook</li>
                  <li>• Whether you want to keep the shares</li>
                  <li>• Transaction costs vs benefits</li>
                  <li>• Your available time to manage the position</li>
                </ul>
              </div>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mt-6">Recommendation Factors</h3>

            <div className="space-y-3">
              <div className="bg-red-50 p-3 rounded border border-red-200">
                <div className="font-semibold text-red-800 text-sm">⚠ Net Debit Roll</div>
                <div className="text-sm text-gray-700 mt-1">
                  Paying to avoid assignment doesn't align with your strategy of being comfortable with assignment. Typically not recommended unless you have strong conviction about further upside.
                </div>
              </div>

              <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                <div className="font-semibold text-yellow-800 text-sm">⚡ Below Expected Theta</div>
                <div className="text-sm text-gray-700 mt-1">
                  If roll credit is less than expected theta decay, you're getting less than you'd naturally earn from time decay. May still be worth it for strategic reasons.
                </div>
              </div>

              <div className="bg-green-50 p-3 rounded border border-green-200">
                <div className="font-semibold text-green-800 text-sm">✓ Above Expected Theta</div>
                <div className="text-sm text-gray-700 mt-1">
                  Roll credit exceeds estimated theta decay - you're being paid more than the expected time decay. Generally favorable.
                </div>
              </div>

              <div className="bg-green-50 p-3 rounded border border-green-200">
                <div className="font-semibold text-green-800 text-sm">✓ Improved Sale Price</div>
                <div className="text-sm text-gray-700 mt-1">
                  Rolling increases your effective sale price per share if assigned. You'll make more money on the stock sale.
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded border border-blue-200">
                <div className="font-semibold text-blue-800 text-sm">ℹ Higher Assignment Risk</div>
                <div className="text-sm text-gray-700 mt-1">
                  New delta &gt; 0.3 indicates higher probability of assignment. Not necessarily bad since you're comfortable with assignment, but be aware.
                </div>
              </div>

              <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                <div className="font-semibold text-yellow-800 text-sm">⚡ Short Time Extension</div>
                <div className="text-sm text-gray-700 mt-1">
                  Adding fewer than 7 days may not justify transaction costs. Consider whether the premium is worth the effort.
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded border border-blue-200">
                <div className="font-semibold text-blue-800 text-sm">ℹ Profit Available</div>
                <div className="text-sm text-gray-700 mt-1">
                  You have unrealized profit you could lock in by closing now. Rolling extends the position instead of banking the gain.
                </div>
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* Glossary */}
        <AccordionSection id="glossary" title="Options Glossary" icon="📖">
          <div className="space-y-3">
            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">Covered Call</div>
              <div className="text-sm text-gray-700">
                Selling a call option while owning the underlying stock. You collect premium in exchange for agreeing to sell your shares at the strike price if assigned.
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">Strike Price</div>
              <div className="text-sm text-gray-700">
                The price at which your shares can be called away (bought from you). You keep all premium regardless of assignment.
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">Premium</div>
              <div className="text-sm text-gray-700">
                The income you receive for selling the option. You keep this money regardless of what happens.
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">Assignment</div>
              <div className="text-sm text-gray-700">
                When the option buyer exercises their right to buy your shares at the strike price. You must sell your shares but keep all premium collected.
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">Delta (Δ)</div>
              <div className="text-sm text-gray-700">
                Probability of the option expiring in-the-money. Delta of 0.2 means roughly 20% chance of assignment. Also represents how much the option price changes per $1 stock move.
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">Theta (Θ)</div>
              <div className="text-sm text-gray-700">
                Time decay - how much value the option loses per day as expiration approaches. Positive for option sellers (you profit from decay).
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">Intrinsic Value</div>
              <div className="text-sm text-gray-700">
                The amount an option is in-the-money. For calls: Max(0, Stock Price - Strike Price). This value will be realized if assigned.
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">Extrinsic Value (Time Value)</div>
              <div className="text-sm text-gray-700">
                The "time premium" in the option price above intrinsic value. This decays to zero by expiration. This is what you profit from as an option seller.
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">DTE (Days to Expiration)</div>
              <div className="text-sm text-gray-700">
                Calendar days remaining until the option expires. Shorter DTE means faster theta decay.
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">Rolling</div>
              <div className="text-sm text-gray-700">
                Closing your current option position and simultaneously opening a new one at a different strike and/or expiration. Common when stock approaches your strike and you want to extend the position.
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">ITM / ATM / OTM</div>
              <div className="text-sm text-gray-700">
                <strong>In-the-Money (ITM):</strong> Stock price above strike (for calls). High assignment risk.<br/>
                <strong>At-the-Money (ATM):</strong> Stock price near strike (within ~1%).<br/>
                <strong>Out-of-the-Money (OTM):</strong> Stock price below strike (for calls). Target state for covered calls.
              </div>
            </div>

            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="font-semibold text-gray-900">Contract</div>
              <div className="text-sm text-gray-700">
                One options contract represents 100 shares of stock. If you own 200 shares, you can sell 2 contracts.
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* Complete Example */}
        <AccordionSection id="example" title="Complete Example Walkthrough" icon="🎓">
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">Scenario: Opening a Covered Call Position</h3>

              <div className="space-y-3 text-sm">
                <div className="bg-white p-3 rounded">
                  <div className="font-semibold text-gray-900 mb-2">Initial Position</div>
                  <div className="space-y-1 text-gray-700">
                    <div>• You own 200 shares of SPY trading at $450/share</div>
                    <div>• You sell 2 contracts of the 30-day $460 call</div>
                    <div>• Premium: $2.50 per contract</div>
                    <div>• Fees: $2.00</div>
                    <div>• Delta: ~0.20 (20% assignment probability)</div>
                  </div>
                </div>

                <div className="bg-white p-3 rounded">
                  <div className="font-semibold text-gray-900 mb-2">Calculations</div>
                  <div className="space-y-1 font-mono text-xs text-gray-700">
                    <div>Total Premium = $2.50 × 2 × 100 = $500</div>
                    <div>Net Premium = $500 - $2 = $498</div>
                    <div>Capital at Risk = $450 × 200 = $90,000</div>
                    <div>Return on Capital = ($498 ÷ $90,000) × 100 = 0.55%</div>
                    <div>Annualized Yield = (0.55% ÷ 30) × 365 = 6.7%</div>
                    <div>Rent Per Day = $498 ÷ 30 = $16.60/day</div>
                    <div>Effective Sale Price = $460 + ($498 ÷ 200) = $462.49/share</div>
                  </div>
                </div>

                <div className="bg-white p-3 rounded">
                  <div className="font-semibold text-gray-900 mb-2">What This Means</div>
                  <div className="space-y-1 text-gray-700">
                    <div>• You earned $498 income immediately</div>
                    <div>• If SPY stays below $460, you keep shares + premium</div>
                    <div>• If assigned, you sell at $462.49 effective price (gain of $12.49/share = $2,498)</div>
                    <div>• You're earning $16.60/day in "rent" on your shares</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200 mt-4">
              <h3 className="text-lg font-semibold text-green-900 mb-3">Later: Roll Analysis Scenario</h3>

              <div className="space-y-3 text-sm">
                <div className="bg-white p-3 rounded">
                  <div className="font-semibold text-gray-900 mb-2">Situation (15 Days Later)</div>
                  <div className="space-y-1 text-gray-700">
                    <div>• SPY has risen to $458 (getting close to $460 strike)</div>
                    <div>• 15 DTE remaining on current position</div>
                    <div>• Current option price: $1.50 (unrealized P&L: $498 - $300 = $198 profit)</div>
                    <div>• Considering roll to 45-day $465 call for $3.20 premium</div>
                  </div>
                </div>

                <div className="bg-white p-3 rounded">
                  <div className="font-semibold text-gray-900 mb-2">Roll Analysis</div>
                  <div className="space-y-1 font-mono text-xs text-gray-700">
                    <div>Close Cost = $1.50 × 2 × 100 = $300</div>
                    <div>New Premium = $3.20 × 2 × 100 = $640</div>
                    <div>Net Credit = $640 - $300 - $2 = $338 ✓</div>
                    <div>Additional Days = 45 - 15 = 30 days</div>
                    <div>Expected Theta = ($1.50 ÷ 15) × 30 = $3.00 per contract = $300</div>
                    <div>New Effective Sale = $465 + (($498 + $338) ÷ 200) = $469.18</div>
                    <div>Price Improvement = $469.18 - $462.49 = $6.69/share ✓</div>
                  </div>
                </div>

                <div className="bg-white p-3 rounded">
                  <div className="font-semibold text-gray-900 mb-2">Recommendation: ROLL (Green)</div>
                  <div className="space-y-1 text-gray-700">
                    <div>✓ Receiving $338 net credit (not paying to roll)</div>
                    <div>✓ Credit of $338 exceeds expected theta decay of $300</div>
                    <div>✓ Effective sale price improves by $6.69/share</div>
                    <div>✓ Extends position 30 days while maintaining good premium rate</div>
                    <div className="text-green-700 font-medium mt-2">This roll aligns with your strategy.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AccordionSection>
      </div>

      <div className="mt-8 p-4 bg-gray-100 rounded-lg text-sm text-gray-600">
        <p>
          💡 <strong>Tip:</strong> Bookmark this page for quick reference. All calculations in your tracker follow these formulas.
        </p>
      </div>
    </div>
  )
}

export default Documentation

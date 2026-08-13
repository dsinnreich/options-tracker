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
          Complete guide to understanding calculations, metrics, roll analysis, and portfolio tracking.
        </p>
      </div>

      {/* About This App */}
      <div className="mt-6 mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">About This App</h2>
      </div>

      <div className="space-y-3">
        <AccordionSection id="about" title="About This App" icon="⚙️">
          <div className="prose prose-sm max-w-none space-y-4 text-gray-700">
            <p>
              This app is a custom full-stack web application built specifically for tracking covered call positions and monitoring portfolio allocation. It runs entirely within your own Railway cloud account, meaning your data stays private and is never shared with any third-party service. The app is accessible from any browser and requires a login to use.
            </p>

            <p>
              The <strong>backend</strong> is built with <strong>Node.js</strong> and the <strong>Express</strong> framework. It handles all data storage, authentication, and API requests. Data is stored in a <strong>SQLite</strong> database — a lightweight file-based database that lives on a persistent volume in Railway, so your data survives deployments and restarts. The backend exposes a REST API that the frontend calls for all reads and writes. Authentication uses server-side sessions with secure, HTTP-only cookies.
            </p>

            <p>
              The <strong>frontend</strong> is a single-page application built with <strong>React</strong> and bundled with <strong>Vite</strong>. Navigation between pages (Dashboard, Portfolio, Help, etc.) is handled client-side by <strong>React Router</strong> — the page never fully reloads when you move between sections. Styling uses <strong>Tailwind CSS</strong>, a utility-first CSS framework that makes it easy to build responsive layouts directly in the component markup. Market data (live stock and option prices) is fetched from the <strong>marketdata.app</strong> API on demand.
            </p>

            <p>
              The database schema is managed through a versioned <strong>migration system</strong> built into the app startup. Each time the server starts, it checks the current schema version and applies any pending migrations in order. This allows the app to be updated safely without losing existing data. The current schema includes tables for users, positions, portfolio definitions, portfolio imports, individual holdings, asset class mappings, and target allocations.
            </p>

            <p>
              The source code is version-controlled with <strong>Git</strong> and hosted on <strong>GitHub</strong>. Deployments are triggered manually from the <strong>Railway</strong> dashboard by deploying the latest GitHub commit. Local development runs on <strong>http://localhost:5173</strong> using <code className="bg-gray-100 px-1 rounded text-xs">npm run dev</code>, which starts both the Express server and the Vite dev server concurrently.
            </p>
          </div>
        </AccordionSection>

        <AccordionSection id="backup" title="Data Backup & Recovery" icon="🔒">
          <div className="prose prose-sm max-w-none space-y-4 text-gray-700">
            <p>
              All your data — options positions, portfolio holdings, transaction history, ETF research, and asset class mappings — lives in a SQLite database on Railway's persistent volume. The Backup section in the <strong>Admin</strong> tab lets you download a copy and restore it if anything goes wrong.
            </p>

            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Weekly Backup Routine (recommended)</div>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal ml-4">
                <li>Go to <strong>Admin → Data Backup</strong></li>
                <li>Click <strong>Export Full JSON</strong> — saves a <code className="bg-gray-100 px-1 rounded text-xs">tracker-backup-YYYY-MM-DD.json</code> file to your Downloads</li>
                <li>Move it to a safe folder (e.g. iCloud, Google Drive, or an external drive)</li>
                <li>Keep the last 2–4 backups in case a recent one is corrupt</li>
              </ol>
              <p className="text-sm text-gray-600 mt-2">
                <strong>Download .db File</strong> saves the raw SQLite database — useful as a "gold standard" archive you can open in any SQLite browser (e.g. <em>DB Browser for SQLite</em>) to inspect your data directly.
              </p>
            </div>

            <div className="bg-red-50 rounded-md p-4 border border-red-200">
              <div className="font-semibold text-red-900 mb-2">🚨 Disaster Recovery — Full Database Loss</div>
              <p className="text-sm text-gray-700 mb-3">
                Use this procedure if Railway loses the database, or if you need to wipe and start fresh (e.g. ransomware). You'll need your most recent JSON backup file.
              </p>
              <ol className="text-sm text-gray-700 space-y-2 list-decimal ml-4">
                <li>
                  <strong>Log in to Railway</strong> and verify the app is running. If the database was completely wiped, the app will auto-create a fresh empty database on startup.
                </li>
                <li>
                  <strong>Create your admin account</strong> — if you're starting from scratch, use the app's first-run flow or the Railway console to create a new account with your usual email address. <em>The email address must match what was in your backup.</em>
                </li>
                <li>
                  <strong>Go to Admin → Data Backup → Restore from JSON Backup</strong>
                </li>
                <li>
                  Click <strong>Choose JSON file</strong> and select your most recent <code className="bg-gray-100 px-1 rounded text-xs">tracker-backup-*.json</code>
                </li>
                <li>
                  Click <strong>Restore…</strong> then confirm with <strong>Yes, restore now</strong>
                </li>
                <li>
                  The app will match your account by email, remap all data to your new user ID automatically, and re-insert everything. A summary shows how many rows were restored.
                </li>
                <li>
                  Refresh the app — all portfolios, positions, history, and ETF data will be back exactly as they were.
                </li>
              </ol>
            </div>

            <div className="bg-yellow-50 rounded-md p-4 border border-yellow-200">
              <div className="font-semibold text-yellow-900 mb-1">⚠️ Important notes</div>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• <strong>Restore is destructive</strong> — it wipes all current data before importing. Download a fresh backup first if you have any data you want to keep.</li>
                <li>• <strong>Email must match</strong> — your account email at restore time must match the email stored in the backup. If you change your email, update it before backing up.</li>
                <li>• <strong>User accounts are not wiped</strong> — existing login accounts are preserved and matched by email. Only positions, portfolios, history, and research data are replaced.</li>
                <li>• <strong>JSON only for restore</strong> — the <code className="bg-gray-100 px-1 rounded text-xs">.db</code> file is for archiving and inspection, not for in-app restore.</li>
              </ul>
            </div>
          </div>
        </AccordionSection>

      </div>

      {/* Portfolio Tracker */}
      <div className="mt-10 mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Portfolio Tracker</h2>
        <p className="text-gray-600">Guide to importing holdings, reading the allocation table, and managing your asset class map.</p>
      </div>

      <div className="space-y-3">
        {/* Portfolio Overview */}
        <AccordionSection id="portfolio-overview" title="Portfolio Overview" icon="🗂️">
          <div className="prose prose-sm max-w-none space-y-4">
            <p className="text-gray-700">
              The Portfolio tab lets you track your overall asset allocation across one or more Fidelity brokerage accounts. You import a CSV export from Fidelity, and the app organizes your holdings into a hierarchical view by <strong>Asset Class → Style → Individual Holdings</strong>.
            </p>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Key Concepts</h3>
              <ul className="space-y-2 text-gray-700">
                <li><strong>Portfolio</strong> — A named group of accounts (e.g., "Retirement", "Taxable"). You can have up to ~5 portfolios, each with its own import history, asset class map, and target allocations.</li>
                <li><strong>Import</strong> — A snapshot of your holdings on a given date, loaded from a Fidelity CSV file. Each import is stored separately, so you can look back at historical snapshots.</li>
                <li><strong>Asset Class Map</strong> — A table you maintain that assigns each ticker symbol to an Asset Class (e.g., Equity) and Style (e.g., Core). This drives all grouping in the pivot table.</li>
                <li><strong>Target Allocation</strong> — Your desired percentage for each Style. You set these per portfolio and use What-If mode to model changes.</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Navigation</h3>
              <p className="text-gray-700 mb-2">Each portfolio has three sub-tabs:</p>
              <ul className="space-y-1 text-gray-700">
                <li>• <strong>Overview</strong> — The allocation pivot table. Use the date dropdown to view different import snapshots.</li>
                <li>• <strong>Asset Class Map</strong> — Assign tickers to asset classes and styles. Required for the pivot table to categorize holdings.</li>
                <li>• <strong>Import</strong> — Upload a new Fidelity CSV and view import history.</li>
              </ul>
            </div>
          </div>
        </AccordionSection>

        {/* Importing from Fidelity */}
        <AccordionSection id="portfolio-import" title="Importing from Fidelity" icon="📥">
          <div className="space-y-4">
            <p className="text-gray-700">
              The Portfolio tracker reads the standard CSV export from Fidelity's portfolio view. Here's how to get it and use it.
            </p>
            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Step 1 — Export from Fidelity</div>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal ml-4">
                <li>Log in to Fidelity and go to your Portfolio page</li>
                <li>Select the account(s) you want to include</li>
                <li>Click <strong>Download</strong> (CSV format)</li>
                <li>Save the file to your computer</li>
              </ol>
            </div>
            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Step 2 — Import into the app</div>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal ml-4">
                <li>Go to the <strong>Portfolio</strong> tab and select your portfolio</li>
                <li>Click the <strong>Import</strong> sub-tab</li>
                <li>Click <strong>Choose File</strong> and select your Fidelity CSV</li>
                <li>Click <strong>Import</strong></li>
              </ol>
              <p className="text-sm text-gray-600 mt-2">The import is dated automatically. If you import again on the same date, it replaces that day's snapshot.</p>
            </div>
            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Import History</div>
              <p className="text-sm text-gray-700">
                Every import is saved as a dated snapshot. In the Overview tab, use the date dropdown at the top to switch between snapshots and see how your allocation looked on any past date. You can delete an import from the Import tab if needed.
              </p>
            </div>
            <div className="bg-blue-50 rounded-md p-4 border border-blue-200">
              <div className="font-semibold text-blue-900 mb-1">ℹ️ What gets imported</div>
              <div className="text-sm text-gray-700 space-y-1">
                <div>• All positions with a current value are imported, including money market funds and pending activity</div>
                <div>• Symbols like <strong>FDRXX</strong>, <strong>SPAXX</strong>, <strong>CORE</strong>, <strong>FDIC</strong>, and <strong>PENDING ACTIVITY</strong> are automatically classified as Liquidity / Cash — no mapping needed</div>
                <div>• All other symbols need an entry in your Asset Class Map to appear correctly in the pivot table</div>
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* Reading the Pivot Table */}
        <AccordionSection id="portfolio-pivot" title="Reading the Pivot Table" icon="📊">
          <div className="space-y-4">
            <p className="text-gray-700">
              The Overview tab shows a hierarchical allocation table. Rows are grouped by Asset Class, then Style, then individual holdings. Click any Asset Class or Style row to expand or collapse that group.
            </p>
            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-3">Column Reference</div>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-4 gap-2 font-semibold text-gray-600 border-b pb-1">
                  <div>Column</div><div className="col-span-3">What it means</div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-gray-700">
                  <div className="font-medium">Name</div>
                  <div className="col-span-3">Ticker symbol and description of the holding, style, or asset class</div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-gray-700">
                  <div className="font-medium">Current Value</div>
                  <div className="col-span-3">Dollar value from the imported Fidelity CSV</div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-gray-700">
                  <div className="font-medium">Current %</div>
                  <div className="col-span-3">This row's value as a percentage of your total portfolio</div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-gray-700">
                  <div className="font-medium">Target %</div>
                  <div className="col-span-3">Your desired allocation for this Style (set in What-If mode)</div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-gray-700">
                  <div className="font-medium">Target $</div>
                  <div className="col-span-3">Dollar amount you'd need to match your target percentage</div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-gray-700">
                  <div className="font-medium">$ Diff</div>
                  <div className="col-span-3">Difference between Current Value and Target $. <span className="text-red-600">Red = under target</span>, <span className="text-green-700">green = over target</span></div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-gray-700">
                  <div className="font-medium">% Diff</div>
                  <div className="col-span-3">Difference between Current % and Target % (same color coding)</div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">What-If Mode</div>
              <p className="text-sm text-gray-700 mb-2">
                Use What-If mode to model target allocation changes before committing them.
              </p>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal ml-4">
                <li>Click <strong>Edit Targets (What-If)</strong></li>
                <li>Edit the <strong>Target %</strong> fields on any Style row</li>
                <li>Watch the $ Diff and % Diff columns update in real time</li>
                <li>The total at the top must equal <strong>100%</strong> to save</li>
                <li>Click <strong>Save Targets</strong> to persist, or <strong>Cancel</strong> to discard</li>
              </ol>
            </div>
            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Resizing Columns</div>
              <p className="text-sm text-gray-700">
                Drag the divider at the right edge of any column header to resize it. Column widths are saved automatically and will persist the next time you visit.
              </p>
            </div>
          </div>
        </AccordionSection>

        {/* Asset Class Map */}
        <AccordionSection id="portfolio-map" title="Asset Class Map" icon="🗺️">
          <div className="space-y-4">
            <p className="text-gray-700">
              The Asset Class Map tells the app how to categorize each ticker symbol. Without a mapping, a holding appears as "Unmapped" in the pivot table. You only need to map each symbol once — future imports will use the same map automatically.
            </p>
            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Adding a New Mapping</div>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal ml-4">
                <li>Go to the <strong>Asset Class Map</strong> sub-tab</li>
                <li>If there are unmapped symbols from your latest import, they'll appear in an <span className="text-orange-600 font-medium">orange alert</span> at the top — click one to pre-fill the form</li>
                <li>Enter the <strong>Symbol</strong> (e.g., IVV), optional <strong>Investment Name</strong>, <strong>Asset Class</strong>, and <strong>Style</strong></li>
                <li>Asset Class and Style fields offer autocomplete suggestions based on your existing mappings — type to filter</li>
                <li>Click <strong>Add</strong> to save</li>
              </ol>
            </div>
            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Editing and Deleting Mappings</div>
              <p className="text-sm text-gray-700">
                Each row in the map table has <strong>Edit</strong> and <strong>Delete</strong> buttons. Click Edit to change the Investment Name, Asset Class, or Style inline, then Save to confirm.
              </p>
            </div>
            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Export &amp; Import the Map</div>
              <p className="text-sm text-gray-700 mb-2">
                You can export your entire map as a JSON file — useful as a backup or to copy your mappings to another device.
              </p>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• <strong>Export Map</strong> — Downloads a JSON file with all your current mappings</li>
                <li>• <strong>Import Map</strong> — Loads a previously exported JSON file. New symbols are added; existing symbols are updated. Symbols not in the file are left unchanged.</li>
              </ul>
            </div>
            <div className="bg-yellow-50 rounded-md p-4 border border-yellow-200">
              <div className="font-semibold text-yellow-900 mb-1">💡 Tip: Build your map once</div>
              <div className="text-sm text-gray-700">
                After your first import, go through the orange unmapped-symbols alert and add each one. After that, future imports from the same accounts will be fully categorized automatically — you'll only need to add mappings when you buy a new holding.
              </div>
            </div>
            <div className="bg-blue-50 rounded-md p-4 border border-blue-200">
              <div className="font-semibold text-blue-900 mb-1">ℹ️ Auto-classified symbols</div>
              <div className="text-sm text-gray-700">
                These symbols are always classified as <strong>Liquidity / Cash</strong> without needing a map entry: FDRXX, SPAXX, CORE, FDIC, PENDING ACTIVITY.
              </div>
            </div>
          </div>
        </AccordionSection>

        {/* Portfolio Risk & Return */}
        <AccordionSection id="portfolio-risk" title="Portfolio Risk & Return (Analysis Tab)" icon="📈">
          <div className="space-y-4">
            <p className="text-gray-700">
              The Analysis tab shows your portfolio's overall Std Dev and Sharpe Ratio, and lets you
              model a What-If reallocation to see how those metrics would change.
            </p>

            <Formula
              title="Portfolio Standard Deviation"
              formula="σₚ = √( Σᵢ Σⱼ wᵢ wⱼ σᵢ σⱼ ρᵢⱼ )"
              description="Not a weighted average of holding standard deviations — that shortcut only holds if every pairwise correlation were 1.0 (zero diversification benefit), and it overstates risk. The real formula needs every pairwise correlation ρᵢⱼ between holdings, which is why this app fetches a correlation matrix rather than just averaging."
            />
            <Formula
              title="Sharpe Ratio"
              formula="Sharpe = (Return − Risk-Free Rate) ÷ σₚ"
              description="Return is the value-weighted 3Y return across holdings. Risk-Free Rate is the field you set at the top of the panel."
            />

            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Where the numbers come from</div>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• <strong>σ (Std Dev)</strong> and <strong>Return</strong> per holding — Morningstar's trailing 3-year figures, from the research watchlist selected at the top of the tab</li>
                <li>• <strong>ρ (correlation)</strong> between holdings — computed from 1 year of daily price history where available; falls back per-pair to a single-factor S&amp;P 500 proxy (based on downside capture ratio) for any pair missing price history</li>
                <li>• <strong>Cash &amp; Liquidity</strong> holdings are treated as risk-free: zero volatility, earning the risk-free rate</li>
              </ul>
            </div>

            <div className="bg-amber-50 rounded-md p-4 border border-amber-200">
              <div className="font-semibold text-amber-900 mb-1">⚠️ These are ex-post (historical) figures, not a forecast</div>
              <div className="text-sm text-gray-700">
                Every input — the 3Y std dev, the 3Y return, and the 1-year price correlations — is a
                trailing, realized statistic. Nothing here is modeled or forecasted. The What-If tool
                answers <em>"what would my risk and return have been at these weights, over this
                trailing window?"</em> — not <em>"what will they be going forward."</em> A large regime
                shift (rate cycle, market correction) can make trailing figures a poor guide to what's
                ahead. Use <strong>Capital Market Assumptions</strong> (below) to replace the return
                estimates with your own forward-looking numbers.
              </div>
            </div>

            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Capital Market Assumptions</div>
              <p className="text-sm text-gray-700 mb-2">
                Expand <strong>Capital Market Assumptions</strong> to set your own expected annual
                return for each asset class · style bucket. Type a number to override; leave the box
                empty to keep using the trailing 3Y figure, shown to the left of each input. Your
                assumptions feed the metric tiles, the table subtotals and the efficient frontier.
              </p>
              <p className="text-sm text-gray-700 mb-2">
                They are saved to <strong>your account</strong>, not just this browser, so they
                survive clearing your cache and follow you to any device you log in from. One set
                applies to <strong>all your portfolios</strong> — a view on how an asset class will
                perform doesn't depend on which account holds it, so your assumptions can't drift
                out of sync between accounts.
              </p>
              <ul className="text-sm text-gray-700 space-y-1 mb-2">
                <li>• <strong>Fill from trailing</strong> — pre-populates every box with the trailing figure, as a starting point to edit down</li>
                <li>• <strong>Clear all</strong> — removes every override and returns to trailing</li>
              </ul>
              <div className="text-sm text-gray-700">
                <strong>Only returns are overridable</strong>, and that asymmetry is deliberate.
                Volatility and correlation are reasonably estimable from a few years of history;
                average returns are not — the standard error is enormous over any window you'd
                actually have. Mean-variance optimization is also most sensitive to precisely that
                weakest input: it overweights whatever looks highest-returning, which is
                disproportionately whatever got lucky. Keeping σ and ρ measured while returns become
                a stated assumption puts the unreliable input under your control.
              </div>
            </div>

            <div className="bg-green-50 rounded-md p-4 border border-green-200">
              <div className="font-semibold text-green-900 mb-1">📊 Why this matters</div>
              <div className="text-sm text-gray-700">
                On a real portfolio, the trailing-3Y frontier showed a best-Sharpe portfolio of
                <strong> 2.17</strong> — roughly four times a realistic long-run equity Sharpe.
                Substituting sober long-run return assumptions (7–8% equity, 3.5% muni) dropped it
                to <strong>0.28</strong>, while the standard deviation didn't move at all. Same risk
                model, same correlations — the entire difference came from the return estimates.
                That gap is the size of the trap this feature exists to avoid.
              </div>
            </div>

            <div className="bg-white rounded-md p-4 border border-gray-200">
              <div className="font-semibold text-gray-900 mb-2">Using What-If Weights</div>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal ml-4">
                <li>Click <strong>What-If Weights</strong></li>
                <li>Edit the target percentage for any Asset Class · Style bucket — holdings within a bucket keep their current relative mix, so only the blend across buckets changes</li>
                <li>The total must equal <strong>100%</strong></li>
                <li>The Std Dev, Sharpe, and Return tiles show current → proposed, with the change highlighted green when it's an improvement</li>
                <li>Click <strong>Reset</strong> to return targets to current weights, or <strong>Exit What-If</strong> to leave the editor</li>
              </ol>
              <p className="text-sm text-gray-600 mt-2">
                This is a separate, unsaved what-if from the Target % editor on the By Asset Class
                tab — exiting here doesn't affect your saved targets there.
              </p>
            </div>

            <div className="bg-blue-50 rounded-md p-4 border border-blue-200">
              <div className="font-semibold text-blue-900 mb-1">ℹ️ Coverage warnings</div>
              <div className="text-sm text-gray-700">
                If a holding is missing from the calculation, an amber note explains why — and the two
                causes need different fixes. <strong>"No row in the [watchlist] watchlist"</strong> means
                that ticker isn't in the research watchlist currently selected at the top of the tab;
                switch watchlists or add the symbol to it. <strong>"In the watchlist but missing Std Dev
                or 3Y Return"</strong> means the ticker has a research row, but Morningstar didn't report
                those fields (common for very new funds without 3 years of history).
              </div>
            </div>
          </div>
        </AccordionSection>
      </div>

      {/* Options Tracker */}
      <div className="mt-10 mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Options Tracker</h2>
        <p className="text-gray-600">Guide to covered call strategy, calculations, metrics, and roll analysis.</p>
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

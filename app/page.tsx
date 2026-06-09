'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { supabase, formatNaira, formatMonthShort, formatMonth, PARTY_COLORS, AVATAR_COLORS, getInitials } from '@/lib/supabase'
import type { State, StateAllocation } from '@/lib/supabase'

const MONTHS = [
  '2025-01-01','2025-02-01','2025-03-01','2025-04-01','2025-05-01',
  '2025-06-01','2025-07-01','2025-08-01','2025-09-01','2025-10-01',
  '2025-11-01','2025-12-01','2026-01-01','2026-02-01','2026-03-01',
  '2026-04-01','2026-05-01',
]

const AI_SUGGESTIONS = [
  'Which state got the most in 2025?',
  'How much did Lagos get?',
  'What is FAAC?',
  'Show me South West allocations',
]

export default function HomePage() {
  const [states, setStates] = useState<State[]>([])
  const [allocations, setAllocations] = useState<StateAllocation[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<'light'|'dark'>('light')
  const [showAI, setShowAI] = useState(false)
  const [aiMessages, setAiMessages] = useState([
    { role: 'bot', text: '👋 Hi! I can help you understand FAAC allocations and find data about any state or LGA. What would you like to know?' }
  ])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: statesData }, { data: allocData }] = await Promise.all([
        supabase.from('states').select('*').order('name'),
        supabase.from('state_allocations').select('*').gte('allocation_month','2025-01-01').order('allocation_month', { ascending: false })
      ])
      setStates(statesData || [])
      setAllocations(allocData || [])
      if (allocData && allocData.length > 0) {
        setSelectedMonth(allocData[0].allocation_month)
      } else {
        setSelectedMonth('2025-01-01')
      }
      setLoading(false)
    }
    load()
  }, [])

  const allocMap = useMemo(() => {
    const m: Record<number, StateAllocation> = {}
    allocations.filter(a => a.allocation_month === selectedMonth).forEach(a => { m[a.state_id] = a })
    return m
  }, [allocations, selectedMonth])

  const maxAlloc = useMemo(() => Math.max(...Object.values(allocMap).map(a => a.total_allocation || 0), 1), [allocMap])
  const totalMonth = useMemo(() => Object.values(allocMap).reduce((s, a) => s + (a.total_allocation || 0), 0), [allocMap])
  const monthsWithData = useMemo(() => new Set(allocations.map(a => a.allocation_month)), [allocations])

  const filtered = useMemo(() => states.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.governor?.toLowerCase().includes(search.toLowerCase()) ||
    s.geopolitical_zone?.toLowerCase().includes(search.toLowerCase())
  ), [states, search])

  const handleAI = useCallback(async (msg: string) => {
    if (!msg.trim()) return
    setAiMessages(m => [...m, { role: 'user', text: msg }])
    setAiInput('')
    setAiLoading(true)
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: `You are a civic assistant for NaijaTrack, a Nigerian government transparency platform. 
          You help Nigerians understand FAAC (Federal Account Allocation Committee) data — how much money states and LGAs receive from the Federal Government monthly.
          Keep responses concise (2-3 sentences max), factual, and helpful. Speak in plain English.
          Current data: ${states.length} states tracked, ${allocations.length} monthly records.
          Latest month: ${selectedMonth ? formatMonth(selectedMonth) : 'unknown'}.
          Total distributed latest month: ${formatNaira(totalMonth)}.`,
          messages: [{ role: 'user', content: msg }]
        })
      })
      const data = await resp.json()
      const text = data.content?.[0]?.text || "I couldn't find that info right now. Try searching for a specific state."
      setAiMessages(m => [...m, { role: 'bot', text }])
    } catch {
      setAiMessages(m => [...m, { role: 'bot', text: "Sorry, I'm having trouble connecting. Try again in a moment." }])
    }
    setAiLoading(false)
  }, [states, allocations, selectedMonth, totalMonth])

  return (
    <main>
      {/* NAV */}
      <nav className="nav">
        <Link href="/" className="nav-logo">Naija<span className="dot">Track</span></Link>
        <div className="nav-links">
          <span className="nav-badge">Live Data</span>
          <button className="theme-btn" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} title="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-glow" />
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="pulse" />
            Live FAAC Data · Updated Monthly
          </div>
          <h1 className="display">
            Track Every Naira Sent To<br />
            <em>Your State & LGA</em>
          </h1>
          <p className="hero-sub">
            Federal Government shares revenue every month. See exactly how much each governor and local government received — transparently, with real data.
          </p>
          <div className="search-box">
            <span style={{color:'rgba(255,255,255,0.35)',fontSize:18}}>🔍</span>
            <input
              type="search"
              placeholder="Search state, governor, or zone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button className="search-btn">Search</button>
          </div>
          {!loading && (
            <div className="hero-stats">
              <div className="hstat">
                <span className="hstat-num"><span>₦</span>{(totalMonth/1e9).toFixed(1)}<span>B</span></span>
                <span className="hstat-label">Shared {selectedMonth ? new Date(selectedMonth).toLocaleDateString('en-NG',{month:'short',year:'numeric'}) : ''}</span>
              </div>
              <div className="hstat">
                <span className="hstat-num">{states.length}</span>
                <span className="hstat-label">States + FCT</span>
              </div>
              <div className="hstat">
                <span className="hstat-num">774</span>
                <span className="hstat-label">LGAs Tracked</span>
              </div>
              <div className="hstat">
                <span className="hstat-num">{allocations.length}</span>
                <span className="hstat-label">Monthly Records</span>
              </div>
            </div>
          )}
          <div className="trust-row" style={{justifyContent:'center'}}>
            <div className="trust-badge">✓ OAGF Verified</div>
            <div className="trust-badge">✓ RMAFC Data</div>
            <div className="trust-badge">✓ Auto-Updated</div>
          </div>
        </div>
      </section>

      {/* ALLOCATIONS SECTION */}
      <section className="section" style={{background:'var(--off-white)'}}>
        <div className="container">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:24,flexWrap:'wrap',gap:16}}>
            <div>
              <div className="section-label">Federal Allocations</div>
              <h2 className="section-title">State-by-State Breakdown</h2>
              {selectedMonth && <p className="section-sub">{formatMonth(selectedMonth)} — {filtered.length} states</p>}
            </div>
          </div>

          {/* MONTH TABS */}
          <div className="month-tabs">
            {MONTHS.map(m => {
              const hasData = monthsWithData.has(m)
              return (
                <button
                  key={m}
                  className={`month-tab ${selectedMonth === m ? 'active' : ''}`}
                  onClick={() => setSelectedMonth(m)}
                  style={{opacity: hasData ? 1 : 0.4}}
                >
                  {formatMonthShort(m)}
                  {hasData && <span style={{marginLeft:4,fontSize:7,verticalAlign:'super'}}>●</span>}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="states-grid">
              {Array.from({length:12}).map((_,i) => (
                <div key={i} style={{background:'var(--white)',borderRadius:'var(--radius-lg)',padding:20,border:'1px solid var(--border)'}}>
                  <div className="skeleton" style={{height:16,width:'60%',marginBottom:10}}/>
                  <div className="skeleton" style={{height:13,width:'45%',marginBottom:16}}/>
                  <div className="skeleton" style={{height:28,width:'70%',marginBottom:8}}/>
                  <div className="skeleton" style={{height:4,width:'100%'}}/>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h3>No results for &ldquo;{search}&rdquo;</h3>
              <p>Try searching a state name, governor, or geopolitical zone</p>
            </div>
          ) : (
            <div className="states-grid">
              {filtered.map(state => {
                const alloc = allocMap[state.id]
                const pct = alloc ? (alloc.total_allocation / maxAlloc) * 100 : 0
                const partyClass = PARTY_COLORS[state.governor_party] || ''
                const avatarColor = AVATAR_COLORS[state.id % AVATAR_COLORS.length]
                return (
                  <Link href={`/state/${state.slug}`} key={state.id} className="state-card">
                    <div className="state-card-top">
                      <div className="state-name">{state.name}</div>
                      <div className="zone-badge">{state.geopolitical_zone}</div>
                    </div>
                    {state.governor && (
                      <div className="state-gov" style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{
                          width:24,height:24,borderRadius:'50%',
                          background:avatarColor,color:'white',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:9,fontWeight:600,flexShrink:0
                        }}>{getInitials(state.governor)}</div>
                        <span><strong>Gov. {state.governor}</strong></span>
                        {state.governor_party && <span className={`party-pill ${partyClass}`}>{state.governor_party}</span>}
                      </div>
                    )}
                    <div>
                      {alloc ? (
                        <>
                          <div className="allocation-amount">{formatNaira(alloc.total_allocation)}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                            {alloc.verified && <><span className="verified-dot"/>Verified · </>}
                            Statutory: {formatNaira(alloc.federal_share)} · VAT: {formatNaira(alloc.vat_share)}
                          </div>
                        </>
                      ) : (
                        <div style={{color:'var(--text-muted)',fontSize:13,fontStyle:'italic'}}>No data for this month</div>
                      )}
                    </div>
                    {alloc && (
                      <>
                        <div className="allocation-bar">
                          <div className="allocation-fill" style={{width:`${pct}%`}}/>
                        </div>
                        <div className="allocation-meta">
                          <span>{(pct).toFixed(0)}% of highest</span>
                          <span>→ View LGAs</span>
                        </div>
                      </>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" style={{background:'var(--navy)'}}>
        <div className="container">
          <div style={{textAlign:'center',marginBottom:48}}>
            <div className="section-label" style={{justifyContent:'center',color:'rgba(0,135,81,0.8)'}}>Transparency</div>
            <h2 className="section-title display" style={{color:'white'}}>How FAAC Works</h2>
            <p className="section-sub" style={{color:'rgba(255,255,255,0.5)',margin:'0 auto'}}>Every month, Federal Government collects revenue and shares it with states and LGAs through the Federation Account.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:24}}>
            {[
              {icon:'🏛️',title:'Federal Collection',desc:'FG collects oil revenue, taxes, VAT and other sources into the Federation Account'},
              {icon:'📊',title:'FAAC Meeting',desc:'FAAC committee meets monthly (usually 3rd-5th) to share the revenue among all tiers'},
              {icon:'🏢',title:'State Governments',desc:'36 states + FCT each receive their statutory share, VAT share, and derivation funds'},
              {icon:'🏘️',title:'Local Governments',desc:'774 LGAs receive their allocation via state Joint Account Allocation Committees (JAAC)'},
            ].map((item,i) => (
              <div key={i} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(0,135,81,0.2)',borderRadius:'var(--radius-lg)',padding:24}}>
                <div style={{fontSize:28,marginBottom:12}}>{item.icon}</div>
                <div style={{fontWeight:600,color:'white',marginBottom:8}}>{item.title}</div>
                <div style={{fontSize:13,color:'rgba(255,255,255,0.5)',lineHeight:1.6}}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI ASSISTANT */}
      <button className="ai-fab" onClick={() => setShowAI(s => !s)} title="Ask NaijaTrack AI">
        {showAI ? '✕' : '🤖'}
      </button>

      {showAI && (
        <div className="ai-panel">
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <span>🤖</span> NaijaTrack AI
            </div>
            <button className="ai-panel-close" onClick={() => setShowAI(false)}>✕</button>
          </div>
          <div className="ai-messages" id="ai-msgs">
            {aiMessages.map((m,i) => (
              <div key={i} className={`ai-msg ${m.role}`}>{m.text}</div>
            ))}
            {aiLoading && <div className="ai-msg bot">Thinking...</div>}
          </div>
          {aiMessages.length === 1 && (
            <div className="ai-suggestions">
              {AI_SUGGESTIONS.map((s,i) => (
                <button key={i} className="ai-suggestion" onClick={() => handleAI(s)}>{s}</button>
              ))}
            </div>
          )}
          <div className="ai-input-row">
            <input
              className="ai-input"
              placeholder="Ask about any state or LGA..."
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAI(aiInput)}
            />
            <button className="ai-send" onClick={() => handleAI(aiInput)}>➤</button>
          </div>
        </div>
      )}
    </main>
  )
}

'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, formatNaira, formatMonth, PARTY_COLORS, AVATAR_COLORS, getInitials } from '@/lib/supabase'
import type { State, LGA, StateAllocation, FaacAllocation } from '@/lib/supabase'

export default function StatePage({ params }: { params: { slug: string } }) {
  const slug = params.slug
  const [state, setState] = useState<State | null>(null)
  const [allocations, setAllocations] = useState<StateAllocation[]>([])
  const [lgas, setLgas] = useState<LGA[]>([])
  const [lgaAllocs, setLgaAllocs] = useState<FaacAllocation[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: stateData } = await supabase.from('states').select('*').eq('slug', slug).single()
      if (!stateData) { setNotFound(true); setLoading(false); return }
      setState(stateData)
      const [{ data: allocData }, { data: lgaData }, { data: lgaAllocData }] = await Promise.all([
        supabase.from('state_allocations').select('*').eq('state_id', stateData.id).gte('allocation_month','2025-01-01').order('allocation_month', { ascending: false }),
        supabase.from('lgas').select('*').eq('state_id', stateData.id).order('name'),
        supabase.from('faac_allocations').select('*').eq('state_id', stateData.id).gte('allocation_month','2025-01-01').order('allocation_month', { ascending: false })
      ])
      setAllocations(allocData || [])
      setLgas(lgaData || [])
      setLgaAllocs(lgaAllocData || [])
      if (allocData && allocData.length > 0) setSelectedMonth(allocData[0].allocation_month)
      setLoading(false)
    }
    load()
  }, [slug])

  const totalReceived = allocations.reduce((s, a) => s + (a.total_allocation || 0), 0)
  const lgaMap: Record<number, LGA> = {}
  lgas.forEach(l => { lgaMap[l.id] = l })
  const lgaAllocsForMonth = lgaAllocs.filter(a => a.allocation_month === selectedMonth)
    .sort((a, b) => (b.total_allocation || 0) - (a.total_allocation || 0))
  const maxLga = Math.max(...lgaAllocsForMonth.map(a => a.total_allocation || 0), 1)

  const partyClass = state ? (PARTY_COLORS[state.governor_party] || '') : ''
  const avatarColor = state ? AVATAR_COLORS[state.id % AVATAR_COLORS.length] : '#008751'

  const OFFICIALS = [
    { role: 'Governor', name: state?.governor, party: state?.governor_party, color: avatarColor },
    { role: 'Senator (Zone A)', name: 'Data coming soon', party: '', color: '#0D4E8A' },
    { role: 'Senator (Zone B)', name: 'Data coming soon', party: '', color: '#0D4E8A' },
    { role: 'Senator (Zone C)', name: 'Data coming soon', party: '', color: '#0D4E8A' },
  ]

  if (notFound) return (
    <main style={{paddingTop:64}}>
      <nav className="nav">
        <Link href="/" className="nav-logo">Naija<span className="dot">Track</span></Link>
      </nav>
      <div className="container" style={{padding:'80px 24px',textAlign:'center'}}>
        <h2 className="display" style={{fontSize:'2rem',marginBottom:12}}>State not found</h2>
        <Link href="/" style={{color:'var(--green)'}}>← Back to all states</Link>
      </div>
    </main>
  )

  return (
    <main style={{paddingTop:64}}>
      <nav className="nav">
        <Link href="/" className="nav-logo">Naija<span className="dot">Track</span></Link>
        <div className="nav-links">
          <Link href="/" className="nav-link">← All States</Link>
        </div>
      </nav>

      <div className="state-hero">
        <div className="state-hero-grid"/>
        <div className="container" style={{position:'relative',zIndex:1}}>
          <div className="breadcrumb">
            <Link href="/">Home</Link> / <Link href="/">States</Link> / {state?.name}
          </div>
          {loading ? (
            <>
              <div className="skeleton" style={{height:40,width:300,marginBottom:12,borderRadius:8}}/>
              <div className="skeleton" style={{height:16,width:220,borderRadius:6}}/>
            </>
          ) : (
            <>
              <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:8,flexWrap:'wrap'}}>
                <div style={{
                  width:56,height:56,borderRadius:'50%',background:avatarColor,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  color:'white',fontFamily:'Fraunces,serif',fontWeight:600,fontSize:18
                }}>{state?.governor ? getInitials(state.governor) : '?'}</div>
                <div>
                  <h1 className="state-page-title">{state?.name} State</h1>
                  <div className="state-page-meta">
                    {state?.governor && <span>Gov. {state.governor}</span>}
                    {state?.governor_party && <span className={`party-pill ${partyClass}`} style={{marginLeft:8}}>{state.governor_party}</span>}
                    {state?.capital && <span style={{marginLeft:12}}>Capital: {state.capital}</span>}
                    {state?.geopolitical_zone && <span style={{marginLeft:12}}>{state.geopolitical_zone}</span>}
                  </div>
                </div>
              </div>
              <div className="stat-cards">
                <div className="stat-card">
                  <span className="stat-card-num">{formatNaira(totalReceived)}</span>
                  <span className="stat-card-label">Total 2025–present</span>
                </div>
                <div className="stat-card">
                  <span className="stat-card-num">{allocations.length}</span>
                  <span className="stat-card-label">Months on record</span>
                </div>
                <div className="stat-card">
                  <span className="stat-card-num">{lgas.length}</span>
                  <span className="stat-card-label">LGAs</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div style={{display:'grid',gridTemplateColumns:'1fr',gap:20}}>

            <div className="data-card">
              <div className="data-card-header">
                <div>
                  <div className="data-card-title">Monthly Allocations from FG</div>
                  <div className="data-card-sub">{allocations.length} months · click a row to see LGA breakdown</div>
                </div>
              </div>
              {allocations.length === 0 && !loading ? (
                <div className="empty-state"><h3>No allocation data yet</h3><p>Data will appear once available</p></div>
              ) : (
                <div style={{overflowX:'auto'}}>
                  <table>
                    <thead><tr>
                      <th>Month</th><th>Statutory</th><th>VAT</th><th>Ecology</th><th>Total</th><th>Status</th>
                    </tr></thead>
                    <tbody>
                      {loading ? Array.from({length:5}).map((_,i) => (
                        <tr key={i}><td colSpan={6}><div className="skeleton" style={{height:16,borderRadius:4}}/></td></tr>
                      )) : allocations.map(a => (
                        <tr key={a.id}
                          onClick={() => setSelectedMonth(a.allocation_month)}
                          style={{cursor:'pointer', background: selectedMonth === a.allocation_month ? 'rgba(0,135,81,0.04)' : undefined}}
                        >
                          <td className="td-primary">{formatMonth(a.allocation_month)}</td>
                          <td className="td-muted">{formatNaira(a.federal_share)}</td>
                          <td className="td-muted">{formatNaira(a.vat_share)}</td>
                          <td className="td-muted">{formatNaira(a.ecology_share)}</td>
                          <td className="td-amount">{formatNaira(a.total_allocation)}</td>
                          <td>{a.verified ? <span className="verified-tag">✓ Verified</span> : <span className="unverified-tag">Unverified</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="data-card">
              <div className="data-card-header">
                <div>
                  <div className="data-card-title">Who Represents {state?.name}</div>
                  <div className="data-card-sub">Elected officials — senator &amp; rep data being populated</div>
                </div>
              </div>
              <div className="officials-grid">
                {OFFICIALS.map((o,i) => (
                  <div key={i} className="official-card">
                    <div className="official-avatar" style={{background: o.color}}>
                      {o.name && o.name !== 'Data coming soon' ? getInitials(o.name) : '?'}
                    </div>
                    <div className="official-name">{o.name || '—'}</div>
                    <div className="official-role">{o.role}</div>
                    {o.party && <span className={`party-pill ${PARTY_COLORS[o.party]||''}`}>{o.party}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="data-card">
              <div className="data-card-header">
                <div>
                  <div className="data-card-title">LGA Allocations</div>
                  <div className="data-card-sub">
                    {selectedMonth ? formatMonth(selectedMonth) : 'Select a month above'} · {lgaAllocsForMonth.length} LGAs with data
                  </div>
                </div>
              </div>
              {lgaAllocsForMonth.length === 0 ? (
                <div className="empty-state">
                  <h3>No LGA data for this month</h3>
                  <p>Click a month row above to load LGA breakdown</p>
                </div>
              ) : (
                <div style={{overflowX:'auto'}}>
                  <table>
                    <thead><tr><th>LGA</th><th>Total Allocation</th><th>Share</th></tr></thead>
                    <tbody>
                      {lgaAllocsForMonth.map(a => {
                        const lga = lgaMap[a.lga_id]
                        const pct = ((a.total_allocation || 0) / maxLga * 100).toFixed(0)
                        return (
                          <tr key={a.id}>
                            <td className="td-primary">{lga?.name || `LGA #${a.lga_id}`}</td>
                            <td className="td-amount">{formatNaira(a.total_allocation)}</td>
                            <td>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <div style={{width:80,height:4,background:'var(--gray-100)',borderRadius:2,overflow:'hidden'}}>
                                  <div style={{width:`${pct}%`,height:'100%',background:'var(--green)',borderRadius:2}}/>
                                </div>
                                <span style={{fontSize:11,color:'var(--text-muted)'}}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
      </section>
    </main>
  )
}
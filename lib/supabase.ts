import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type State = {
  id: number; name: string; slug: string
  geopolitical_zone: string; capital: string
  governor: string; governor_party: string; governor_since?: string
}
export type LGA = {
  id: number; state_id: number; name: string; slug: string
  population_estimate?: number
}
export type StateAllocation = {
  id: number; state_id: number; allocation_month: string
  federal_share: number; vat_share: number; ecology_share: number
  total_allocation: number; source: string; verified: boolean
}
export type FaacAllocation = {
  id: number; lga_id: number; state_id: number
  allocation_month: string; federal_share: number
  state_share: number; vat_share: number
  total_allocation: number; verified: boolean
}

export function formatNaira(amount: number | null | undefined): string {
  if (!amount) return '—'
  if (amount >= 1_000_000_000) return `₦${(amount / 1_000_000_000).toFixed(2)}B`
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`
  return `₦${amount.toLocaleString('en-NG')}`
}

export function formatMonth(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
}

export function formatMonthShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', { month: 'short', year: '2-digit' })
}

export const PARTY_COLORS: Record<string, string> = {
  'APC': 'party-apc', 'PDP': 'party-pdp',
  'LP': 'party-lp', 'Labour Party': 'party-lp',
  'NNPP': 'party-nnpp', 'APGA': 'party-apga',
}

export const AVATAR_COLORS = [
  '#008751','#005C37','#081A2C','#0D4E8A','#6A1B9A','#C62828','#E65100','#558B2F'
]

export function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

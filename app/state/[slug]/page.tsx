import { supabase } from '@/lib/supabase';

interface StatePageProps {
  params: { slug: string };
  searchParams?: { month?: string };
}

const months = [
  { value: '2025-01', label: 'Jan 2025' },
  { value: '2025-02', label: 'Feb 2025' },
  { value: '2025-03', label: 'Mar 2025' },
  { value: '2025-04', label: 'Apr 2025' },
  { value: '2025-05', label: 'May 2025' },
  { value: '2025-06', label: 'Jun 2025' },
  { value: '2025-07', label: 'Jul 2025' },
  { value: '2025-08', label: 'Aug 2025' },
  { value: '2025-09', label: 'Sep 2025' },
  { value: '2025-10', label: 'Oct 2025' },
  { value: '2025-11', label: 'Nov 2025' },
  { value: '2025-12', label: 'Dec 2025' },
];

export default async function StatePage({ params, searchParams }: StatePageProps) {
  let month = searchParams?.month;

  const { data: stateData } = await supabase
    .from('states')
    .select('id,name,slug,abbreviation,region, description')
    .eq('slug', params.slug)
    .limit(1)
    .single();

  const state = stateData as any;

  const { data: allocations = [] } = await supabase
    .from('state_allocations')
    .select('month,amount')
    .eq('state_id', state?.id)
    .order('month', { ascending: false });

  const { data: officials = [] } = await supabase
    .from('officials')
    .select('id,name,title,photo_url,phone,email')
    .eq('state_id', state?.id)
    .order('title', { ascending: true });

  const { data: lgas = [] } = await supabase
    .from('lgas')
    .select('id,name,code,faac_allocations(month,amount)')
    .eq('state_id', state?.id)
    .order('name', { ascending: true });

  const selectedMonth = month ?? (allocations && allocations.length ? allocations[0].month : months[11].value);

  const lgaBreakdown = (lgas as any[]).map((lga) => ({
    ...lga,
    allocation: lga.faac_allocations?.find((item: any) => item.month === selectedMonth)?.amount ?? 0,
  }));

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-glow shadow-slate-200/50">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-[#C9A84C]">State detail</p>
            <h1 className="mt-3 text-4xl font-semibold text-[#004D29] sm:text-5xl">{state?.name ?? 'State not found'}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
              {state?.description ?? 'Explore monthly FAAC allocations, key officials, and LGA distribution for this state.'}
            </p>
          </div>
          <div className="rounded-3xl bg-[#004D29] p-6 text-white shadow-xl shadow-[#004D29]/15">
            <p className="text-sm uppercase tracking-[0.24em] text-[#C9A84C]/90">State overview</p>
            <div className="mt-5 space-y-4">
              <div className="rounded-3xl bg-[#0b3c29]/80 p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-300">Region</p>
                <p className="mt-2 text-xl font-semibold">{state?.region ?? 'Unknown'}</p>
              </div>
              <div className="rounded-3xl bg-[#0b3c29]/80 p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-300">Selected month</p>
                <p className="mt-2 text-xl font-semibold">{months.find((item) => item.value === selectedMonth)?.label}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-[#004D29]">Monthly allocations</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Allocation timeline</h2>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-700">Latest {allocations?.length ?? 0} months</div>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-700">
                <thead>
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-3">Month</th>
                    <th className="border-b border-slate-200 px-4 py-3">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(allocations as any[]).map((item) => (
                    <tr key={item.month} className="odd:bg-slate-50">
                      <td className="border-b border-slate-200 px-4 py-4">{item.month}</td>
                      <td className="border-b border-slate-200 px-4 py-4 font-semibold text-[#004D29]">{item.amount ? `₦${Number(item.amount).toLocaleString()}` : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-[#004D29]">LGA breakdown</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Allocation by LGA</h2>
              </div>
              <span className="rounded-2xl bg-[#C9A84C]/10 px-4 py-2 text-sm font-medium text-[#4f642c]">Month: {months.find((item) => item.value === selectedMonth)?.label}</span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {lgaBreakdown.length > 0 ? (
                lgaBreakdown.map((lga) => (
                  <div key={lga.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{lga.name}</p>
                    <p className="mt-2 text-sm text-slate-600">Code: {lga.code ?? 'N/A'}</p>
                    <p className="mt-3 text-lg font-semibold text-[#004D29]">{lga.allocation ? `₦${Number(lga.allocation).toLocaleString()}` : 'No allocation'}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
                  No LGA allocation breakdown available for this state.
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-[#004D29]">State officials</p>
            <div className="mt-6 space-y-4">
              {(officials as any[]).length > 0 ? (
                (officials as any[]).map((official) => (
                  <div key={official.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 overflow-hidden rounded-2xl bg-slate-200">
                        {official.photo_url ? <img src={official.photo_url} alt={official.name} className="h-full w-full object-cover" /> : null}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{official.name}</p>
                        <p className="text-sm text-slate-600">{official.title}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-slate-600">
                      {official.email ? <p>Email: {official.email}</p> : null}
                      {official.phone ? <p>Phone: {official.phone}</p> : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-slate-600">No public official records are available for this state.</p>
              )}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-[#F1FAF4] p-6 text-slate-800 shadow-sm">
            <h2 className="text-lg font-semibold text-[#004D29]">How to use</h2>
            <p className="mt-3 text-sm leading-7">
              This page helps you compare monthly state funding with officials and local government area data for stronger transparency and civic monitoring.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

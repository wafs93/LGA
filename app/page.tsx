import { supabase } from '@/lib/supabase';

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
  { value: '2026-01', label: 'Jan 2026' },
  { value: '2026-02', label: 'Feb 2026' },
  { value: '2026-03', label: 'Mar 2026' },
  { value: '2026-04', label: 'Apr 2026' },
  { value: '2026-05', label: 'May 2026' },
];

interface HomePageProps {
  searchParams?: {
    month?: string;
    search?: string;
  };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  let month = searchParams?.month;
  
  // If no month specified, fetch the latest allocation month from DB
  if (!month) {
    const { data: latestAllocation } = await supabase
      .from('state_allocations')
      .select('allocation_month')
      .order('allocation_month', { ascending: false })
      .limit(1)
      .single();
    
    if (latestAllocation?.allocation_month) {
      month = latestAllocation.allocation_month.substring(0, 7);
    } else {
      month = months[11].value;
    }
  }
  const search = searchParams?.search?.toString() ?? '';

  const { data: states = [] } = await supabase
    .from('states')
    .select('id,name,slug,abbreviation,state_allocations(month,amount)')
    .eq('state_allocations.month', month)
    .order('name', { ascending: true });

  const formattedStates = ((states || []) as any[]).map((state) => ({
    ...state,
    allocation: state.state_allocations?.[0]?.amount ?? 0,
  }));

  const filteredStates = (formattedStates || []).filter((state) => {
    const query = search.toLowerCase();
    return (
      state.name.toLowerCase().includes(query) ||
      state.abbreviation?.toLowerCase().includes(query)
    );
  });

  return (
    <section id="home" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-glow shadow-slate-200/50 backdrop-blur-sm">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[#004D29]">Civic accountability</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold text-[#004D29] sm:text-5xl">
              Nigerian state FAAC allocations at a glance.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
              Explore monthly allocations by state, compare performance, and follow the breakdown for officials and LGAs.
            </p>
          </div>
          <div className="rounded-3xl bg-[#004D29] p-6 text-white shadow-xl shadow-[#004D29]/10">
            <p className="text-sm uppercase tracking-[0.24em] text-[#C9A84C]/90">Month selector</p>
            <p className="mt-4 text-3xl font-semibold">{months.find((item) => item.value === month)?.label}</p>
            <p className="mt-2 text-sm text-slate-200">Choose a month to refresh the state allocation grid.</p>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <form className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="search">Search states</label>
              <input
                id="search"
                name="search"
                defaultValue={search}
                placeholder="Search states"
                className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-[#004D29] focus:outline-none focus:ring-2 focus:ring-[#004D29]/20"
              />
              <label className="sr-only" htmlFor="month">Month</label>
              <select
                id="month"
                name="month"
                defaultValue={month}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-[#004D29] focus:outline-none focus:ring-2 focus:ring-[#004D29]/20"
              >
                {months.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-2xl bg-[#004D29] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#063d28]"
              >
                Refresh
              </button>
            </form>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredStates.length > 0 ? (
              filteredStates.map((state) => (
                <a
                  key={state.id}
                  href={`/state/${state.slug}`}
                  className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.2em] text-[#C9A84C]">{state.abbreviation ?? 'N/A'}</p>
                      <h3 className="mt-3 text-xl font-semibold text-slate-900">{state.name}</h3>
                    </div>
                    <div className="rounded-2xl bg-[#E9F7EE] px-3 py-2 text-sm font-semibold text-[#004D29]">
                      {state.allocation ? `₦${Number(state.allocation).toLocaleString()}` : 'No data'}
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-slate-600">Tap to review monthly breakdown, officials and LGA allocation details.</p>
                </a>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-600">
                No matching states found for your search and month selection.
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="rounded-3xl bg-[#004D29] p-6 text-white">
            <p className="text-sm uppercase tracking-[0.24em] text-[#C9A84C]/80">Transparency snapshot</p>
            <p className="mt-4 text-3xl font-semibold">State-wide FAAC</p>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Browse the latest monthly allocations across all states and follow the funding distribution for government transparency.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-[#004D29]">How it works</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
              <li>• Select a month to compare allocations for the full fiscal period.</li>
              <li>• Search by state name or abbreviation.</li>
              <li>• Open a state page for officials and LGA metrics.</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

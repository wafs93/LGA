import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function createAllocation(data: FormData) {
  'use server';

  const stateId = data.get('state_id')?.toString();
  const month = data.get('month')?.toString();
  const amount = Number(data.get('amount'));

  if (!stateId || !month || Number.isNaN(amount)) {
    return;
  }

  await supabase.from('state_allocations').insert([{ state_id: stateId, month, amount }]);
}

export default async function AdminPage() {
  const { data: states = [] } = await supabase.from('states').select('id,name').order('name', { ascending: true });

  return (
    <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-glow shadow-slate-200/50">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.24em] text-[#C9A84C]">Admin panel</p>
          <h1 className="text-4xl font-semibold text-[#004D29]">Add monthly FAAC allocation data</h1>
          <p className="max-w-2xl text-sm leading-7 text-slate-600">
            Use this form to insert a new state allocation record for the selected month.
          </p>
        </div>

        <form action={createAllocation} className="mt-8 grid gap-6 rounded-3xl border border-slate-200 bg-slate-50 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              State
              <select name="state_id" required className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#004D29] focus:ring-2 focus:ring-[#004D29]/20">
                <option value="">Select a state</option>
                {(states as any[]).map((state) => (
                  <option key={state.id} value={state.id}>{state.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              Month
              <input
                name="month"
                type="month"
                required
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#004D29] focus:ring-2 focus:ring-[#004D29]/20"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm text-slate-700">
            Allocation amount (₦)
            <input
              name="amount"
              type="number"
              step="1"
              min="0"
              required
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#004D29] focus:ring-2 focus:ring-[#004D29]/20"
            />
          </label>

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-2xl bg-[#004D29] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#063d28]"
          >
            Add allocation
          </button>
        </form>
      </div>
    </section>
  );
}

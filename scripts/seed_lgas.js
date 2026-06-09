const { createClient } = require('@supabase/supabase-js');
const pkg = require('nigeria-lga-data');
const fs = require('fs');
// load .env.local manually to avoid dependency on dotenv
try{
  const envPath = '.env.local';
  if(fs.existsSync(envPath)){
    const env = fs.readFileSync(envPath,'utf8');
    env.split(/\n|\r/).forEach(line=>{
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if(m){
        let val = m[2] || '';
        // strip surrounding quotes
        if(val.startsWith('"') && val.endsWith('"')) val = val.slice(1,-1);
        if(val.startsWith("'") && val.endsWith("'")) val = val.slice(1,-1);
        process.env[m[1]] = val;
      }
    });
  }
}catch(e){ /* ignore env load errors */ }

function normalize(s){
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g,'');
}

async function main(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url || !key){
    console.error('Supabase URL or key missing in environment');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  // fetch states from DB
  const { data: states } = await supabase.from('states').select('id,name,slug');
  const stateMap = new Map();
  for(const s of states || []){
    stateMap.set(normalize(s.name), s.id);
    if(s.slug) stateMap.set(normalize(s.slug), s.id);
  }
  // heuristic for FCT
  if(!stateMap.has(normalize('Federal Capital Territory'))){
    for(const s of states || []){
      if(String(s.name).toLowerCase().includes('fct') || String(s.name).toLowerCase().includes('abuja')){
        stateMap.set(normalize('federalcapitalterritory'), s.id);
        stateMap.set(normalize('fctabuja'), s.id);
      }
    }
  }

  const all = pkg.getAll();
  console.log('Dataset LGAs count from package:', all.length);

  const rows = [];
  const missingStates = new Set();
  for(const rec of all){
    // record shape may be {name, state} or {lga:..., state:...} etc.
    const name = rec.name || rec.lga || rec.local || rec.lga_name || rec['Local Government'] || rec['Local Government Area'] || rec['Local Government Council'] || rec.localgov || rec.lgaName || rec.lga_name;
    const state = rec.state || rec.region || rec.state_name || rec['state'] || rec['State'] || '';
    const nname = String(name || '').trim();
    const nstate = String(state || '').trim();
    const sid = stateMap.get(normalize(nstate)) || stateMap.get(normalize(nname)) || null;
    let resolved = null;
    if(!sid){
      // try some fallbacks: if state looks numeric, skip; if empty, try to infer from rec
      if(nstate){
        // try matching by prefix
        for(const [k,v] of stateMap){
          if(k.includes(normalize(nstate)) || normalize(nstate).includes(k)){
            resolved = v; break;
          }
        }
      }
      if(!resolved){
        // try some common aliases
        if(/abuja/i.test(nstate) || /federal/i.test(nstate)){
          resolved = stateMap.get(normalize('federalcapitalterritory')) || null;
        }
      }
      if(!resolved){
        missingStates.add(nstate || '(empty)');
        continue;
      }
    }
    const state_id = resolved || sid;
    const slug = `${state_id}-${normalize(nname)}`;
    rows.push({ name: nname, state_id, slug });
  }

  console.log('Prepared rows for insertion:', rows.length, 'Missing states:', [...missingStates].slice(0,10));
  if(rows.length === 0){
    console.error('No rows to insert');
    process.exit(1);
  }

  // Insert in batches of 200
  const chunkSize = 200;
  for(let i=0;i<rows.length;i+=chunkSize){
    const chunk = rows.slice(i,i+chunkSize);
    console.log('Inserting chunk', i, 'size', chunk.length);
    const { error } = await supabase.from('lgas').insert(chunk);
    if(error){
      console.error('Insert error:', error);
      process.exit(1);
    }
  }

  // verify count
  const { data: current } = await supabase.from('lgas').select('id', { count: 'exact' });
  const count = Array.isArray(current) ? current.length : (current?.length || 0);
  console.log('LGAs in DB now (fetched rows):', count);

  // also request exact count using RPC style if supported
  try{
    const q = await supabase.from('lgas').select('id', { count: 'exact' });
    console.log('Exact count metadata may not be available in client; fetched rows:', q.data ? q.data.length : 'n/a');
  }catch(e){ /* ignore */ }

  console.log('Done');
}

main().catch(err=>{console.error(err); process.exit(1);});

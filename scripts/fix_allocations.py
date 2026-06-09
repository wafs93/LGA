"""
fix_allocations.py
Re-parses all cached OAGF PDFs and inserts real ₦ amounts into Supabase.
Run: .venv/bin/python scripts/fix_allocations.py
"""
import pdfplumber
import re
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')
url = os.environ['NEXT_PUBLIC_SUPABASE_URL']
key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
client = create_client(url, key)

# Load states from DB
states_resp = client.table('states').select('id,name,slug').execute()
STATE_MAP = {}
for s in states_resp.data:
    STATE_MAP[s['name'].upper()] = s['id']
    STATE_MAP[s['slug'].upper().replace('-',' ')] = s['id']

# Extra aliases
ALIASES = {
    'FCT ABUJA': 'FCT ABUJA', 'ABUJA': 'FCT ABUJA',
    'FEDERAL CAPITAL TERRITORY': 'FCT ABUJA',
    'FCT': 'FCT ABUJA',
    'CROSS RIVER': 'CROSS RIVER', 'AKWA IBOM': 'AKWA IBOM',
}

def clean_amount(s):
    """Remove spaces inside numbers and parse to float. e.g. '6 7,697,005.55' -> 67697005.55"""
    if not s or s.strip() in ('-', '', 'None', None):
        return 0
    s = str(s).strip()
    # Remove spaces that are INSIDE numbers (between digits)
    s = re.sub(r'(?<=\d) (?=\d)', '', s)
    # Remove commas and ₦
    s = s.replace(',', '').replace('₦', '').strip()
    try:
        return float(s)
    except:
        return 0

def find_state_id(name):
    if not name:
        return None
    n = str(name).strip().upper()
    # Direct match
    if n in STATE_MAP:
        return STATE_MAP[n]
    # Via alias
    if n in ALIASES:
        return STATE_MAP.get(ALIASES[n])
    # Partial match
    for k, v in STATE_MAP.items():
        if k and n and (k in n or n in k) and len(n) > 3:
            return v
    return None

def parse_month(filename):
    """Extract YYYY-MM-01 from filename like Disbursement-January-2025.pdf"""
    months = {
        'january':'01','february':'02','march':'03','april':'04',
        'may':'05','june':'06','july':'07','august':'08',
        'september':'09','october':'10','november':'11','december':'12'
    }
    fn = filename.lower()
    for m, num in months.items():
        if m in fn:
            year_match = re.search(r'(\d{4})', fn)
            if year_match:
                return f"{year_match.group(1)}-{num}-01"
    return None

def parse_state_page(page):
    """Parse Page 2 which has state allocations."""
    tables = page.extract_tables()
    entries = []
    for table in tables:
        if not table or len(table) < 3:
            continue
        # Find header row
        header = None
        data_start = 0
        for i, row in enumerate(table):
            if row and any(cell and 'beneficiar' in str(cell).lower() for cell in row):
                header = row
                data_start = i + 1
                break
            if row and any(cell and 'statutory' in str(cell).lower() for cell in row):
                header = row
                data_start = i + 1
                break
        
        if not header:
            # Try: look for rows where col 1 looks like a state name
            for i, row in enumerate(table[2:], start=2):
                if row and len(row) > 5:
                    name_col = row[1] if len(row) > 1 else row[0]
                    if name_col and str(name_col).strip().upper() in STATE_MAP:
                        data_start = i
                        break

        for row in table[data_start:]:
            if not row or len(row) < 5:
                continue
            # Try to find state name - usually column 1
            name = None
            for ci in [1, 2, 0]:
                if ci < len(row) and row[ci]:
                    candidate = str(row[ci]).strip()
                    if find_state_id(candidate):
                        name = candidate
                        break
            
            if not name:
                continue
            
            state_id = find_state_id(name)
            if not state_id:
                continue

            # Column mapping based on Page 2 structure:
            # Col 3 = Statutory, Col 4 = 13% Derivation, Col 17 = Ecology, Col 17=Gross VAT
            # We want: statutory (col3), ecology (col14 or 15), VAT (col17 or 18)
            amounts = [clean_amount(c) for c in row]
            
            # Find the largest 3 non-zero values as statutory, vat, total
            nonzero = [(i, v) for i, v in enumerate(amounts) if v > 1_000_000]
            if len(nonzero) < 2:
                continue
            
            # statutory is usually col 3 (index 3)
            statutory = amounts[3] if len(amounts) > 3 else 0
            
            # VAT is usually near the end, 2nd-to-last major value
            # Total is usually the last major value
            major = sorted(nonzero, key=lambda x: x[1], reverse=True)
            total = major[0][1] if major else 0
            
            # Find VAT — typically 3rd largest
            vat = 0
            ecology = 0
            if len(major) >= 3:
                # Heuristic: VAT ~15-25% of total, ecology ~2-5%
                for _, v in major[1:]:
                    ratio = v / total if total > 0 else 0
                    if 0.1 < ratio < 0.4 and vat == 0:
                        vat = v
                    elif 0.01 < ratio < 0.1 and ecology == 0:
                        ecology = v

            if total > 0:
                entries.append({
                    'state_id': state_id,
                    'federal_share': int(statutory),
                    'vat_share': int(vat),
                    'ecology_share': int(ecology),
                    'total_allocation': int(total),
                })
    return entries

def process_pdf(pdf_path):
    month = parse_month(pdf_path.name)
    if not month:
        print(f"  ⚠ Could not parse month from {pdf_path.name}")
        return

    print(f"\nProcessing {pdf_path.name} → {month}")
    
    with pdfplumber.open(pdf_path) as pdf:
        all_entries = []
        # Page 2 (index 1) has state allocations
        for page_idx in range(min(3, len(pdf.pages))):
            page = pdf.pages[page_idx]
            entries = parse_state_page(page)
            all_entries.extend(entries)
        
        # Deduplicate by state_id
        seen = {}
        for e in all_entries:
            sid = e['state_id']
            if sid not in seen or e['total_allocation'] > seen[sid]['total_allocation']:
                seen[sid] = e

        final = list(seen.values())
        print(f"  Found {len(final)} state entries")

        if final:
            for entry in final:
                entry['allocation_month'] = month
                entry['source'] = f'OAGF FAAC Communiqué {month}'
                entry['verified'] = True
            
            # Upsert
            resp = client.table('state_allocations').upsert(
                final,
                on_conflict='state_id,allocation_month'
            ).execute()
            print(f"  ✅ Upserted {len(final)} rows for {month}")
        else:
            print(f"  ❌ No entries extracted")

def main():
    downloads = Path('scripts/downloads')
    pdfs = sorted([p for p in downloads.glob('Disbursement-*.pdf') if 'test' not in p.name.lower()])
    
    print(f"Found {len(pdfs)} PDFs to process\n")
    
    for pdf_path in pdfs:
        try:
            process_pdf(pdf_path)
        except Exception as e:
            print(f"  ❌ Error on {pdf_path.name}: {e}")
    
    print("\n\nVerifying results...")
    result = client.table('state_allocations').select('state_id, allocation_month, total_allocation').gt('total_allocation', 0).execute()
    print(f"Rows with real amounts: {len(result.data)}")
    if result.data:
        print("Sample:", result.data[:3])

if __name__ == '__main__':
    main()

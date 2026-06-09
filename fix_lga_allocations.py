"""
fix_lga_allocations.py
Parses LGA allocation tables from cached OAGF PDFs and inserts real ₦ amounts.
Run: .venv/bin/python scripts/fix_lga_allocations.py
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

# Load states and LGAs from DB
states_resp = client.table('states').select('id,name,slug').execute()
lgas_resp = client.table('lgas').select('id,name,state_id').execute()

# Build state map: NAME -> id
STATE_MAP = {}
for s in states_resp.data:
    STATE_MAP[s['name'].upper()] = s['id']
    # Also map slug style
    STATE_MAP[s['slug'].upper().replace('-', ' ')] = s['id']

# Build LGA map: (state_id, LGA_NAME_UPPER) -> lga_id
LGA_MAP = {}
for l in lgas_resp.data:
    key_tuple = (l['state_id'], l['name'].upper().strip())
    LGA_MAP[key_tuple] = l['id']

print(f"Loaded {len(states_resp.data)} states, {len(lgas_resp.data)} LGAs")


def clean_amount(s):
    """Remove spaces inside numbers. e.g. '6 7,697,005.55' -> 67697005.55"""
    if not s or str(s).strip() in ('-', '', 'None', 'none'):
        return 0
    s = str(s).strip()
    # Remove spaces BETWEEN digits (the PDF artifact)
    s = re.sub(r'(?<=\d) (?=\d)', '', s)
    # Remove commas, ₦, spaces
    s = re.sub(r'[₦,\s]', '', s)
    try:
        return float(s)
    except:
        return 0


def find_state_id(name):
    if not name:
        return None
    n = str(name).strip().upper()
    if n in STATE_MAP:
        return STATE_MAP[n]
    # Partial
    for k, v in STATE_MAP.items():
        if k and n and len(n) > 3 and (n in k or k in n):
            return v
    return None


def find_lga_id(state_id, lga_name):
    if not lga_name or not state_id:
        return None
    n = str(lga_name).strip().upper()
    # Direct match
    key = (state_id, n)
    if key in LGA_MAP:
        return LGA_MAP[key]
    # Try without hyphens/spaces
    n_clean = re.sub(r'[-/\s]+', ' ', n).strip()
    for (sid, lname), lid in LGA_MAP.items():
        if sid != state_id:
            continue
        lname_clean = re.sub(r'[-/\s]+', ' ', lname).strip()
        if n_clean == lname_clean:
            return lid
        # Partial match for longer names
        if len(n_clean) > 4 and (n_clean in lname_clean or lname_clean in n_clean):
            return lid
    return None


def parse_month(filename):
    months = {
        'january': '01', 'february': '02', 'march': '03', 'april': '04',
        'may': '05', 'june': '06', 'july': '07', 'august': '08',
        'september': '09', 'october': '10', 'november': '11', 'december': '12'
    }
    fn = filename.lower()
    for m, num in months.items():
        if m in fn:
            year = re.search(r'(\d{4})', fn)
            if year:
                return f"{year.group(1)}-{num}-01"
    return None


def is_lga_header(row):
    """Check if a row looks like an LGA table header."""
    if not row:
        return False
    text = ' '.join(str(c) for c in row if c).lower()
    return ('local government' in text or 'local govt' in text) and ('statutory' in text or 'allocation' in text)


def is_state_header_row(cell_value):
    """Check if a cell contains a state name (marks start of new state block)."""
    if not cell_value:
        return False
    v = str(cell_value).strip().upper()
    return v in STATE_MAP and len(v) > 2


def parse_lga_pages(pdf):
    """
    LGA data is on pages 3+ (index 2+).
    Table structure (wide, two LGA columns side by side):
    S/n | States | S/n | LGA Name | Statutory | Deduction | ExGain | EMTL | Ecology | EcologyTransfer | NetEcology | VAT | Total | (blank) | S/n | State | LGA Name | Statutory | ... | VAT | Total
    """
    entries = []
    current_state_id = None

    for page_idx in range(2, len(pdf.pages)):  # Start from page 3
        page = pdf.pages[page_idx]
        tables = page.extract_tables()

        for table in tables:
            if not table or len(table) < 3:
                continue

            # Find header row
            header_idx = None
            for i, row in enumerate(table):
                if is_lga_header(row):
                    header_idx = i
                    break

            # Determine column indices from header
            # Default positions based on observed PDF structure:
            # Wide table: [sn, state, sn, lga_name, statutory, deduction, ex_gain, emtl, ecology_gross, ecology_transfer, ecology_net, vat, total, blank, sn, state, lga_name, statutory, ...]
            # Left side: lga at col 3, statutory at 4, vat at 11, total at 12
            # Right side: lga at col 16, statutory at 17, vat at 24, total at 25

            data_start = (header_idx + 2) if header_idx is not None else 1

            for row in table[data_start:]:
                if not row or all(c is None or str(c).strip() == '' for c in row):
                    continue

                # Check if col 1 has a state name (state header row)
                if len(row) > 1 and is_state_header_row(row[1]):
                    current_state_id = find_state_id(str(row[1]).strip())

                # Process LEFT side of wide table (cols 0-12)
                if len(row) >= 13:
                    lga_name = str(row[3]).strip() if row[3] else ''
                    # Skip if lga_name looks like a state name or total row
                    if (lga_name and len(lga_name) > 1
                            and not is_state_header_row(lga_name)
                            and 'total' not in lga_name.lower()
                            and not lga_name.isdigit()):

                        # If col 1 has a state name, update current state
                        if row[1] and is_state_header_row(str(row[1]).strip()):
                            current_state_id = find_state_id(str(row[1]).strip())

                        if current_state_id:
                            lga_id = find_lga_id(current_state_id, lga_name)
                            statutory = clean_amount(row[4]) if len(row) > 4 else 0
                            vat = clean_amount(row[11]) if len(row) > 11 else 0
                            ecology = clean_amount(row[10]) if len(row) > 10 else 0
                            total = clean_amount(row[12]) if len(row) > 12 else 0

                            if lga_id and total > 10000:
                                entries.append({
                                    'lga_id': lga_id,
                                    'state_id': current_state_id,
                                    'federal_share': int(statutory),
                                    'vat_share': int(vat),
                                    'ecology_share': int(ecology),
                                    'state_share': 0,
                                    'solid_minerals_share': 0,
                                    'total_allocation': int(total),
                                    'verified': True,
                                })

                # Process RIGHT side of wide table (cols 14-25 approx)
                if len(row) >= 26:
                    # Right side state
                    right_state = str(row[15]).strip() if len(row) > 15 and row[15] else ''
                    right_state_id = find_state_id(right_state) if right_state else current_state_id

                    right_lga = str(row[16]).strip() if len(row) > 16 and row[16] else ''
                    if (right_lga and len(right_lga) > 1
                            and not is_state_header_row(right_lga)
                            and 'total' not in right_lga.lower()
                            and not right_lga.isdigit()):

                        sid = right_state_id or current_state_id
                        if sid:
                            lga_id = find_lga_id(sid, right_lga)
                            statutory = clean_amount(row[17]) if len(row) > 17 else 0
                            vat = clean_amount(row[24]) if len(row) > 24 else 0
                            ecology = clean_amount(row[23]) if len(row) > 23 else 0
                            total = clean_amount(row[25]) if len(row) > 25 else 0

                            if lga_id and total > 10000:
                                entries.append({
                                    'lga_id': lga_id,
                                    'state_id': sid,
                                    'federal_share': int(statutory),
                                    'vat_share': int(vat),
                                    'ecology_share': int(ecology),
                                    'state_share': 0,
                                    'solid_minerals_share': 0,
                                    'total_allocation': int(total),
                                    'verified': True,
                                })

    return entries


def process_pdf(pdf_path):
    month = parse_month(pdf_path.name)
    if not month:
        print(f"  ⚠ Could not parse month from {pdf_path.name}")
        return 0

    print(f"\nProcessing {pdf_path.name} → {month}")

    with pdfplumber.open(pdf_path) as pdf:
        entries = parse_lga_pages(pdf)

    # Deduplicate by lga_id
    seen = {}
    for e in entries:
        lid = e['lga_id']
        if lid not in seen or e['total_allocation'] > seen[lid]['total_allocation']:
            seen[lid] = e

    final = list(seen.values())
    print(f"  Found {len(final)} LGA entries")

    if final:
        for e in final:
            e['allocation_month'] = month
            e['source'] = f'OAGF FAAC Communiqué {month}'

        # Upsert in batches of 100
        batch_size = 100
        total_upserted = 0
        for i in range(0, len(final), batch_size):
            batch = final[i:i+batch_size]
            client.table('faac_allocations').upsert(
                batch,
                on_conflict='lga_id,allocation_month'
            ).execute()
            total_upserted += len(batch)

        print(f"  ✅ Upserted {total_upserted} LGA rows for {month}")
        return total_upserted
    else:
        print(f"  ❌ No LGA entries extracted")
        return 0


def main():
    downloads = Path('scripts/downloads')
    pdfs = sorted([
        p for p in downloads.glob('Disbursement-*.pdf')
        if 'test' not in p.name.lower()
    ])

    print(f"Found {len(pdfs)} PDFs\n")
    total = 0
    for pdf_path in pdfs:
        try:
            total += process_pdf(pdf_path)
        except Exception as e:
            print(f"  ❌ Error on {pdf_path.name}: {e}")
            import traceback; traceback.print_exc()

    print(f"\n\nTotal LGA rows upserted: {total}")

    # Verify
    result = client.table('faac_allocations').select(
        'lga_id, allocation_month, total_allocation'
    ).gt('total_allocation', 0).execute()
    print(f"LGA rows with real amounts in DB: {len(result.data)}")
    if result.data:
        print("Sample:", result.data[:3])


if __name__ == '__main__':
    main()

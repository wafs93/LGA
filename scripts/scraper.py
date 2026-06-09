#!/usr/bin/env python3
"""Scrape FAAC reports from OAGF and insert allocations into Supabase."""

from __future__ import annotations

import os
import re
import logging
from pathlib import Path
from typing import Any

import pdfplumber
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client

BASE_URL = "https://oagf.gov.ng/publications/faac-report/"
SCRIPT_ROOT = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_ROOT.parent
DOWNLOAD_DIR = SCRIPT_ROOT / "downloads"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

MONTH_MAP = {
    "january": "01",
    "february": "02",
    "march": "03",
    "april": "04",
    "may": "05",
    "june": "06",
    "july": "07",
    "august": "08",
    "september": "09",
    "october": "10",
    "november": "11",
    "december": "12",
    "jan": "01",
    "feb": "02",
    "mar": "03",
    "apr": "04",
    "jun": "06",
    "jul": "07",
    "aug": "08",
    "sep": "09",
    "oct": "10",
    "nov": "11",
    "dec": "12",
}

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def load_environment() -> None:
    env_path = REPO_ROOT / ".env.local"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        logger.info("Loaded environment from %s", env_path)
    else:
        logger.warning("No .env.local file found at %s", env_path)


def get_supabase_client():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )

    if not url:
        raise ValueError("Supabase URL not found in environment. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.")
    if not key:
        raise ValueError(
            "Supabase key not found in environment. "
            "Set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local or your environment."
        )

    if os.environ.get("SUPABASE_SERVICE_ROLE_KEY") is None and os.environ.get("SUPABASE_SERVICE_ROLE") is None:
        logger.warning(
            "Using anon key for Supabase connection because service role key is not set. "
            "Inserts may fail if auth policies do not allow writes."
        )

    return create_client(url, key)


def fetch_pdf_links() -> list[dict[str, str]]:
    logger.info("Fetching FAAC report index page: %s", BASE_URL)
    response = requests.get(BASE_URL, timeout=30)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    links = []

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        text = anchor.get_text(separator=" ", strip=True)
        if ".pdf" not in href.lower():
            continue

        # Accept PDFs for 2025 and 2026 (we will parse months and limit to available months)
        if not ("2025" in href or "2025" in text or "2026" in href or "2026" in text):
            continue

        if href.startswith("/"):
            url = f"https://oagf.gov.ng{href}"
        elif href.startswith("http"):
            url = href
        else:
            url = f"https://oagf.gov.ng/{href.lstrip('/')}"

        links.append({"url": url, "text": text or url})

    unique_links = []
    seen = set()
    for link in links:
        if link["url"] not in seen:
            unique_links.append(link)
            seen.add(link["url"])

    logger.info("Found %d PDF links for 2025/2026", len(unique_links))
    return unique_links


def download_pdf(url: str) -> Path:
    filename = url.split("/")[-1].split("?")[0]
    target_path = DOWNLOAD_DIR / filename
    if target_path.exists():
        logger.info("Reusing existing file: %s", target_path)
        return target_path

    logger.info("Downloading PDF: %s", url)
    response = requests.get(url, stream=True, timeout=60)
    response.raise_for_status()

    with open(target_path, "wb") as handle:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                handle.write(chunk)

    logger.info("Saved PDF to %s", target_path)
    return target_path


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    return text


def parse_amount(value: str) -> float | None:
    if not value:
        return None

    text = value.replace("₦", "").replace("N", "").replace(",", "").replace(" ", "").replace("(", "-").replace(")", "").strip()
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def strip_leading_index(cells: list[str]) -> list[str]:
    if len(cells) < 2:
        return cells
    first = cells[0].strip()
    second = cells[1].strip()
    if first.isdigit() and second and not second.isdigit():
        return cells[1:]
    return cells


def parse_month_from_text(text: str) -> str | None:
    lowered = text.lower()
    year_match = re.search(r"(2025|2026)", lowered)
    if not year_match:
        return None

    year = year_match.group(1)
    for name, number in MONTH_MAP.items():
        if name in lowered:
            return f"{year}-{number}"

    explicit = re.search(rf"{year}[-_ ](\d{{1,2}})", lowered)
    if explicit:
        month_num = int(explicit.group(1))
        return f"{year}-{month_num:02d}"

    return None


def identify_table_type(header_row: list[str]) -> str | None:
    header_text = " ".join(header_row).lower()
    if "local government" in header_text or "lga" in header_text:
        return "lga"
    if "state" in header_text and any(keyword in header_text for keyword in ["amount", "allocation", "total"]):
        return "state"
    if "state" in header_text and "lga" not in header_text and any(
        keyword in header_text for keyword in ["allocation", "total", "amount"]
    ):
        return "state"
    if any(keyword in header_text for keyword in ["allocation", "amount", "total"]) and "state" in header_text:
        return "state"
    return None


def normalize_row(row: list[Any]) -> list[str]:
    return [clean_text(item) for item in row]


def normalize_identifier(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", clean_text(value).lower())


def are_headers_similar(left: list[str], right: list[str]) -> bool:
    left_text = " ".join(left).lower()
    right_text = " ".join(right).lower()
    keywords = ["local government", "local govt", "lga", "state", "states"]
    left_matches = {keyword for keyword in keywords if keyword in left_text}
    right_matches = {keyword for keyword in keywords if keyword in right_text}
    if not left_matches or not right_matches:
        return False
    return left_matches == right_matches or left_matches.issuperset(right_matches) or right_matches.issuperset(left_matches)


def find_state_in_candidate(candidate: list[str], state_map: dict[str, int]) -> tuple[int | None, str | None]:
    for index, cell in enumerate(candidate[:6]):
        if not cell:
            continue
        normalized = normalize_identifier(cell)
        if normalized in state_map:
            return index, cell
    return None, None


def find_lga_name_after_state(candidate: list[str], state_index: int | None) -> str | None:
    start = state_index + 1 if state_index is not None else 0
    for cell in candidate[start:]:
        if not cell or cell.isdigit():
            continue
        if parse_amount(cell) is not None:
            continue
        lower = cell.lower()
        if "total" in lower or "subtotal" in lower or "lgcs" in lower or "lgas" in lower:
            continue
        return cell
    return None


def find_amount_from_row(candidate: list[str], amount_idx: int | None) -> float | None:
    if amount_idx is not None and amount_idx < len(candidate):
        amount = parse_amount(candidate[amount_idx])
        if amount is not None:
            return amount

    for cell in reversed(candidate):
        amount = parse_amount(cell)
        if amount is not None:
            return amount
    return None


def format_allocation_month(month: str | None) -> str | None:
    if not month:
        return None
    if re.fullmatch(r"\d{4}-\d{2}$", month):
        return f"{month}-01"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}$", month):
        return month
    return None


def is_currency_row(row: list[str]) -> bool:
    normalized = [clean_text(cell) for cell in row]
    if all(cell in {"", "₦", "N"} for cell in normalized):
        return True
    if all(cell == "" or re.fullmatch(r"[₦N]+", cell) for cell in normalized):
        return True
    return False


def split_wide_table_rows(rows: list[list[str]]) -> list[list[str]]:
    if not rows:
        return rows

    header = rows[0]
    if len(header) < 4 or len(header) % 2 != 0:
        return rows

    half = len(header) // 2
    left_header = header[:half]
    right_header = header[half:]
    if not are_headers_similar(left_header, right_header):
        return rows

    split_rows: list[list[str]] = []
    for row in rows:
        if len(row) < len(header):
            split_rows.append(row)
            continue

        left_row = row[:half]
        right_row = row[half:]
        if any(clean_text(cell) for cell in left_row[1:]):
            split_rows.append(left_row)
        if any(clean_text(cell) for cell in right_row[1:]):
            split_rows.append(right_row)

    return split_rows


def is_header_row(row: list[str]) -> bool:
    normalized = " ".join(cell.lower() for cell in row if cell)
    if not normalized:
        return False
    if re.search(r"\b(s[/ ]?n|sno|serial|serial number|serial no)\b", normalized) and (
        "state" in normalized or "local government" in normalized or "local govt" in normalized or "lga" in normalized
    ):
        return True
    return False


def split_repeated_header_tables(rows: list[list[str]]) -> list[list[list[str]]]:
    tables: list[list[list[str]]] = []
    current: list[list[str]] = []
    for row in rows:
        if is_header_row(row):
            if current and len(current) > 1:
                tables.append(current)
            current = [row]
            continue
        if not current:
            continue
        if any(clean_text(cell) for cell in row):
            current.append(row)
    if current and len(current) > 1:
        tables.append(current)
    return tables


def extract_pdf_tables(pdf_path: Path) -> list[tuple[str, list[list[str]]]]:
    logger.info("Extracting tables from %s", pdf_path)
    extracted = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                rows = [normalize_row(row) for row in table if any(row)]
                rows = split_wide_table_rows(rows)
                subtables = split_repeated_header_tables(rows)
                if not subtables:
                    subtables = [rows]
                for table_rows in subtables:
                    if len(table_rows) < 2:
                        continue
                    table_type = identify_table_type(table_rows[0])
                    if table_type:
                        extracted.append((table_type, table_rows))
                    elif page_number == 1 and any("state" in cell.lower() for cell in table_rows[0]):
                        extracted.append(("state", table_rows))
                    elif page_number == 1 and any("lga" in cell.lower() for cell in table_rows[0]):
                        extracted.append(("lga", table_rows))

    logger.info("Found %d candidate tables in %s", len(extracted), pdf_path)
    return extracted


def find_first_column(headers: list[str], keywords: list[str], default: int | None = None) -> int | None:
    normalized_headers = [normalize_identifier(header) for header in headers]
    for keyword in keywords:
        normalized_keyword = normalize_identifier(keyword)
        for index, header in enumerate(normalized_headers):
            if normalized_keyword and header == normalized_keyword:
                return index
    for keyword in keywords:
        normalized_keyword = normalize_identifier(keyword)
        if not normalized_keyword:
            continue
        for index, header in enumerate(normalized_headers):
            if normalized_keyword in header:
                return index
    return default


def strip_leading_header_index(headers: list[str]) -> list[str]:
    if not headers:
        return headers
    first = clean_text(headers[0]).lower()
    if first in {"s/n", "sn", "sno", "serial", "serial number", "serial no"}:
        return headers[1:]
    if first == "" and len(headers) > 1:
        # Some tables use an empty leading column for row numbering
        return headers[1:]
    return headers


def parse_state_rows(rows: list[list[str]], month: str) -> list[dict[str, Any]]:
    entries = []
    headers = [cell.lower() for cell in strip_leading_header_index(rows[0])]
    state_idx = find_first_column(headers, ["state", "states"])
    amount_idx = find_first_column(headers, ["amount", "allocation", "total", "distributed"], default=len(headers) - 1)

    for row in rows[1:]:
        if not row or len(row) < 2:
            continue

        candidate = strip_leading_index([clean_text(cell) for cell in row])
        if is_header_row(candidate):
            continue

        state_name = candidate[state_idx] if state_idx is not None and state_idx < len(candidate) else candidate[0]
        amount_field = candidate[amount_idx] if amount_idx is not None and amount_idx < len(candidate) else candidate[-1]

        amount = parse_amount(amount_field)
        if not state_name or amount is None:
            continue

        entries.append({
            "state_name": state_name,
            "month": month,
            "amount": amount,
        })

    return entries


def parse_lga_rows(rows: list[list[str]], month: str, state_map: dict[str, int] | None = None) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    state_map = state_map or {}
    headers = [cell.lower() for cell in strip_leading_header_index(rows[0])]
    lga_idx = find_first_column(headers, ["local government", "lga", "lgas", "local govt", "local government councils"])
    state_idx = find_first_column(headers, ["state", "states"])
    amount_idx = find_first_column(headers, ["amount", "allocation", "total", "distributed"], default=len(headers) - 1)

    data_rows = [row for row in rows[1:] if row and any(clean_text(cell) for cell in row)]
    use_parity = False
    if state_map:
        explicit_states = [0, 0]
        blank_states = [0, 0]
        for index, row in enumerate(data_rows):
            candidate = [clean_text(cell) for cell in row]
            if is_header_row(candidate) or is_currency_row(candidate):
                continue
            state_index, _ = find_state_in_candidate(candidate, state_map)
            parity = index % 2
            if state_index is not None:
                explicit_states[parity] += 1
            else:
                blank_states[parity] += 1

        if explicit_states[0] >= 2 and explicit_states[1] >= 2 and blank_states[0] >= 2 and blank_states[1] >= 2:
            use_parity = True

    last_state: dict[int, str] = {0: "", 1: ""}

    for index, row in enumerate(rows[1:]):
        if not row or len(row) < 2:
            continue

        candidate = [clean_text(cell) for cell in row]
        if is_header_row(candidate) or is_currency_row(candidate):
            continue

        parity = index % 2 if use_parity else 0
        state_index, state_name = find_state_in_candidate(candidate, state_map)
        if state_name:
            last_state[parity] = state_name
        else:
            state_name = last_state[parity]

        if not state_name and state_idx is not None and state_idx < len(candidate):
            state_name = candidate[state_idx]

        lga_name = find_lga_name_after_state(candidate, state_index)
        if not lga_name and lga_idx is not None and lga_idx < len(candidate):
            lga_name = candidate[lga_idx]

        if not lga_name or "total" in lga_name.lower() or "subtotal" in lga_name.lower():
            continue

        amount = find_amount_from_row(candidate, amount_idx)
        if amount is None:
            continue

        entries.append({
            "lga_name": lga_name,
            "state_name": state_name or "",
            "month": month,
            "total_allocation": amount,
        })

    return entries


def fetch_state_lookup(client) -> dict[str, int]:
    response = client.table("states").select("id,name,slug").execute()
    data = response.model_dump().get("data") if hasattr(response, "model_dump") else []
    state_map: dict[str, int] = {}

    for row in data or []:
        name = row.get("name") or ""
        slug = row.get("slug") or ""
        for value in [name, slug]:
            key = normalize_identifier(value)
            if key:
                state_map[key] = row["id"]

    return state_map


def fetch_lga_lookup(client) -> list[dict[str, Any]]:
    response = client.table("lgas").select("id,name,state_id").execute()
    return response.model_dump().get("data") if hasattr(response, "model_dump") else []


def resolve_state_id(state_name: str, state_map: dict[str, int]) -> int | None:
    if not state_name:
        return None
    normalized = normalize_identifier(state_name)
    if normalized in state_map:
        return state_map[normalized]

    alias_map = {
        "nassarawa": "nasarawa",
        "fct": "fct",
        "federalcapitalterritory": "fct",
        "abuja": "fct",
    }
    alias = alias_map.get(normalized)
    if alias and alias in state_map:
        return state_map[alias]

    for suffix in ["state", "lgcs", "lgas", "lga", "lg", "localgovernment", "localgovernmentcouncils"]:
        if normalized.endswith(suffix):
            candidate = normalized[: -len(suffix)]
            if candidate in state_map:
                return state_map[candidate]
            alias = alias_map.get(candidate)
            if alias and alias in state_map:
                return state_map[alias]
    return None


def resolve_lga_id(lga_name: str, state_name: str, state_map: dict[str, int], lgas: list[dict[str, Any]]) -> int | None:
    normalized_lga = normalize_identifier(lga_name)
    candidates = [item for item in lgas if normalize_identifier(item.get("name", "")) == normalized_lga]

    state_id = resolve_state_id(state_name, state_map)
    if state_id is not None:
        candidates = [item for item in candidates if item.get("state_id") == state_id]

    if len(candidates) == 1:
        return candidates[0]["id"]

    if not candidates and normalized_lga:
        candidates = [item for item in lgas if normalized_lga in normalize_identifier(item.get("name", ""))]
        if state_id is not None:
            candidates = [item for item in candidates if item.get("state_id") == state_id]
        if len(candidates) == 1:
            return candidates[0]["id"]

    if len(candidates) > 1:
        logger.warning("Multiple LGA matches for %s (%s); skipping", lga_name, state_name)
    else:
        logger.warning("No LGA match found for %s (%s)", lga_name, state_name)
    return None


def prepare_state_allocation_rows(client, state_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    state_map = fetch_state_lookup(client)
    allocations: list[dict[str, Any]] = []

    for row in state_rows:
        state_name = row.get("state_name", "")
        state_id = resolve_state_id(state_name, state_map)
        if state_id is None:
            logger.warning("Skipping state allocation because no state match found for %s", state_name)
            continue
        amount = row.get("amount")
        if isinstance(amount, float):
            amount = int(round(amount))
        allocations.append({
            "state_id": state_id,
            "total_allocation": amount,
            "allocation_month": format_allocation_month(row.get("month")),
        })

    return allocations


def prepare_lga_allocation_rows(client, lga_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    state_map = fetch_state_lookup(client)
    lgas = fetch_lga_lookup(client)
    allocations: list[dict[str, Any]] = []

    for row in lga_rows:
        lga_name = row.get("lga_name", "")
        state_name = row.get("state_name", "")
        lga_id = resolve_lga_id(lga_name, state_name, state_map, lgas)
        if lga_id is None:
            continue

        amount = row.get("total_allocation")
        if isinstance(amount, float):
            amount = int(round(amount))

        entry = {
            "lga_id": lga_id,
            "total_allocation": amount,
            "allocation_month": format_allocation_month(row.get("month")),
        }
        state_id = resolve_state_id(state_name, state_map)
        if state_id is not None:
            entry["state_id"] = state_id

        allocations.append(entry)

    return allocations


def extract_report_data(pdf_path: Path, month: str, state_map: dict[str, int] | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    state_entries: list[dict[str, Any]] = []
    lga_entries: list[dict[str, Any]] = []

    for table_type, rows in extract_pdf_tables(pdf_path):
        if table_type == "state":
            state_entries.extend(parse_state_rows(rows, month))
        elif table_type == "lga":
            lga_entries.extend(parse_lga_rows(rows, month, state_map))

    logger.info(
        "Parsed %d state entries and %d LGA entries from %s",
        len(state_entries),
        len(lga_entries),
        pdf_path,
    )
    return state_entries, lga_entries


def write_supabase_data(client, state_rows: list[dict[str, Any]], lga_rows: list[dict[str, Any]]) -> None:
    state_inserts = prepare_state_allocation_rows(client, state_rows)
    lga_inserts = prepare_lga_allocation_rows(client, lga_rows)

    def dedupe_rows(rows: list[dict[str, Any]], key_fields: tuple[str, ...]) -> list[dict[str, Any]]:
        deduped: dict[tuple[Any, ...], dict[str, Any]] = {}
        for row in rows:
            key = tuple(row[field] for field in key_fields)
            deduped[key] = row
        return list(deduped.values())

    if state_inserts:
        state_inserts = dedupe_rows(state_inserts, ("state_id", "allocation_month"))
        logger.info("Upserting %d unique state allocation rows", len(state_inserts))
        client.table("state_allocations").upsert(state_inserts, on_conflict="state_id,allocation_month").execute()

    if lga_inserts:
        lga_inserts = dedupe_rows(lga_inserts, ("lga_id", "allocation_month"))
        logger.info("Upserting %d unique LGA allocation rows", len(lga_inserts))
        client.table("faac_allocations").upsert(lga_inserts, on_conflict="lga_id,allocation_month").execute()


def main() -> None:
    load_environment()
    client = get_supabase_client()

    pdf_links = fetch_pdf_links()
    if not pdf_links:
        logger.warning("No matching 2025 PDF links found on the FAAC page.")
        return

    state_map = fetch_state_lookup(client)

    for link in pdf_links:
        url = link["url"]
        text = link["text"]
        month = parse_month_from_text(text) or parse_month_from_text(url)
        if not month:
            logger.warning("Could not determine month for PDF link: %s", url)
            continue
        # Only import 2026 months up to May (Jan-May 2026)
        if month.startswith("2026-"):
            try:
                m = int(month.split("-")[1])
                if m > 5:
                    logger.info("Skipping 2026 PDF beyond May: %s", url)
                    continue
            except Exception:
                logger.warning("Unable to parse month number for %s, skipping", month)
                continue

        pdf_path = download_pdf(url)
        state_rows, lga_rows = extract_report_data(pdf_path, month, state_map)

        if not state_rows and not lga_rows:
            logger.warning("No allocation rows extracted from %s", pdf_path)
            continue

        write_supabase_data(client, state_rows, lga_rows)
        logger.info("Completed import for %s", pdf_path)


if __name__ == "__main__":
    main()

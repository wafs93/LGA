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
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE")

    if not url:
        raise ValueError("Supabase URL not found in environment. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.")
    if not key:
        raise ValueError(
            "Supabase service role key not found in environment. "
            "Set SUPABASE_SERVICE_ROLE_KEY in .env.local or your environment."
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

        if "2025" not in href and "2025" not in text:
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

    logger.info("Found %d PDF links for 2025", len(unique_links))
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

    text = value.replace("₦", "").replace("N", "").replace(",", "").strip()
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_month_from_text(text: str) -> str | None:
    lowered = text.lower()
    if "2025" not in lowered:
        return None

    for name, number in MONTH_MAP.items():
        if name in lowered:
            return f"2025-{number}"

    explicit = re.search(r"2025[-_ ](\d{1,2})", lowered)
    if explicit:
        month_num = int(explicit.group(1))
        return f"2025-{month_num:02d}"

    return None


def identify_table_type(header_row: list[str]) -> str | None:
    header_text = " ".join(header_row).lower()
    if "local government" in header_text or "lga" in header_text:
        return "lga"
    if "state" in header_text and "amount" in header_text:
        return "state"
    return None


def normalize_row(row: list[Any]) -> list[str]:
    return [clean_text(item) for item in row if item is not None]


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
                if len(rows) < 2:
                    continue
                table_type = identify_table_type(rows[0])
                if table_type:
                    extracted.append((table_type, rows))
                elif page_number == 1 and any("state" in cell.lower() for cell in rows[0]):
                    extracted.append(("state", rows))
                elif page_number == 1 and any("lga" in cell.lower() for cell in rows[0]):
                    extracted.append(("lga", rows))

    logger.info("Found %d candidate tables in %s", len(extracted), pdf_path)
    return extracted


def parse_state_rows(rows: list[list[str]], month: str) -> list[dict[str, Any]]:
    entries = []
    headers = [cell.lower() for cell in rows[0]]

    for row in rows[1:]:
        if not row:
            continue
        if len(row) < 2:
            continue

        candidate = row
        if candidate[0].isdigit() and len(candidate) >= 3:
            state_name = candidate[1]
            amount_field = candidate[2]
        else:
            state_name = candidate[0]
            amount_field = candidate[1]

        amount = parse_amount(amount_field)
        if not state_name or amount is None:
            continue

        entries.append({
            "state_name": state_name,
            "month": month,
            "amount": amount,
        })

    return entries


def parse_lga_rows(rows: list[list[str]], month: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for row in rows[1:]:
        if not row:
            continue
        if len(row) < 2:
            continue

        candidate = row
        lga_name = ""
        state_name = ""
        amount_field = ""

        if len(candidate) >= 4 and candidate[0].isdigit():
            lga_name = candidate[1]
            state_name = candidate[2]
            amount_field = candidate[3]
        elif len(candidate) == 3:
            lga_name, state_name, amount_field = candidate
        elif len(candidate) == 2:
            lga_name = candidate[0]
            amount_field = candidate[1]
        else:
            lga_name = candidate[0]
            amount_field = candidate[-1]
            if len(candidate) >= 3:
                state_name = candidate[-2]

        amount = parse_amount(amount_field)
        if not lga_name or amount is None:
            continue

        entries.append({
            "lga_name": lga_name,
            "state_name": state_name,
            "month": month,
            "amount": amount,
        })

    return entries


def extract_report_data(pdf_path: Path, month: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    state_entries: list[dict[str, Any]] = []
    lga_entries: list[dict[str, Any]] = []

    for table_type, rows in extract_pdf_tables(pdf_path):
        if table_type == "state":
            state_entries.extend(parse_state_rows(rows, month))
        elif table_type == "lga":
            lga_entries.extend(parse_lga_rows(rows, month))

    logger.info(
        "Parsed %d state entries and %d LGA entries from %s",
        len(state_entries),
        len(lga_entries),
        pdf_path,
    )
    return state_entries, lga_entries


def write_supabase_data(client, state_rows: list[dict[str, Any]], lga_rows: list[dict[str, Any]]) -> None:
    if state_rows:
        logger.info("Inserting %d state allocation rows", len(state_rows))
        state_response = client.table("state_allocations").insert(state_rows).execute()
        if state_response.error:
            raise RuntimeError(f"Supabase state insert error: {state_response.error.message}")

    if lga_rows:
        logger.info("Inserting %d LGA allocation rows", len(lga_rows))
        lga_response = client.table("faac_allocations").insert(lga_rows).execute()
        if lga_response.error:
            raise RuntimeError(f"Supabase LGA insert error: {lga_response.error.message}")


def main() -> None:
    load_environment()
    client = get_supabase_client()

    pdf_links = fetch_pdf_links()
    if not pdf_links:
        logger.warning("No matching 2025 PDF links found on the FAAC page.")
        return

    for link in pdf_links:
        url = link["url"]
        text = link["text"]
        month = parse_month_from_text(text) or parse_month_from_text(url)
        if not month:
            logger.warning("Could not determine month for PDF link: %s", url)
            continue

        pdf_path = download_pdf(url)
        state_rows, lga_rows = extract_report_data(pdf_path, month)

        if not state_rows and not lga_rows:
            logger.warning("No allocation rows extracted from %s", pdf_path)
            continue

        write_supabase_data(client, state_rows, lga_rows)
        logger.info("Completed import for %s", pdf_path)


if __name__ == "__main__":
    main()

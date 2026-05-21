"""Shared utilities for catalog scraping and image processing scripts."""
import json
import os
import re
import unicodedata
from datetime import datetime, timezone

MANIFEST_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'catalog', 'manifest.json')

def load_manifest():
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_manifest(manifest):
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

def add_manifest_entry(manifest, entry):
    """Add or update an entry keyed by item_id + file_type."""
    key = f"{entry['item_id']}_{entry['file_type']}"
    for i, e in enumerate(manifest['entries']):
        if f"{e['item_id']}_{e['file_type']}" == key:
            manifest['entries'][i] = entry
            return
    manifest['entries'].append(entry)

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def slugify(text):
    """Convert Hebrew or mixed text to a lowercase ASCII slug."""
    HE_MAP = {
        'א':'a','ב':'b','ג':'g','ד':'d','ה':'h','ו':'v','ז':'z','ח':'kh','ט':'t',
        'י':'y','כ':'k','ך':'k','ל':'l','מ':'m','ם':'m','נ':'n','ן':'n','ס':'s',
        'ע':'a','פ':'p','ף':'p','צ':'ts','ץ':'ts','ק':'k','ר':'r','ש':'sh','ת':'t',
    }
    result = ''
    for ch in text:
        if ch in HE_MAP:
            result += HE_MAP[ch]
        else:
            result += ch
    result = unicodedata.normalize('NFKD', result)
    result = re.sub(r'[^\w\s-]', '', result.lower())
    result = re.sub(r'[\s_]+', '-', result.strip())
    result = re.sub(r'-+', '-', result)
    return result[:60]

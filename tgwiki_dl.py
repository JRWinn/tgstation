#!/usr/bin/env python3
"""Download pages from the /tg/station 13 wiki (MediaWiki API, stdlib only).

  python tgwiki_dl.py                 -> every page linked from "Locations"
  python tgwiki_dl.py --all           -> every article on the wiki
  python tgwiki_dl.py --from Guides   -> every page linked from another page
  add --html to save rendered HTML instead of wikitext

Files land in ./tgwiki/ (change with --out).
"""
import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://wiki.tgstation13.org/api.php"
UA = "tgwiki-dl/1.0 (personal offline copy)"
DELAY = 0.5  # seconds between requests; be nice to their server


def api(params):
    params = {**params, "format": "json", "formatversion": "2"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            wait = 5 * (attempt + 1)
            print(f"  retry in {wait}s ({e})")
            time.sleep(wait)
    raise SystemExit(f"Gave up on {url}")


def safe_name(title):
    return re.sub(r'[<>:"/\\|?*]', "_", title).strip(". ")


def query_all(params):
    """Run a query, following MediaWiki 'continue' until done; yield pages."""
    cont = {}
    while True:
        data = api({**params, **cont})
        yield from data.get("query", {}).get("pages", [])
        if "continue" not in data:
            return
        cont = data["continue"]
        time.sleep(DELAY)


def list_titles(source):
    if source is None:  # whole wiki, main namespace, no redirects
        gen = {"generator": "allpages", "gapnamespace": 0,
               "gapfilterredir": "nonredirects", "gaplimit": "max"}
    else:               # pages linked from one page
        gen = {"generator": "links", "titles": source,
               "gplnamespace": 0, "gpllimit": "max"}
    titles = {p["title"] for p in query_all({"action": "query", **gen})
              if not p.get("missing")}
    if source:
        titles.add(source)
    return sorted(titles)


def save_wikitext(titles, out):
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        pages = query_all({"action": "query", "prop": "revisions",
                           "rvprop": "content", "rvslots": "main",
                           "redirects": 1, "titles": "|".join(batch)})
        for p in pages:
            revs = p.get("revisions")
            if not revs:
                continue
            text = revs[0]["slots"]["main"]["content"]
            (out / (safe_name(p["title"]) + ".wiki")).write_text(text, encoding="utf-8")
        print(f"  {min(i + 50, len(titles))}/{len(titles)}")
        time.sleep(DELAY)


def save_html(titles, out):
    for n, title in enumerate(titles, 1):
        data = api({"action": "parse", "page": title, "prop": "text", "redirects": 1})
        if "parse" in data:
            html = (f"<!doctype html><meta charset='utf-8'><title>{title}</title>\n"
                    f"<h1>{title}</h1>\n{data['parse']['text']}")
            (out / (safe_name(title) + ".html")).write_text(html, encoding="utf-8")
        print(f"  {n}/{len(titles)}  {title}")
        time.sleep(DELAY)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true", help="download every article")
    ap.add_argument("--from", dest="source", default="Locations",
                    help="download pages linked from this page (default: Locations)")
    ap.add_argument("--html", action="store_true", help="save rendered HTML, not wikitext")
    ap.add_argument("--out", default="tgwiki", help="output folder")
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    print("Listing pages...")
    titles = list_titles(None if a.all else a.source)
    print(f"{len(titles)} pages -> {out.resolve()}")
    (save_html if a.html else save_wikitext)(titles, out)
    print("Done.")


if __name__ == "__main__":
    main()

"""Check that the page's local scripts and styles exist."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[1] / "dist"

class Assets(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        url = attrs.get("src") if tag == "script" else attrs.get("href") if tag == "link" else None
        if not url or urlsplit(url).scheme or url.startswith("//"):
            return
        path = root / urlsplit(url).path.lstrip("/")
        if not path.is_file():
            raise SystemExit(f"Missing asset: {url}")

Assets().feed((root / "index.html").read_text())
print("Local page assets verified.")

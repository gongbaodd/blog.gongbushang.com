#!/usr/bin/env python3
"""Subset Noto Sans SC to the glyphs used by the resume pages.

Reads all CJK text from packages/resume/data.ts, subsets the Fontsource
chinese-simplified woff2 files (400 + 700) with pyftsubset, and writes tiny
self-hosted woff2 files to public/fonts/. Re-run after editing CV wording:

    python3 packages/resume/subset-fonts.py
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "packages" / "resume" / "data.ts"
FONTS = ROOT / "public" / "fonts"

# (output weight, ttc file, face index of "Noto Sans CJK SC" inside the .ttc)
WEIGHTS = (("400", "NotoSansCJK-Regular.ttc"), ("700", "NotoSansCJK-Bold.ttc"))


def find_ttc(filename: str) -> Path:
    out = subprocess.run(["fc-match", "Noto Sans CJK SC", "--format=%{file}\n"],
                         capture_output=True, text=True)
    if out.returncode == 0 and out.stdout.strip():
        ttc = Path(out.stdout.strip()).parent / filename
        if ttc.exists():
            return ttc
    for cand in [Path("/usr/share/fonts/noto-cjk") / filename,
                 *ROOT.glob(f"**/{filename}")]:
        if cand.exists():
            return cand
    raise FileNotFoundError(f"{filename} not found (install Noto Sans CJK SC)")
# A few CJK punctuation marks that future edits may use, so the subset stays valid.
EXTRA = "，。、：；（）「」『』—…·？！〈〉《》"

text = DATA.read_text(encoding="utf-8")
# Subset every non-ASCII glyph the CV uses (CJK, kana, Thai, Cyrillic,
# fullwidth forms, CJK punctuation) except emoji, which render via emoji fonts.
chars = set()
for c in text + EXTRA:
    o = ord(c)
    if o < 0x20:
        continue
    if (0x1F000 <= o <= 0x1FAFF or 0x2600 <= o <= 0x27BF
            or o in (0xFE0F, 0x200D) or 0x1F100 <= o <= 0x1F1FF) \
            and o not in (0x2605, 0x2606):  # keep ★/☆ (text presentation)
        continue
    chars.add(c)
unicodes = ",".join(f"U+{ord(c):04X}" for c in sorted(chars))
print(f"{len(chars)} unique glyphs (data.ts + extras)")

FONTS.mkdir(parents=True, exist_ok=True)
for weight, ttc_name in WEIGHTS:
    src = find_ttc(ttc_name)
    dst = FONTS / f"resume-noto-sans-sc-{weight}.woff2"
    cmd = ["pyftsubset", str(src), f"--output-file={dst}",
           "--font-number=2",  # "Noto Sans CJK SC" face inside the .ttc
           f"--unicodes={unicodes}", "--flavor=woff2",
           "--layout-features=*", "--no-hinting"]
    print(f"+ subset {src.name} face 2 -> {dst.name} ...")
    subprocess.run(cmd, check=True)
    print(f"  ({src.stat().st_size/1024/1024:.0f} MB) -> {dst.name} ({dst.stat().st_size/1024:.0f} KB)")

# Noto Sans CJK has no Thai glyphs; fetch Noto Sans Thai from Google Fonts and
# subset it to the Thai syllables used in `profile.languages`.
thai_chars = sorted({c for c in text if "\u0e00" <= c <= "\u0e7f"})
if thai_chars:
    import urllib.request
    css_req = urllib.request.Request(
        "https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700&display=swap",
        headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"})
    css = urllib.request.urlopen(css_req, timeout=30).read().decode()
    thai_unicodes = ",".join(f"U+{ord(c):04X}" for c in thai_chars + [" "])
    for weight in ("400", "700"):
        m = re.search(rf"font-weight: {weight}.*?url\((https://[^)]+)\)", css, re.S)
        if not m:
            raise RuntimeError(f"Thai {weight} URL not found in Google Fonts CSS")
        ttf = FONTS / f".thai-{weight}.ttf"
        urllib.request.urlretrieve(m.group(1), ttf)
        dst = FONTS / f"resume-noto-sans-thai-{weight}.woff2"
        subprocess.run(["pyftsubset", str(ttf), f"--output-file={dst}",
                        f"--unicodes={thai_unicodes}", "--flavor=woff2",
                        "--layout-features=*", "--no-hinting"], check=True)
        ttf.unlink()
        print(f"  Thai {weight}: {dst.name} ({dst.stat().st_size/1024:.1f} KB)")

print("done.")

#!/usr/bin/env python3
"""
End-to-end browser test (optional).  Requires:  pip install playwright && playwright install chromium
Run from the project root:   python3 tests/e2e_playwright.py
Screenshots are written to tests/screenshots/.
"""
import http.server
import os
import socketserver
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SHOTS = os.path.join(ROOT, "tests", "screenshots")
os.makedirs(SHOTS, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), Quiet)
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{PORT}/index.html"

failures = []


def check(name, cond, extra=""):
    print(("  ok  " if cond else "FAIL  ") + name + (f"  [{extra}]" if extra and not cond else ""))
    if not cond:
        failures.append(name)


def count_text(page):
    return int(page.inner_text("#resultCount").split()[0].replace(",", ""))


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1366, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("console", lambda m: errors.append("console: " + m.text)
            if m.type == "error" and "fonts.g" not in m.text and "Failed to load resource" not in m.text else None)

    page.goto(URL)
    page.wait_for_selector(".card")
    page.wait_for_timeout(1300)

    # ---- initial state
    check("3,200 movies reported", count_text(page) == 3200, page.inner_text("#resultCount"))
    check("hero counters animated to final values", page.inner_text("#statMovies") == "3,200", page.inner_text("#statMovies"))
    check("24 cards rendered first (or more to fill viewport)", page.locator(".card").count() >= 24)
    page.screenshot(path=os.path.join(SHOTS, "01-home.png"))

    # ---- helper: expected results computed independently in the page
    expected_js = """(q) => {
        const D = window.MOVIES_DATA.map(r => ({t:r[1].toLowerCase(), y:r[2], g:r[3].split('|'), r:r[4], v:r[5]}));
        return D.filter(m => (!q.words.length || q.words.every(w => m.t.split(/[^a-z0-9]+/).some(x => x.startsWith(w))))
          && (!q.genres.length || q.genres.some(g => m.g.includes(g)))
          && m.r >= q.minRating && m.y >= q.y0 && m.y <= q.y1 && m.v >= q.minVotes).length;
    }"""

    # ---- search
    page.fill("#searchInput", "silent")
    page.wait_for_timeout(300)
    exp = page.evaluate(expected_js, {"words": ["silent"], "genres": [], "minRating": 0, "y0": 0, "y1": 9999, "minVotes": 0})
    check("search 'silent' count matches independent filter", count_text(page) == exp, f"{count_text(page)} vs {exp}")
    titles = page.eval_on_selector_all(".card h3", "els => els.map(e => e.textContent.toLowerCase())")
    check("all shown titles contain a word starting with 'silent'", all("silent" in t for t in titles))
    check("suggestion dropdown visible", page.is_visible("#suggestions li"))
    page.screenshot(path=os.path.join(SHOTS, "02-search.png"))
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    check("picking a suggestion narrows to that title", count_text(page) >= 1 and not page.is_visible("#suggestions"))
    page.fill("#searchInput", "")
    page.wait_for_timeout(300)
    check("clearing search restores all movies", count_text(page) == 3200)

    # ---- genre + rating + year + votes
    page.click('.chip[data-genre="Drama"]')
    page.click('.chip[data-genre="Comedy"]')
    page.fill("#ratingRange", "6")
    page.wait_for_timeout(300)
    exp = page.evaluate(expected_js, {"words": [], "genres": ["Drama", "Comedy"], "minRating": 6, "y0": 0, "y1": 9999, "minVotes": 0})
    check("genre(any)+rating filter matches independent filter", count_text(page) == exp, f"{count_text(page)} vs {exp}")
    page.evaluate("""() => { const e = document.querySelector('#yearMin'); e.value = 2005; e.dispatchEvent(new Event('input', {bubbles:true})); }""")
    page.evaluate("""() => { const e = document.querySelector('#votesRange'); e.value = 2; e.dispatchEvent(new Event('input', {bubbles:true})); }""")
    page.wait_for_timeout(300)
    exp = page.evaluate(expected_js, {"words": [], "genres": ["Drama", "Comedy"], "minRating": 6, "y0": 2005, "y1": 9999, "minVotes": 5000})
    check("year + votes filters match independent filter", count_text(page) == exp, f"{count_text(page)} vs {exp}")
    check("active filter chips shown", page.locator(".a-chip").count() >= 4)
    ratings = page.eval_on_selector_all(".card .badge-rate", "els => els.map(e => parseFloat(e.textContent.replace('★','')))")
    check("results sorted by rating desc", all(ratings[i] >= ratings[i + 1] for i in range(len(ratings) - 1)))
    check("insights panel shows 5 top picks", page.locator("#topList li").count() == 5)
    check("histogram has 10 bars", page.locator("#hist .bar").count() == 10)
    page.screenshot(path=os.path.join(SHOTS, "03-filtered.png"))

    # remove a chip, then reset
    page.click('.a-chip button[data-clear="rating"]')
    page.wait_for_timeout(250)
    check("removing rating chip resets slider", page.input_value("#ratingRange") == "0")
    page.click("#resetBtn")
    page.wait_for_timeout(300)
    check("reset restores everything", count_text(page) == 3200 and page.locator(".a-chip").count() == 0)

    # ---- sorting
    for key, getter in [("year", "els => els.map(e => parseInt(e.textContent))"),
                        ("title", "els => els.map(e => e.textContent.toLowerCase())")]:
        page.select_option("#sortSel", key)
        page.wait_for_timeout(300)
    titles = page.eval_on_selector_all(".card h3", "els => els.map(e => e.textContent.toLowerCase())")
    check("title sort is A→Z", titles == sorted(titles))
    page.click("#dirBtn")
    page.wait_for_timeout(300)
    titles = page.eval_on_selector_all(".card h3", "els => els.map(e => e.textContent.toLowerCase())")
    check("reversing gives Z→A", titles == sorted(titles, reverse=True))
    page.select_option("#sortSel", "year")
    page.wait_for_timeout(300)
    years = page.eval_on_selector_all(".card .sub", "els => els.map(e => parseInt(e.textContent.match(/(\\d{4}) ·/)[1]))")
    check("year sort newest first", all(years[i] >= years[i + 1] for i in range(len(years) - 1)))
    page.select_option("#sortSel", "rating")
    page.wait_for_timeout(300)

    # ---- infinite scroll
    before = page.locator(".card").count()
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(900)
    after = page.locator(".card").count()
    check("infinite scroll loads more cards", after > before, f"{before} -> {after}")

    # ---- modal + favourites
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    page.locator(".card .open").first.click()
    page.wait_for_selector("#modal:not([hidden])")
    check("modal opens with title", len(page.inner_text("#mTitle")) > 2)
    check("modal rank text present", page.inner_text("#mInfo").startswith("RANK") or "of 3,200" in page.inner_text("#mInfo"))
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(SHOTS, "04-modal.png"))
    page.click("#mFav")
    check("watchlist button toggles", "In your watchlist" in page.inner_text("#mFav"))
    page.keyboard.press("Escape")
    check("Escape closes modal", page.is_hidden("#modal"))
    check("favourite persisted to localStorage", len(page.evaluate("JSON.parse(localStorage.getItem('cinerank:fav')||'[]')")) == 1)
    check("fav counter shows 1", page.inner_text("#favCount") == "1")
    page.check("#favOnly", force=True)
    page.wait_for_timeout(300)
    check("watchlist-only shows exactly 1 movie", count_text(page) == 1)
    page.uncheck("#favOnly", force=True)
    page.wait_for_timeout(250)

    # ---- find similar
    page.locator(".card .open").first.click()
    page.click("#mSimilar")
    page.wait_for_timeout(500)
    check("find-similar applies genre filter & closes modal", page.is_hidden("#modal") and page.locator(".chip.on").count() >= 1)
    page.click("#resetBtn")
    page.wait_for_timeout(300)

    # ---- list view & theme
    page.click('#viewSeg button[data-view="list"]')
    check("list view applied", page.evaluate("document.querySelector('#grid').classList.contains('list')"))
    page.screenshot(path=os.path.join(SHOTS, "05-list.png"))
    page.click('#viewSeg button[data-view="grid"]')
    page.click("#themeBtn")
    check("light theme applied", page.evaluate("document.documentElement.dataset.theme") == "light")
    page.screenshot(path=os.path.join(SHOTS, "06-light.png"))
    page.click("#themeBtn")

    # ---- benchmark
    page.click("#benchBtn")
    page.click("#runBench")
    page.wait_for_selector(".b-row", timeout=60000)
    page.wait_for_function("document.querySelector('#runBench').textContent === 'Run again'", timeout=60000)
    check("benchmark shows 4 comparisons", page.locator(".b-row").count() == 4)
    check("benchmark reports speed-ups", all("faster" in t or "instant" in t for t in page.eval_on_selector_all(".b-row h4 em", "els => els.map(e => e.textContent)")))
    page.wait_for_timeout(900)
    page.screenshot(path=os.path.join(SHOTS, "07-benchmark.png"))
    page.keyboard.press("Escape")

    # ---- CSV import
    csv = ("Series_Title,Released_Year,Runtime,Genre,IMDB_Rating,No_of_Votes\n"
           "The Shawshank Redemption,1994,142 min,Drama,9.3,2343110\n"
           "Inception,2010,148 min,\"Action, Sci-Fi\",8.8,2067042\n"
           "Parasite,2019,132 min,\"Comedy, Thriller\",8.5,859000\n")
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as f:
        f.write(csv)
        csv_path = f.name
    page.set_input_files("#csvInput", csv_path)
    page.wait_for_timeout(900)
    check("CSV import replaces dataset (3 movies)", count_text(page) == 3, page.inner_text("#resultCount"))
    check("year slider bounds follow new data", page.get_attribute("#yearMin", "min") == "1994" and page.get_attribute("#yearMax", "max") == "2019")
    check("genre chips rebuilt from CSV", page.locator(".chip").count() == 5, str(page.locator(".chip").count()))
    page.fill("#searchInput", "incep")
    page.wait_for_timeout(300)
    check("search works on imported data", count_text(page) == 1)
    page.screenshot(path=os.path.join(SHOTS, "08-csv.png"))
    os.unlink(csv_path)

    # ---- empty state
    page.fill("#searchInput", "zzzzqqq")
    page.wait_for_timeout(300)
    check("empty state shown when nothing matches", page.is_visible("#empty") and count_text(page) == 0)

    check("no JS/console errors on desktop", not errors, "; ".join(errors))

    # ---- mobile
    m = browser.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2, has_touch=True)
    mp = m.new_page()
    merrors = []
    mp.on("pageerror", lambda e: merrors.append(str(e)))
    mp.goto(URL)
    mp.wait_for_selector(".card")
    mp.wait_for_timeout(1300)
    sw = mp.evaluate("document.documentElement.scrollWidth")
    check("no horizontal overflow on mobile", sw <= 391, str(sw))
    mp.screenshot(path=os.path.join(SHOTS, "09-mobile.png"))
    mp.click("#openFilters")
    mp.wait_for_timeout(500)
    check("mobile filter drawer opens", mp.evaluate("document.querySelector('#filters').classList.contains('open')"))
    mp.screenshot(path=os.path.join(SHOTS, "10-mobile-filters.png"))
    mp.click('.chip[data-genre="Horror"]')
    mp.click("#scrim", position={"x": 370, "y": 400})
    mp.wait_for_timeout(500)
    check("drawer closes via scrim", not mp.evaluate("document.querySelector('#filters').classList.contains('open')"))
    check("mobile filter applied", int(mp.inner_text("#resultCount").split()[0].replace(",", "")) < 3200)
    check("no JS errors on mobile", not merrors, "; ".join(merrors))

    browser.close()

httpd.shutdown()
print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("All end-to-end checks passed")

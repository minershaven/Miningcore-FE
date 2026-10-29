#!/usr/bin/env python3
"""
Build search-engine pages for the pool front end from the live Miningcore API.

Writes into the web root (default /var/www/pool-ui):
  coins/index.html            hub page listing every coin
  coins/<coin>/index.html     one crawlable page per coin (PPLNS + SOLO, ports, stats, FAQ)
  sitemap.xml, robots.txt
  index.html                  refreshes the <!-- SEO:HEAD --> and <!-- SEO:BODY --> blocks

Because pages are generated from /api/pools, new coins added to Miningcore get their own
page and sitemap entry on the next run. Run it from cron, e.g. every 30 minutes:
  */30 * * * * root python3 /opt/pool-seo/build-seo.py --site https://theminershaven.org
Uses only the Python standard library.
"""
import argparse, datetime, html, json, os, re, sys, tempfile, urllib.request

ALGO_TIPS = {
    "sha-256": "Use any SHA-256 ASIC (Antminer S19/S21, Whatsminer, Avalon, Bitaxe).",
    "scrypt": "Use a Scrypt ASIC (Antminer L7/L9, Elphapex DG, Goldshell, VolcMiner).",
    "progpowz": "Use a GPU miner in EthProxy mode: SRBMiner-MULTI (default settings), TT-Miner, or Rigel with an ethproxy+tcp:// URL.",
    "kawpow": "Use a GPU miner such as SRBMiner-MULTI, T-Rex, TeamRedMiner, Rigel or Gminer.",
}


ALGO_NAMES = {"sha256d": "SHA-256", "scrypt": "Scrypt", "progpowz": "ProgPowZ", "kawpow": "KawPoW",
              "randomx": "RandomX", "ethash": "Ethash", "etchash": "Etchash", "x11": "X11"}


def esc(s):
    return html.escape(str(s if s is not None else ""), quote=True)


def hashrate(h):
    h = float(h or 0)
    units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s", "ZH/s"]
    i = 0
    while h >= 1000 and i < len(units) - 1:
        h /= 1000.0
        i += 1
    return f"{h:.2f} {units[i]}".replace(".00 ", " ")


def num(n, digits=0):
    try:
        return f"{float(n):,.{digits}f}"
    except (TypeError, ValueError):
        return "0"


def amount(n):
    n = float(n or 0)
    if n == 0:
        return "0"
    if n >= 1000:
        return f"{n:,.2f}"
    if n >= 1:
        return f"{n:,.4f}".rstrip("0").rstrip(".")
    return f"{n:.8f}".rstrip("0").rstrip(".")


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-") or "coin"


def fetch_pools(api):
    with urllib.request.urlopen(api.rstrip("/") + "/pools", timeout=30) as r:
        return json.load(r).get("pools", [])


def group_by_coin(pools):
    coins = {}
    for p in pools:
        c = p.get("coin") or {}
        key = (c.get("symbol") or p.get("id")).upper()
        e = coins.setdefault(key, {"name": c.get("name") or key, "symbol": key,
                                   "algorithm": ALGO_NAMES.get((c.get("algorithm") or "").lower(), c.get("algorithm") or ""), "website": c.get("website"),
                                   "slug": slugify(c.get("name") or key), "pools": []})
        e["pools"].append(p)
    for e in coins.values():
        e["pools"].sort(key=lambda p: (0 if (p.get("paymentProcessing") or {}).get("payoutScheme", "").upper() != "SOLO" else 1, p.get("id")))
    return sorted(coins.values(), key=lambda e: e["name"].lower())


def scheme(p):
    return ((p.get("paymentProcessing") or {}).get("payoutScheme") or "").upper()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


MARK_SVG = ('<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="mk" x1="0" y1="0" x2="1" y2="1">'
            '<stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>'
            '<path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="url(#mk)"/><path d="M32 11 50 21.5v21L32 53 14 42.5v-21z" fill="#0a0a0a"/>'
            '<path d="M20 26c6-5 18-5 24 0" fill="none" stroke="#3b82f6" stroke-width="4" stroke-linecap="round"/>'
            '<path d="M32 24v20" stroke="#3b82f6" stroke-width="4" stroke-linecap="round"/>'
            '<path d="M26 44h12" stroke="#93c5fd" stroke-width="3" stroke-linecap="round" opacity=".7"/></svg>')


def brand_html(name):
    parts = name.split(" ")
    last = parts.pop() if len(parts) > 1 else ""
    return f'{MARK_SVG}<span>{esc(" ".join(parts))}{(" <b>" + esc(last) + "</b>") if last else ""}</span>'


def page_shell(a, title, desc, canonical, body, jsonld):
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">
  <link rel="canonical" href="{esc(canonical)}">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#050505">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="{esc(a.name)}">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:url" content="{esc(canonical)}">
  <meta property="og:image" content="{esc(a.site)}/img/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(desc)}">
  <meta name="twitter:image" content="{esc(a.site)}/img/og-image.png">
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css?v=5">
  <script type="application/ld+json">{json.dumps(jsonld, separators=(",", ":"))}</script>
</head>
<body>
  <header class="topbar"><div class="topbar-inner">
    <a href="/" class="brand">{brand_html(a.name)}</a>
    <nav class="mainnav static-nav">
      <a href="/#/connect">Connect</a><a href="/#/dashboard">Dashboard</a><a href="/coins/">Coins</a><a href="/#/blocks">Blocks</a><a href="/#/faq">FAQ</a>
    </nav>
  </div></header>
  <main class="app">{body}</main>
  <footer class="footer"><div class="footer-inner">
    <div class="footer-left"><span class="brand small">{brand_html(a.name)}</span><span class="muted">Stats updated {esc(a.now_h)}</span></div>
    <div class="footer-links"><a href="/coins/">All coins</a><a href="/#/connect">Connect</a><a href="/#/pools">Live pools</a><a href="/#/faq">FAQ</a></div>
  </div></footer>
</body>
</html>
"""


def coin_page(a, c):
    name, sym, algo = c["name"], c["symbol"], c["algorithm"]
    schemes = sorted({scheme(p) for p in c["pools"]}, key=lambda s: (s == "SOLO", s))
    sch_txt = " and ".join(schemes) if schemes else "PPLNS"
    fees = sorted({float(p.get("poolFeePercent") or 0) for p in c["pools"]})
    fee_txt = (f"{fees[0]:g}%" if len(fees) == 1 else f"{fees[0]:g}–{fees[-1]:g}%") if fees else "low"
    mins = [float((p.get("paymentProcessing") or {}).get("minimumPayment") or 0) for p in c["pools"]]
    min_txt = f"{amount(min(mins))} {sym}" if mins else ""
    canonical = f"{a.site}/coins/{c['slug']}/"
    title = f"{name} ({sym}) Mining Pool – {sch_txt} | {a.name}"
    desc = (f"Mine {name} ({sym}) on {a.name}: {sch_txt} {algo} pools with a {fee_txt} fee, "
            f"low-latency stratum, live stats and automatic payouts from {min_txt}.").replace("  ", " ")

    miners = sum(int((p.get("poolStats") or {}).get("connectedMiners") or 0) for p in c["pools"])
    pool_hr = sum(float((p.get("poolStats") or {}).get("poolHashrate") or 0) for p in c["pools"])
    ns = (c["pools"][0].get("networkStats") or {})
    blocks = sum(int(p.get("totalBlocks") or 0) for p in c["pools"])

    pools_html = ""
    for p in c["pools"]:
        pp = p.get("paymentProcessing") or {}
        ports = sorted((p.get("ports") or {}).items(), key=lambda kv: int(kv[0]))
        rows = "".join(
            f"<tr><td><code class=\"endpoint\">stratum+{'ssl' if v.get('tls') else 'tcp'}://{esc(a.stratum_host)}:{esc(k)}</code></td>"
            f"<td>{esc(v.get('name') or '')}</td><td class=\"num\">{esc(num(v.get('difficulty'), 2).rstrip('0').rstrip('.'))}</td></tr>"
            for k, v in ports)
        pools_html += f"""
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>{esc(name)} {esc(scheme(p))} pool</h3><a class="btn btn-sm" href="/#/pool/{esc(p.get('id'))}">Live stats &rarr;</a></div>
        <div class="card-pad">
          <dl class="kv">
            <dt>Payout scheme</dt><dd>{esc(scheme(p))}</dd>
            <dt>Pool fee</dt><dd>{esc(f"{float(p.get('poolFeePercent') or 0):g}%")}</dd>
            <dt>Minimum payout</dt><dd>{esc(amount(pp.get('minimumPayment')))} {esc(sym)}</dd>
            <dt>Miners online</dt><dd>{esc(num((p.get('poolStats') or {}).get('connectedMiners')))}</dd>
            <dt>Pool hashrate</dt><dd>{esc(hashrate((p.get('poolStats') or {}).get('poolHashrate')))}</dd>
            <dt>Blocks found</dt><dd>{esc(num(p.get('totalBlocks')))}</dd>
          </dl>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Stratum URL</th><th>Port type</th><th class="num">Start difficulty</th></tr></thead><tbody>{rows}</tbody></table></div>
      </div>"""

    tip = ALGO_TIPS.get(algo.lower(), "Point any miner that supports this algorithm at one of the stratum URLs below.")
    faq = [
        (f"How do I mine {name} on {a.name}?",
         f"Point your miner at one of the stratum URLs on this page. Use your {name} wallet address as the username "
         f"(add .worker to name each rig) and any password, for example x. {tip}"),
        (f"Should I choose PPLNS or SOLO for {name}?",
         "PPLNS shares every block the pool finds between miners by their recent shares, so payouts are smaller but regular. "
         "SOLO pays the whole block reward to the miner who finds it: bigger payouts with much higher variance."),
        (f"What are the fees and minimum payout for {sym}?",
         f"The pool fee is {fee_txt}. Payouts are sent automatically once your confirmed balance reaches the minimum ({min_txt})."),
        (f"Can I rent hashrate for {name}?",
         f"Yes. Rental services such as MiningRigRentals and NiceHash can point rented rigs at the stratum URLs above using your {sym} address."),
    ]
    faq_html = "".join(f'<details class="faq-item"{" open" if i == 0 else ""}><summary>{esc(q)}</summary><p>{esc(ans)}</p></details>'
                       for i, (q, ans) in enumerate(faq))

    body = f"""
    <div class="container">
      <div class="page-head">
        <div class="crumbs"><a href="/">Home</a> / <a href="/coins/">Coins</a> / {esc(name)}</div>
        <h1>{esc(name)} ({esc(sym)}) Mining Pool</h1>
        <p>{esc(a.name)} runs {esc(sch_txt)} {esc(name)} mining pools on the {esc(algo)} algorithm, with a {esc(fee_txt)} pool fee,
        automatic payouts and live statistics for every miner.</p>
        <div class="hero-actions" style="margin:18px 0 0">
          <a class="btn btn-primary" href="/#/connect/{esc(c['pools'][0].get('id'))}">Start mining {esc(sym)}</a>
          <a class="btn" href="/#/dashboard">Check your stats</a>
        </div>
      </div>
      <div class="kpis" style="margin-top:24px">
        <div class="kpi"><div class="l">Pool hashrate</div><div class="v">{esc(hashrate(pool_hr))}</div></div>
        <div class="kpi"><div class="l">Miners online</div><div class="v">{esc(num(miners))}</div></div>
        <div class="kpi"><div class="l">Network hashrate</div><div class="v">{esc(hashrate(ns.get('networkHashrate')))}</div></div>
        <div class="kpi"><div class="l">Blocks found</div><div class="v">{esc(num(blocks))}</div></div>
      </div>
      <h2 style="margin:36px 0 4px">Pools and stratum servers</h2>
      <p class="text-2" style="margin:0">{esc(tip)}</p>
      {pools_html}
      <h2 style="margin:40px 0 8px">{esc(name)} mining FAQ</h2>
      {faq_html}
    </div>"""

    jsonld = [
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": a.site + "/"},
            {"@type": "ListItem", "position": 2, "name": "Coins", "item": a.site + "/coins/"},
            {"@type": "ListItem", "position": 3, "name": f"{name} mining pool", "item": canonical}]},
        {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": ans}} for q, ans in faq]},
    ]
    return page_shell(a, title, desc, canonical, body, jsonld)


def hub_page(a, coins):
    canonical = f"{a.site}/coins/"
    names = ", ".join(c["name"] for c in coins)
    title = f"Supported Coins – {a.name} Mining Pool"
    desc = f"Mine {names} on {a.name}. PPLNS and SOLO pools, low fees, live stats and automatic payouts."
    rows = ""
    for c in coins:
        hr = sum(float((p.get("poolStats") or {}).get("poolHashrate") or 0) for p in c["pools"])
        mn = sum(int((p.get("poolStats") or {}).get("connectedMiners") or 0) for p in c["pools"])
        sch = " / ".join(sorted({scheme(p) for p in c["pools"]}, key=lambda s: (s == "SOLO", s)))
        rows += (f'<tr><td><a href="/coins/{esc(c["slug"])}/"><b>{esc(c["name"])}</b> <span class="muted">({esc(c["symbol"])})</span></a></td>'
                 f'<td class="text-2">{esc(c["algorithm"])}</td><td>{esc(sch)}</td><td class="num">{esc(num(mn))}</td>'
                 f'<td class="num">{esc(hashrate(hr))}</td></tr>')
    body = f"""
    <div class="container">
      <div class="page-head">
        <div class="crumbs"><a href="/">Home</a> / Coins</div>
        <h1>Coins you can mine on {esc(a.name)}</h1>
        <p>Choose a coin for its stratum servers, ports, fees and live pool statistics.</p>
      </div>
      <div class="card" style="margin-top:24px"><div class="table-wrap"><table>
        <thead><tr><th>Coin</th><th>Algorithm</th><th>Payout</th><th class="num">Miners</th><th class="num">Hashrate</th></tr></thead>
        <tbody>{rows}</tbody></table></div></div>
    </div>"""
    jsonld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": title, "url": canonical,
              "hasPart": [{"@type": "WebPage", "name": f'{c["name"]} mining pool', "url": f'{a.site}/coins/{c["slug"]}/'} for c in coins]}
    return page_shell(a, title, desc, canonical, body, jsonld)


def refresh_index(a, coins, path):
    if not os.path.exists(path):
        return False
    s = open(path, encoding="utf-8").read()
    names = [c["name"] for c in coins]
    coin_list = (", ".join(names[:-1]) + " and " + names[-1]) if len(names) > 1 else (names[0] if names else "crypto")
    title = f"{coin_list} Mining Pool | {a.name}"
    if len(title) > 65:  # keep it short enough for search results
        title = f"{'/'.join(c['symbol'] for c in coins)} Mining Pool – PPLNS & SOLO | {a.name}"
    if len(title) > 65:
        title = f"{a.name} – Multi-Coin Mining Pool | PPLNS & SOLO"
    desc = (f"{a.name} is a multi-coin mining pool for {coin_list}. PPLNS and SOLO payouts, "
            f"low fees, fast stratum servers, live stats and automatic payouts.")
    jsonld = [
        {"@context": "https://schema.org", "@type": "Organization", "name": a.name, "url": a.site + "/",
         "logo": a.site + "/img/apple-touch-icon.png"},
        {"@context": "https://schema.org", "@type": "WebSite", "name": a.name, "url": a.site + "/"},
    ]
    head = f"""<!-- SEO:HEAD (generated by build-seo.py) -->
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">
  <link rel="canonical" href="{esc(a.site)}/">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="{esc(a.name)}">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:url" content="{esc(a.site)}/">
  <meta property="og:image" content="{esc(a.site)}/img/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(desc)}">
  <meta name="twitter:image" content="{esc(a.site)}/img/og-image.png">
  <script type="application/ld+json">{json.dumps(jsonld, separators=(",", ":"))}</script>
  <!-- /SEO:HEAD -->"""
    items = "".join(f'<li><a href="/coins/{esc(c["slug"])}/">{esc(c["name"])} ({esc(c["symbol"])}) mining pool</a> – '
                    f'{esc(" and ".join(sorted({scheme(p) for p in c["pools"]}, key=lambda x: (x == "SOLO", x))))}, {esc(c["algorithm"])}</li>'
                    for c in coins)
    body = f"""<!-- SEO:BODY (generated by build-seo.py; replaced by the app when JavaScript runs) -->
    <div class="container seo-static" style="padding:48px 20px">
      <h1>{esc(a.name)}: {esc(coin_list)} mining pool</h1>
      <p>{esc(desc)}</p>
      <h2>Supported coins</h2>
      <ul>{items}</ul>
      <p><a href="/coins/">All coins</a> · <a href="/#/connect">How to connect</a> · <a href="/#/faq">FAQ</a></p>
    </div>
    <!-- /SEO:BODY -->"""
    new = re.sub(r"<!-- SEO:HEAD.*?<!-- /SEO:HEAD -->", lambda m: head, s, flags=re.S)
    new = re.sub(r"<!-- SEO:BODY.*?<!-- /SEO:BODY -->", lambda m: body, new, flags=re.S)
    if new != s:
        write(path, new)
    return "<!-- SEO:HEAD" in s


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", required=True, help="public site URL, e.g. https://theminershaven.org")
    ap.add_argument("--api", default="http://127.0.0.1:4000/api", help="Miningcore API base")
    ap.add_argument("--out", default="/var/www/pool-ui", help="web root of the front end")
    ap.add_argument("--name", default=None, help="pool name (default: read from config.js, else 'Mining Pool')")
    ap.add_argument("--stratum-host", default=None, help="stratum hostname (default: host of --site)")
    a = ap.parse_args()
    a.site = a.site.rstrip("/")
    a.stratum_host = a.stratum_host or re.sub(r"^https?://", "", a.site).split("/")[0]
    if not a.name:
        try:
            m = re.search(r'name:\s*"([^"]+)"', open(os.path.join(a.out, "config.js"), encoding="utf-8").read())
            a.name = m.group(1) if m else "Mining Pool"
        except OSError:
            a.name = "Mining Pool"
    now = datetime.datetime.now(datetime.timezone.utc)
    a.now_h = now.strftime("%Y-%m-%d %H:%M UTC")

    try:
        pools = fetch_pools(a.api)
    except Exception as e:  # keep the last good pages if the API is briefly down
        print(f"build-seo: API not reachable ({e}); keeping existing pages", file=sys.stderr)
        return 1
    coins = group_by_coin([p for p in pools if p])
    if not coins:
        print("build-seo: API returned no pools; keeping existing pages", file=sys.stderr)
        return 1

    for c in coins:
        write(os.path.join(a.out, "coins", c["slug"], "index.html"), coin_page(a, c))
    write(os.path.join(a.out, "coins", "index.html"), hub_page(a, coins))

    lastmod = now.strftime("%Y-%m-%d")
    urls = [(a.site + "/", "1.0"), (a.site + "/coins/", "0.9")] + [(f"{a.site}/coins/{c['slug']}/", "0.8") for c in coins]
    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
               + "".join(f"  <url><loc>{esc(u)}</loc><lastmod>{lastmod}</lastmod><changefreq>hourly</changefreq><priority>{p}</priority></url>\n" for u, p in urls)
               + "</urlset>\n")
    write(os.path.join(a.out, "sitemap.xml"), sitemap)
    write(os.path.join(a.out, "robots.txt"), f"User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {a.site}/sitemap.xml\n")

    ok = refresh_index(a, coins, os.path.join(a.out, "index.html"))
    print(f"build-seo: {len(coins)} coin pages, sitemap with {len(urls)} URLs"
          + ("" if ok else " (index.html has no SEO markers; update it from GitHub)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())

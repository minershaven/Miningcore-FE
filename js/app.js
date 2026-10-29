/* Pool front end — router + pages */
(function () {
  const C = window.POOL_CONFIG;
  const { esc } = F;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $("#app");

  /* ---------------- state ---------------- */
  const S = {
    pools: null,
    poolsAt: null,
    sort: { key: "miners", dir: -1 },
    search: "",
    algo: "all",
    scheme: "all",
    poolTab: "overview",
    minerTab: "payments",
    chartRange: "day",
    blocksPool: "all",
    pages: {}
  };
  let renderToken = 0;
  let refreshTimer = null;

  /* ---------------- brand ---------------- */
  const MARK = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="mk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>
    <path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="url(#mk)"/>
    <path d="M32 11 50 21.5v21L32 53 14 42.5v-21z" fill="#0a0a0a"/>
    <path d="M20 26c6-5 18-5 24 0" fill="none" stroke="#3b82f6" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 24v20" stroke="#3b82f6" stroke-width="4" stroke-linecap="round"/>
    <path d="M26 44h12" stroke="#93c5fd" stroke-width="3" stroke-linecap="round" opacity=".7"/>
  </svg>`;
  function brandName(cls = "") {
    const parts = (C.name || "Pool").split(" ");
    const last = parts.length > 1 ? parts.pop() : "";
    return `<span class="${cls}">${esc(parts.join(" "))}${last ? ` <b>${esc(last)}</b>` : ""}</span>`;
  }
  function brandMark() { return C.logo ? `<img class="mark" src="${esc(C.logo)}" alt="">` : MARK; }

  function initChrome() {
    $("#brand").innerHTML = brandMark() + brandName();
    $("#footer-brand").innerHTML = brandMark() + brandName();
    $("#footer-copy").textContent = `© ${new Date().getFullYear()} ${C.name}. All rights reserved.`;
    if (C.links?.telegram) { const t = $("#toplink-telegram"); t.href = C.links.telegram; t.hidden = false; }
    $("#menu-btn").addEventListener("click", () => $("#mainnav").classList.toggle("open"));
    $("#mainnav").addEventListener("click", (e) => { if (e.target.closest("a")) $("#mainnav").classList.remove("open"); });
    API.onStatus((s) => {
      const p = $("#live-pill");
      p.className = "live-pill " + s;
      p.querySelector("span").textContent = s === "on" ? "Live" : s === "demo" ? "Demo" : "Offline";
      if (s === "demo") { $("#demo-banner").hidden = false; $("#demo-api").textContent = API.base; }
    });
  }

  /* ---------------- helpers ---------------- */
  const ICON = {
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    wifi: '<svg viewBox="0 0 24 24"><path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/></svg>',
    ext: '<svg viewBox="0 0 24 24" style="width:12px;height:12px;display:inline;vertical-align:-1px;fill:none;stroke:currentColor;stroke-width:2"><path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
  };

  const poolName = (p) => `${p.coin?.name || p.id}`;
  const schemeBadge = (p) => { const s = F.scheme(p); return `<span class="badge ${esc(s.toLowerCase())}">${esc(s)}</span>`; };
  const coinCell = (p, withSym = true) =>
    `<span class="coin">${F.coinIcon(p.coin)}<span><b>${esc(poolName(p))}</b>${withSym ? ` <span class="sym">(${esc(p.coin?.symbol)})</span>` : ""}</span></span>`;
  const sym = (p) => esc(p?.coin?.symbol || "");
  const poolById = (id) => (S.pools || []).find((p) => p.id === id);
  const minerLink = (poolId, addr, n = 8) => `<a class="addr" href="#/miner/${encodeURIComponent(poolId)}/${encodeURIComponent(addr)}" title="${esc(addr)}">${esc(F.shortAddr(addr, n))}</a>`;
  const extLink = (href, text) => (href && href !== "#" ? `<a href="${esc(href)}" target="_blank" rel="noopener" class="addr">${text} ${ICON.ext}</a>` : `<span class="addr">${text}</span>`);
  const effortHtml = (e) => {
    if (e == null) return "—";
    const v = e * 100;
    return `<span class="${v <= 100 ? "green" : v <= 200 ? "warn" : "red"}">${v.toFixed(1)}%</span>`;
  };
  const statusBadge = (b) => {
    const s = (b.status || "").toLowerCase();
    if (s === "confirmed") return '<span class="badge green">Confirmed</span>';
    if (s === "orphaned") return '<span class="badge red">Orphaned</span>';
    return `<span class="badge amber">Pending ${Math.round((b.confirmationProgress || 0) * 100)}%</span>`;
  };
  const algos = () => [...new Set((S.pools || []).map((p) => p.coin?.algorithm).filter(Boolean))].sort();
  const schemes = () => [...new Set((S.pools || []).map((p) => F.scheme(p)))].sort();
  const flagImg = (cc) => (cc ? `<img class="flag" src="https://flagcdn.com/w40/${esc(cc.toLowerCase())}.png" alt="" loading="lazy">` : "");

  function toast(title, body, cls = "") {
    const t = document.createElement("div");
    t.className = `toast ${cls}`;
    t.innerHTML = `<b>${esc(title)}</b>${esc(body || "")}`;
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied", text, "green"); }
    catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("Copied", text, "green"); } catch {} ta.remove(); }
  }
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-copy]");
    if (c) { e.preventDefault(); copy(c.dataset.copy); }
    const row = e.target.closest("tr[data-href]");
    if (row && !e.target.closest("a,button")) location.hash = row.dataset.href;
  });

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  async function loadPools(force) {
    if (!force && S.pools && Date.now() - S.poolsAt < 10000) return S.pools;
    const pools = await API.pools();
    S.pools = pools;
    S.poolsAt = Date.now();
    return pools;
  }

  function loading() { app.innerHTML = '<div class="loading"><div class="spinner"></div>Loading pool data…</div>'; }
  function errorView(e) {
    app.innerHTML = `<div class="container"><div class="error-box"><b>Could not load data from the pool API.</b><br>
      <span class="text-2">${esc(e.message || e)}. Check that Miningcore is running and that <code>apiBase</code> in config.js (currently <code>${esc(API.base)}</code>) is reachable from the browser (CORS / reverse proxy).</span></div></div>`;
  }

  function pager(key, pageCount) {
    const p = S.pages[key] || 0;
    if (!pageCount || pageCount <= 1) return "";
    return `<div class="pager"><button class="btn btn-sm" data-page="${key}" data-to="${p - 1}" ${p <= 0 ? "disabled" : ""}>Prev</button>
      <span>Page ${p + 1} of ${pageCount}</span>
      <button class="btn btn-sm" data-page="${key}" data-to="${p + 1}" ${p >= pageCount - 1 ? "disabled" : ""}>Next</button></div>`;
  }
  function bindPager(root, rerender) {
    $$("[data-page]", root).forEach((b) => b.addEventListener("click", () => { S.pages[b.dataset.page] = +b.dataset.to; rerender(); }));
  }
  // v2 endpoints return {result,itemCount,pageCount}; v1 return arrays
  const unpage = (r) => (Array.isArray(r) ? { items: r, pageCount: 0 } : { items: r?.result || [], pageCount: r?.pageCount || 0, itemCount: r?.itemCount });

  /* ---------------- pools table ---------------- */
  const COLS = [
    { key: "coin", label: "Coin", get: (p) => poolName(p).toLowerCase() },
    { key: "type", label: "Type", get: (p) => F.scheme(p) },
    { key: "algo", label: "Algorithm", get: (p) => p.coin?.algorithm || "", cls: "hide-sm" },
    { key: "fee", label: "Fee", get: (p) => p.poolFeePercent, num: true },
    { key: "miners", label: "Miners", get: (p) => p.poolStats?.connectedMiners || 0, num: true },
    { key: "hashrate", label: "Hashrate", get: (p) => p.poolStats?.poolHashrate || 0, num: true },
    { key: "net", label: "Network", get: (p) => p.networkStats?.networkHashrate || 0, num: true, cls: "hide-sm" },
    { key: "blocks", label: "Blocks", get: (p) => p.totalBlocks || 0, num: true },
    { key: "paid", label: "Total Paid", get: (p) => p.totalPaid || 0, num: true, cls: "hide-sm" },
    { key: "last", label: "Last Block", get: (p) => (p.lastPoolBlockTime ? +new Date(p.lastPoolBlockTime) : 0), cls: "hide-sm" }
  ];

  function filteredPools() {
    const q = S.search.trim().toLowerCase();
    let list = (S.pools || []).filter((p) => {
      if (S.algo !== "all" && p.coin?.algorithm !== S.algo) return false;
      if (S.scheme !== "all" && F.scheme(p) !== S.scheme) return false;
      if (!q) return true;
      return [p.id, p.coin?.name, p.coin?.symbol, p.coin?.algorithm, F.scheme(p)].some((v) => (v || "").toLowerCase().includes(q));
    });
    const col = COLS.find((c) => c.key === S.sort.key) || COLS[4];
    list.sort((a, b) => { const x = col.get(a), y = col.get(b); return (x > y ? 1 : x < y ? -1 : 0) * S.sort.dir; });
    return list;
  }

  function poolRows() {
    const list = filteredPools();
    if (!list.length) return `<tr><td colspan="${COLS.length + 1}" class="empty">No pools match your filters.</td></tr>`;
    return list.map((p) => {
      const live = (p.poolStats?.connectedMiners || 0) > 0;
      return `<tr class="clickable" data-href="#/pool/${encodeURIComponent(p.id)}">
        <td>${coinCell(p)}</td>
        <td>${schemeBadge(p)}</td>
        <td class="hide-sm text-2">${esc(p.coin?.algorithm || "—")}</td>
        <td class="num text-2">${F.pct(p.poolFeePercent, p.poolFeePercent % 1 ? 1 : 0)}</td>
        <td class="num">${F.num(p.poolStats?.connectedMiners)}</td>
        <td class="num"><span class="nowrap">${F.hashrate(p.poolStats?.poolHashrate)} <span class="dot ${live ? "" : "gray"}" style="width:6px;height:6px;margin-left:4px"></span></span></td>
        <td class="num hide-sm text-2">${F.hashrate(p.networkStats?.networkHashrate)}</td>
        <td class="num">${F.num(p.totalBlocks)}</td>
        <td class="num hide-sm">${F.coin(p.totalPaid)} <span class="muted">${sym(p)}</span></td>
        <td class="hide-sm text-2">${p.lastPoolBlockTime ? F.ago(p.lastPoolBlockTime) : "—"}</td>
        <td class="right"><a class="btn btn-sm" href="#/pool/${encodeURIComponent(p.id)}">View</a></td>
      </tr>`;
    }).join("");
  }

  function poolsTable() {
    const chip = (kind, v, label) => `<button class="chip ${S[kind] === v ? "on" : ""}" data-filter="${kind}" data-v="${esc(v)}">${esc(label)}</button>`;
    return `
      <div class="toolbar">
        <span class="live-label">${ICON.wifi}Live data · Updated <span data-updated>${F.time(S.poolsAt)}</span></span>
        <label class="search">${ICON.search}<input id="pool-search" type="search" placeholder="Search pools by coin or algorithm…" value="${esc(S.search)}"></label>
      </div>
      <div class="toolbar">
        <div class="chips">${chip("algo", "all", "All algorithms")}${algos().map((a) => chip("algo", a, a)).join("")}</div>
        <div class="chips">${chip("scheme", "all", "All types")}${schemes().map((s) => chip("scheme", s, s)).join("")}</div>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr>${COLS.map((c) => `<th class="sortable ${c.cls || ""} ${c.num ? "num" : ""} ${S.sort.key === c.key ? (S.sort.dir > 0 ? "asc" : "desc") : ""}" data-sort="${c.key}">${c.label}</th>`).join("")}<th></th></tr></thead>
        <tbody id="pool-rows">${poolRows()}</tbody>
      </table></div></div>`;
  }
  function bindPoolsTable(root) {
    const rows = () => { $("#pool-rows", root).innerHTML = poolRows(); };
    $("#pool-search", root)?.addEventListener("input", (e) => { S.search = e.target.value; rows(); });
    $$("[data-sort]", root).forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.sort;
      S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : k === "coin" || k === "type" || k === "algo" ? 1 : -1 };
      $$("[data-sort]", root).forEach((t) => t.classList.remove("asc", "desc"));
      th.classList.add(S.sort.dir > 0 ? "asc" : "desc");
      rows();
    }));
    $$("[data-filter]", root).forEach((b) => b.addEventListener("click", () => {
      S[b.dataset.filter] = b.dataset.v;
      $$(`[data-filter="${b.dataset.filter}"]`, root).forEach((x) => x.classList.toggle("on", x === b));
      rows();
    }));
  }

  /* ---------------- stratum locations ---------------- */
  function stratumTable(port) {
    const locs = C.stratumLocations || [];
    if (!locs.length) return "";
    return `<div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Location</th><th class="hide-sm">Region</th><th>Endpoint</th><th>Latency</th></tr></thead>
      <tbody>${locs.map((l, i) => {
        const ep = port ? `stratum+tcp://${l.host}:${port}` : l.host;
        return `<tr>
          <td><span class="coin">${flagImg(l.flag)}<span><b>${esc(l.country)}</b> <span class="muted" style="font-size:12px">${esc(l.city || "")}</span></span></span></td>
          <td class="hide-sm text-2">${esc(l.region || "")}</td>
          <td><span class="endpoint" data-copy="${esc(ep)}">${esc(ep)}${ICON.copy}</span></td>
          <td><span class="latency" data-ping="${i}"><span class="dot gray"></span><span class="muted">—</span></span></td>
        </tr>`;
      }).join("")}</tbody></table></div></div>`;
  }
  const pingCache = {};
  function runPings(root) {
    (C.stratumLocations || []).forEach(async (l, i) => {
      const el = $(`[data-ping="${i}"]`, root);
      if (!el || !l.pingUrl) return;
      const show = (ms) => { el.innerHTML = `<span class="dot ${ms < 120 ? "" : ms < 250 ? "amber" : "red"}"></span><b>${ms}</b> ms`; };
      if (pingCache[i] && Date.now() - pingCache[i].at < 60000) return show(pingCache[i].ms);
      try {
        const t0 = performance.now();
        await fetch(l.pingUrl + (l.pingUrl.includes("?") ? "&" : "?") + "_=" + Date.now(), { mode: "no-cors", cache: "no-store" });
        const ms = Math.round(performance.now() - t0);
        pingCache[i] = { ms, at: Date.now() };
        show(ms);
      } catch { el.innerHTML = '<span class="dot red"></span><span class="muted">unreachable</span>'; }
    });
  }

  /* ---------------- HOME ---------------- */
  async function pageHome(tok, quiet) {
    if (!quiet) loading();
    const [pools, blocks] = await Promise.all([loadPools(quiet), API.blocks(0, 8).catch(() => [])]);
    if (tok !== renderToken) return;
    const miners = pools.reduce((a, p) => a + (p.poolStats?.connectedMiners || 0), 0);
    const totalBlocks = pools.reduce((a, p) => a + (p.totalBlocks || 0), 0);
    const coins = new Set(pools.map((p) => p.coin?.symbol)).size;
    // hashrate per algorithm (summing different algorithms is meaningless)
    const byAlgo = {};
    pools.forEach((p) => { const a = p.coin?.algorithm || "other"; byAlgo[a] = (byAlgo[a] || 0) + (p.poolStats?.poolHashrate || 0); });
    const topAlgo = Object.entries(byAlgo).sort((a, b) => b[1] - a[1]);
    const top = [...pools].sort((a, b) => (b.poolStats?.poolHashrate || 0) / (b.networkStats?.networkHashrate || 1) - (a.poolStats?.poolHashrate || 0) / (a.networkStats?.networkHashrate || 1) || (b.poolStats?.connectedMiners || 0) - (a.poolStats?.connectedMiners || 0)).slice(0, 3);

    app.innerHTML = `
    <section class="hero"><div class="container hero-grid">
      <div>
        <div class="hero-logo">${brandMark()}<div><div class="name">${brandName()}</div><div class="tag">${esc(C.tagline || "")}</div></div></div>
        <p class="lead">${esc(C.description || "")}</p>
        <div class="hero-actions">
          <a href="#/connect" class="btn btn-primary">Start Mining ${ICON.arrow}</a>
          <a href="#/pools" class="btn">View Pools ${ICON.chev}</a>
          <a href="#/dashboard" class="btn btn-ghost">Miner Dashboard</a>
        </div>
        <div class="mini-stats">
          <div class="mini-stat"><div class="v">${F.num(miners)}</div><div class="l">Active Miners</div></div>
          <div class="mini-stat"><div class="v">${topAlgo.length ? F.hashrateHtml(topAlgo[0][1]) : "0"} <span class="dot" style="width:6px;height:6px"></span></div><div class="l">${esc(topAlgo[0]?.[0] || "Hashrate")}</div></div>
          <div class="mini-stat"><div class="v green">${F.num(totalBlocks)}</div><div class="l">Blocks Found</div></div>
        </div>
      </div>
      <div class="card glow live-card">
        <div class="live-card-title">Live Statistics <span class="dot"></span></div>
        <div class="live-card-sub">Live updates · Last: <span data-updated>${F.time(S.poolsAt)}</span></div>
        <div class="stat-grid">
          <div class="stat-box"><div class="v">${pools.length}</div><div class="l">Pools</div></div>
          <div class="stat-box"><div class="v">${F.num(miners)}</div><div class="l">Miners</div></div>
          <div class="stat-box"><div class="v">${coins}</div><div class="l">Coins</div></div>
          <div class="stat-box"><div class="v">${topAlgo.length}</div><div class="l">Algorithms</div></div>
        </div>
        ${topAlgo.length ? `<div class="list-head">Hashrate by algorithm</div>
          <div class="stat-grid" style="grid-template-columns:repeat(${Math.min(3, topAlgo.length)},1fr)">${topAlgo.slice(0, 3).map(([a, h]) => `<div class="stat-box" style="padding:10px 8px"><div class="v" style="font-size:16px">${F.hashrateHtml(h)}</div><div class="l">${esc(a)}</div></div>`).join("")}</div>` : ""}
        <div class="list-head">Top Pools <span class="muted">${pools.length} available</span></div>
        ${top.map((p, i) => `<a class="top-pool" href="#/pool/${encodeURIComponent(p.id)}">
          <span class="rank">${i + 1}</span>${F.coinIcon(p.coin, "sm")}
          <div class="meta"><div><b>${sym(p)}</b> ${schemeBadge(p)}</div><div>${esc(p.coin?.algorithm || "")}</div></div>
          <div class="vals"><b>${F.hashrate(p.poolStats?.poolHashrate)}</b><div>${F.num(p.poolStats?.connectedMiners)} miners</div></div></a>`).join("")}
        <a href="#/pools" class="btn btn-sm" style="width:100%;justify-content:center;margin-top:4px">Browse All Pools</a>
      </div>
    </div></section>

    ${(C.stratumLocations || []).length ? `<section class="section-sm"><div class="container" style="max-width:980px">
      <h2 class="section-title" style="margin-bottom:24px">Stratum Locations</h2>${stratumTable()}</div></section>` : ""}

    <section class="section"><div class="container">
      <h2 class="section-title" style="margin-bottom:28px">Available Mining Pools</h2>
      ${poolsTable()}
    </div></section>

    <hr class="divider container">
    <section class="section"><div class="container">
      <h2 class="section-title" style="margin-bottom:24px">Recent Blocks</h2>
      ${blocksTable(blocks, { showPool: true })}
      ${blocks.length ? '<div style="text-align:center;margin-top:16px"><a href="#/blocks" class="btn btn-sm">All blocks ' + ICON.chev + "</a></div>" : ""}
    </div></section>

    ${(C.partners || []).length ? `<section class="section"><div class="container">
      <h2 class="section-title">Mining Services &amp; Partners</h2>
      <p class="section-sub">Enhance your mining with trusted partners for rig rentals, marketplaces and mining tools.</p>
      <div class="partners">${C.partners.map((x) => `<a class="card partner" href="${esc(x.url || "#")}" target="_blank" rel="noopener">${x.logo ? `<img src="${esc(x.logo)}" alt="">` : ""}<b>${esc(x.name)}</b><span>${esc(x.text || "")}</span></a>`).join("")}</div>
    </div></section>` : ""}

    <section class="section"><div class="container">
      <div class="card glow cta">
        <h2>Ready to Start Mining?</h2>
        <p>Point your hardware at ${esc(C.name)} in under a minute and start earning.</p>
        <div class="hero-actions"><a href="#/connect" class="btn btn-primary">Connect Your Miners</a><a href="#/dashboard" class="btn">View Dashboard</a></div>
      </div>
    </div></section>`;
    bindPoolsTable(app);
    runPings(app);
  }

  /* ---------------- blocks table ---------------- */
  function blocksTable(blocks, { showPool = false, pageKey = null, pageCount = 0 } = {}) {
    if (!blocks.length) return `<div class="card"><div class="empty">No blocks have been found yet.</div></div>`;
    return `<div class="card"><div class="table-wrap"><table>
      <thead><tr>${showPool ? "<th>Pool</th>" : ""}<th class="num">Height</th><th>Found</th><th class="hide-sm">Miner</th><th class="num">Reward</th><th class="num">Effort</th><th>Status</th><th class="hide-sm">Hash</th></tr></thead>
      <tbody>${blocks.map((b) => {
        const p = poolById(b.poolId);
        return `<tr>
          ${showPool ? `<td>${p ? `<a href="#/pool/${encodeURIComponent(p.id)}" class="coin">${F.coinIcon(p.coin)}<span><b>${sym(p)}</b> ${schemeBadge(p)}</span></a>` : esc(b.poolId)}</td>` : ""}
          <td class="num">${extLink(b.infoLink, F.num(b.blockHeight))}</td>
          <td><span title="${esc(F.dateTime(b.created))}">${F.ago(b.created)}</span></td>
          <td class="hide-sm">${b.miner ? minerLink(b.poolId, b.miner, 6) : "—"}</td>
          <td class="num">${F.coin(b.reward)} <span class="muted">${p ? sym(p) : ""}</span></td>
          <td class="num">${effortHtml(b.effort)}</td>
          <td>${statusBadge(b)}</td>
          <td class="hide-sm"><span class="addr muted">${esc(F.shortAddr(b.hash, 6))}</span></td>
        </tr>`;
      }).join("")}</tbody></table></div>${pageKey ? pager(pageKey, pageCount) : ""}</div>`;
  }

  function paymentsTable(items, pool, { pageKey, pageCount, showAddr = true } = {}) {
    if (!items.length) return `<div class="card"><div class="empty">No payments yet.</div></div>`;
    return `<div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Date</th>${showAddr ? "<th>Address</th>" : ""}<th class="num">Amount</th><th>Transaction</th></tr></thead>
      <tbody>${items.map((x) => `<tr>
        <td><span title="${esc(F.dateTime(x.created))}">${F.dateTime(x.created)}</span></td>
        ${showAddr ? `<td>${minerLink(pool.id, x.address, 8)}</td>` : ""}
        <td class="num">${F.coin(x.amount)} <span class="muted">${esc(x.coin || sym(pool))}</span></td>
        <td>${extLink(x.transactionInfoLink, esc(F.shortAddr(x.transactionConfirmationData, 8)))}</td>
      </tr>`).join("")}</tbody></table></div>${pageKey ? pager(pageKey, pageCount) : ""}</div>`;
  }

  /* ---------------- POOLS ---------------- */
  async function pagePools(tok, quiet) {
    if (!quiet) loading();
    await loadPools(quiet);
    if (tok !== renderToken) return;
    app.innerHTML = `<div class="container">
      <div class="page-head"><h1>Mining Pools</h1><p>Every coin and payout scheme currently running on ${esc(C.name)}. Click a pool for stats, ports and payouts.</p></div>
      <div style="margin-top:24px">${poolsTable()}</div></div>`;
    bindPoolsTable(app);
  }

  /* ---------------- POOL DETAIL ---------------- */
  async function pagePool(tok, quiet, id) {
    if (!quiet) loading();
    const [pool, perf] = await Promise.all([API.pool(id), API.performance(id, S.chartRange, S.chartRange === "month" ? "day" : "hour").catch(() => [])]);
    await loadPools().catch(() => {});
    if (tok !== renderToken) return;
    if (!pool) { app.innerHTML = `<div class="container"><div class="error-box">Pool <b>${esc(id)}</b> was not found.</div></div>`; return; }
    const ps = pool.poolStats || {}, ns = pool.networkStats || {};
    const share = ns.networkHashrate ? (ps.poolHashrate / ns.networkHashrate) * 100 : 0;
    const pp = pool.paymentProcessing || {};
    const portsArr = Object.entries(pool.ports || {}).sort((a, b) => +a[0] - +b[0]);

    app.innerHTML = `<div class="container">
      <div class="page-head">
        <div class="crumbs"><a href="#/pools">Pools</a> / ${esc(pool.id)}</div>
        <h1>${F.coinIcon(pool.coin, "lg")} ${esc(poolName(pool))} <span class="muted" style="font-weight:500">${sym(pool)}</span> ${schemeBadge(pool)} <span class="badge">${esc(pool.coin?.algorithm || "")}</span></h1>
        <p>Pool fee ${F.pct(pool.poolFeePercent, 1)} · Minimum payout ${F.coin(pp.minimumPayment)} ${sym(pool)} · ${pp.enabled ? '<span class="green">Payments enabled</span>' : '<span class="red">Payments paused</span>'}</p>
      </div>
      <div class="kpis" style="margin-top:22px">
        <div class="kpi"><div class="l"><span class="dot"></span>Pool Hashrate</div><div class="v">${F.hashrateHtml(ps.poolHashrate)}</div><div class="s">${share ? share.toFixed(share < 1 ? 3 : 2) + "% of network" : "&nbsp;"}</div></div>
        <div class="kpi"><div class="l">Miners Online</div><div class="v">${F.num(ps.connectedMiners)}</div><div class="s">${F.num(ps.sharesPerSecond, 1)} shares/s</div></div>
        <div class="kpi"><div class="l">Network Hashrate</div><div class="v">${F.hashrateHtml(ns.networkHashrate)}</div><div class="s">Difficulty ${F.si(ns.networkDifficulty)}</div></div>
        <div class="kpi"><div class="l">Block Height</div><div class="v">${F.num(ns.blockHeight)}</div><div class="s">${ns.lastNetworkBlockTime ? "Network block " + F.ago(ns.lastNetworkBlockTime) : "&nbsp;"}</div></div>
        <div class="kpi"><div class="l">Current Effort</div><div class="v">${effortHtml(pool.poolEffort)}</div><div class="s">Since last pool block</div></div>
        <div class="kpi"><div class="l">Blocks Found</div><div class="v">${F.num(pool.totalBlocks)}</div><div class="s">${F.num(pool.totalConfirmedBlocks)} confirmed · ${F.num(pool.totalPendingBlocks)} pending</div></div>
        <div class="kpi"><div class="l">Last Pool Block</div><div class="v">${pool.lastPoolBlockTime ? F.ago(pool.lastPoolBlockTime) : "—"}</div><div class="s">Reward ${F.coin(pool.blockReward)} ${sym(pool)}</div></div>
        <div class="kpi"><div class="l">Total Paid</div><div class="v">${F.coin(pool.totalPaid)} <small>${sym(pool)}</small></div><div class="s">To miners, all time</div></div>
      </div>

      <div class="card" style="margin-top:16px">
        <form class="lookup card-pad" id="pool-lookup" style="align-items:center">
          <b style="margin-right:6px">Check your stats</b>
          <input class="field grow" name="addr" placeholder="Enter your ${sym(pool)} wallet address" autocomplete="off" spellcheck="false">
          <button class="btn btn-primary">Lookup ${ICON.arrow}</button>
        </form>
      </div>

      <div class="tabs" id="pool-tabs">
        ${["overview", "connect", "miners", "blocks", "payments"].map((t) => `<button class="tab ${S.poolTab === t ? "active" : ""}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
      </div>
      <div id="pool-tab"></div>
    </div>`;

    $("#pool-lookup").addEventListener("submit", (e) => {
      e.preventDefault();
      const a = e.target.addr.value.trim();
      if (a) location.hash = `#/miner/${encodeURIComponent(pool.id)}/${encodeURIComponent(a)}`;
    });
    $$("#pool-tabs .tab").forEach((b) => b.addEventListener("click", () => {
      S.poolTab = b.dataset.tab;
      $$("#pool-tabs .tab").forEach((x) => x.classList.toggle("active", x === b));
      renderPoolTab(pool, perf, portsArr);
    }));
    renderPoolTab(pool, perf, portsArr);
  }

  async function renderPoolTab(pool, perf, portsArr) {
    const el = $("#pool-tab");
    const tab = S.poolTab;
    const tok = renderToken;
    if (tab === "overview") {
      const pp = pool.paymentProcessing || {};
      el.innerHTML = `<div class="grid-3-1">
        <div class="card">
          <div class="card-head"><h3>Pool Hashrate</h3>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
              <div class="chart-legend"><span><i style="background:var(--accent)"></i>Hashrate</span><span><i style="background:var(--violet)"></i>Miners</span></div>
              <div class="seg">${["day", "month"].map((r) => `<button class="${S.chartRange === r ? "on" : ""}" data-range="${r}">${r === "day" ? "24h" : "30d"}</button>`).join("")}</div>
            </div></div>
          <div class="card-pad"><div id="pool-chart" style="height:300px"></div></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Pool Details</h3></div>
          <dl class="kv card-pad">
            <dt>Pool ID</dt><dd>${esc(pool.id)}</dd>
            <dt>Coin</dt><dd>${esc(pool.coin?.name)} (${sym(pool)})</dd>
            <dt>Algorithm</dt><dd>${esc(pool.coin?.algorithm || "—")}</dd>
            <dt>Payout scheme</dt><dd>${esc(F.scheme(pool))}</dd>
            ${pp.payoutSchemeConfig?.factor != null && F.scheme(pool) !== "SOLO" ? `<dt>PPLNS factor</dt><dd>${esc(pp.payoutSchemeConfig.factor)}</dd>` : ""}
            ${pp.payoutSchemeConfig?.blockFinderPercentage != null ? `<dt>Finder bonus</dt><dd>${esc(pp.payoutSchemeConfig.blockFinderPercentage)}%</dd>` : ""}
            <dt>Pool fee</dt><dd>${F.pct(pool.poolFeePercent, 2)}</dd>
            <dt>Minimum payout</dt><dd>${F.coin(pp.minimumPayment)} ${sym(pool)}</dd>
            <dt>Block reward</dt><dd>${F.coin(pool.blockReward)} ${sym(pool)}</dd>
            <dt>Network</dt><dd>${esc(pool.networkStats?.networkType || "—")}</dd>
            <dt>Peers</dt><dd>${F.num(pool.networkStats?.connectedPeers)}</dd>
            ${pool.address ? `<dt>Pool wallet</dt><dd>${extLink(pool.addressInfoLink, esc(F.shortAddr(pool.address, 6)))}</dd>` : ""}
            ${pool.coin?.website ? `<dt>Website</dt><dd><a href="${esc(pool.coin.website)}" target="_blank" rel="noopener" class="accent">${esc(pool.coin.website.replace(/^https?:\/\//, ""))}</a></dd>` : ""}
          </dl>
        </div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Top Miners</h3><span class="muted">Last 24 hours</span></div>${minersTable(pool, pool.topMiners || [])}</div>`;
      Charts.lineChart($("#pool-chart"), {
        series: [
          { name: "Hashrate", color: "#3b82f6", values: perf.map((d) => ({ t: +new Date(d.created), v: d.poolHashrate })) },
          { name: "Miners", color: "#a78bfa", axis: "right", area: false, values: perf.map((d) => ({ t: +new Date(d.created), v: d.connectedMiners })) }
        ],
        format: F.hashrate,
        formatRight: (v) => F.num(v)
      });
      $$("[data-range]", el).forEach((b) => b.addEventListener("click", async () => {
        S.chartRange = b.dataset.range;
        const p2 = await API.performance(pool.id, S.chartRange, S.chartRange === "month" ? "day" : "hour").catch(() => []);
        if (tok === renderToken) renderPoolTab(pool, p2, portsArr);
      }));
    } else if (tab === "connect") {
      el.innerHTML = connectBlock(pool, portsArr);
    } else if (tab === "miners") {
      el.innerHTML = '<div class="loading" style="padding:40px"><div class="spinner"></div></div>';
      const key = "miners:" + pool.id, page = S.pages[key] || 0;
      const miners = await API.miners(pool.id, page, 25).catch(() => []);
      if (tok !== renderToken) return;
      el.innerHTML = `<div class="card">${minersTable(pool, miners, page * 25)}
        <div class="pager"><button class="btn btn-sm" data-page="${key}" data-to="${page - 1}" ${page <= 0 ? "disabled" : ""}>Prev</button><span>Page ${page + 1}</span>
        <button class="btn btn-sm" data-page="${key}" data-to="${page + 1}" ${miners.length < 25 ? "disabled" : ""}>Next</button></div></div>`;
      bindPager(el, () => renderPoolTab(pool, perf, portsArr));
    } else if (tab === "blocks") {
      el.innerHTML = '<div class="loading" style="padding:40px"><div class="spinner"></div></div>';
      const key = "blocks:" + pool.id;
      const r = unpage(await API.poolBlocks(pool.id, S.pages[key] || 0, 20).catch(() => []));
      if (tok !== renderToken) return;
      el.innerHTML = blocksTable(r.items, { pageKey: key, pageCount: r.pageCount });
      bindPager(el, () => renderPoolTab(pool, perf, portsArr));
    } else if (tab === "payments") {
      el.innerHTML = '<div class="loading" style="padding:40px"><div class="spinner"></div></div>';
      const key = "payments:" + pool.id;
      const r = unpage(await API.poolPayments(pool.id, S.pages[key] || 0, 20).catch(() => []));
      if (tok !== renderToken) return;
      el.innerHTML = paymentsTable(r.items, pool, { pageKey: key, pageCount: r.pageCount });
      bindPager(el, () => renderPoolTab(pool, perf, portsArr));
    }
  }

  function minersTable(pool, miners, offset = 0) {
    if (!miners.length) return '<div class="empty">No active miners right now.</div>';
    const total = pool.poolStats?.poolHashrate || 0;
    return `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Miner</th><th class="num">Hashrate</th><th class="num hide-sm">Shares/s</th><th>Share of pool</th></tr></thead>
      <tbody>${miners.map((m, i) => {
        const pct = total ? (m.hashrate / total) * 100 : 0;
        return `<tr class="clickable" data-href="#/miner/${encodeURIComponent(pool.id)}/${encodeURIComponent(m.miner)}">
          <td class="muted">${offset + i + 1}</td><td>${minerLink(pool.id, m.miner, 10)}</td>
          <td class="num">${F.hashrate(m.hashrate)}</td><td class="num hide-sm text-2">${F.num(m.sharesPerSecond, 2)}</td>
          <td style="min-width:140px"><div style="display:flex;align-items:center;gap:10px"><div class="progress" style="flex:1"><i style="width:${Math.min(100, pct)}%"></i></div><span class="num muted" style="font-size:12px;width:48px;text-align:right">${pct.toFixed(1)}%</span></div></td>
        </tr>`;
      }).join("")}</tbody></table></div>`;
  }

  function connectBlock(pool, portsArr) {
    const host = C.stratumLocations?.[0]?.host || location.hostname || "your-pool-host";
    const firstPort = portsArr[0]?.[0];
    return `<div class="grid-3-1">
      <div class="stack">
        <div class="card"><div class="card-head"><h3>Stratum Ports</h3><span class="muted">${portsArr.length} port${portsArr.length === 1 ? "" : "s"}</span></div>
          ${portsArr.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Port</th><th>Description</th><th class="num">Start Diff</th><th class="num hide-sm">VarDiff Range</th><th>Security</th></tr></thead>
            <tbody>${portsArr.map(([port, e]) => `<tr>
              <td><span class="endpoint" data-copy="${esc(port)}">${esc(port)}${ICON.copy}</span></td>
              <td>${esc(e.name || "—")}</td>
              <td class="num">${F.si(e.difficulty)}</td>
              <td class="num hide-sm text-2">${e.varDiff ? `${F.si(e.varDiff.minDiff)} – ${e.varDiff.maxDiff ? F.si(e.varDiff.maxDiff) : "∞"}` : "Fixed"}</td>
              <td>${e.tls ? '<span class="badge green">TLS</span>' : '<span class="badge">TCP</span>'}</td>
            </tr>`).join("")}</tbody></table></div>` : '<div class="empty">No ports published.</div>'}
        </div>
        ${(C.stratumLocations || []).length ? `<div><h3 style="margin:8px 0 12px;font-size:15px">Servers</h3>${stratumTable(firstPort)}</div>` : ""}
      </div>
      <div class="card"><div class="card-head"><h3>Miner Configuration</h3></div>
        <div class="card-pad stack" style="gap:12px">
          <dl class="kv"><dt>URL</dt><dd>stratum+${portsArr[0]?.[1]?.tls ? "ssl" : "tcp"}://${esc(host)}:${esc(firstPort || "PORT")}</dd>
            <dt>Username</dt><dd>WALLET.worker</dd><dt>Password</dt><dd>x</dd></dl>
          <div class="codebox"><span class="k">-o</span> stratum+tcp://${esc(host)}:${esc(firstPort || "PORT")}
<span class="k">-u</span> YOUR_${sym(pool)}_ADDRESS.rig01
<span class="k">-p</span> x</div>
          <p class="muted" style="margin:0;font-size:13px">Use your ${esc(pool.coin?.name)} payout address as the username. Add <code>.name</code> to tell rigs apart on your dashboard.</p>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- MINER ---------------- */
  async function pageMiner(tok, quiet, id, addr) {
    if (!quiet) loading();
    const [pool, stats] = await Promise.all([
      loadPools().then(() => poolById(id) || API.pool(id)),
      API.miner(id, addr).catch((e) => (e.status === 400 || e.status === 404 ? null : Promise.reject(e)))
    ]);
    if (tok !== renderToken) return;
    if (!pool) { app.innerHTML = `<div class="container"><div class="error-box">Pool <b>${esc(id)}</b> was not found.</div></div>`; return; }
    // remember recent lookups
    const recent = store.get("recentMiners", []).filter((r) => !(r.pool === id && r.addr === addr));
    recent.unshift({ pool: id, addr, at: Date.now() });
    store.set("recentMiners", recent.slice(0, 6));

    const head = `<div class="page-head">
      <div class="crumbs"><a href="#/dashboard">Dashboard</a> / <a href="#/pool/${encodeURIComponent(pool.id)}">${esc(pool.id)}</a></div>
      <h1>${F.coinIcon(pool.coin, "lg")} Miner ${schemeBadge(pool)}</h1>
      <p class="addr" style="overflow-wrap:anywhere;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${esc(addr)} <span class="endpoint" data-copy="${esc(addr)}" style="padding:2px 6px">${ICON.copy}</span></p></div>`;

    if (!stats) {
      app.innerHTML = `<div class="container">${head}<div class="card cta" style="margin-top:24px"><h2>No data for this address yet</h2>
        <p>We haven't received shares from this address on the ${esc(poolName(pool))} ${esc(F.scheme(pool))} pool. Stats appear a few minutes after your miner connects.</p>
        <div class="hero-actions"><a class="btn btn-primary" href="#/pool/${encodeURIComponent(pool.id)}">Connection details</a><a class="btn" href="#/dashboard">Try another address</a></div></div></div>`;
      return;
    }

    const workers = Object.entries(stats.performance?.workers || {});
    const hr = workers.reduce((a, [, w]) => a + (w.hashrate || 0), 0);
    const samples = (stats.performanceSamples || []).map((s) => ({ t: +new Date(s.created), v: Object.values(s.workers || {}).reduce((a, w) => a + (w.hashrate || 0), 0) }));
    const avg = samples.length ? samples.reduce((a, s) => a + s.v, 0) / samples.length : 0;
    const minPay = pool.paymentProcessing?.minimumPayment || 0;
    const progress = minPay ? Math.min(100, (stats.pendingBalance / minPay) * 100) : 0;

    app.innerHTML = `<div class="container">${head}
      <div class="kpis" style="margin-top:22px">
        <div class="kpi"><div class="l"><span class="dot ${hr ? "" : "red"}"></span>Current Hashrate</div><div class="v">${F.hashrateHtml(hr)}</div><div class="s">24h avg ${F.hashrate(avg)}</div></div>
        <div class="kpi"><div class="l">Workers Online</div><div class="v">${workers.length}</div><div class="s">${stats.performance?.created ? "Updated " + F.ago(stats.performance.created) : "&nbsp;"}</div></div>
        <div class="kpi"><div class="l">Pending Balance</div><div class="v">${F.coin(stats.pendingBalance)} <small>${sym(pool)}</small></div>
          <div class="s" style="display:flex;align-items:center;gap:8px"><div class="progress green" style="flex:1"><i style="width:${progress}%"></i></div>${progress.toFixed(0)}% of ${F.coin(minPay)}</div></div>
        <div class="kpi"><div class="l">Total Paid</div><div class="v">${F.coin(stats.totalPaid)} <small>${sym(pool)}</small></div><div class="s">Today ${F.coin(stats.todayPaid)} ${sym(pool)}</div></div>
        <div class="kpi"><div class="l">Last Payment</div><div class="v">${stats.lastPayment ? F.ago(stats.lastPayment) : "—"}</div><div class="s">${stats.lastPaymentLink ? extLink(stats.lastPaymentLink, "View transaction") : "&nbsp;"}</div></div>
        <div class="kpi"><div class="l">Pending Shares</div><div class="v">${F.si(stats.pendingShares)}</div><div class="s">Current round</div></div>
        <div class="kpi"><div class="l">Your Effort</div><div class="v">${effortHtml(stats.minerEffort)}</div><div class="s">Since last pool block</div></div>
        <div class="kpi"><div class="l">Blocks Found</div><div class="v">${F.num(stats.totalConfirmedBlocks)}</div><div class="s">${F.num(stats.totalPendingBlocks)} pending</div></div>
      </div>

      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Hashrate</h3><div class="chart-legend"><span><i style="background:var(--accent)"></i>Hashrate</span><span><i style="background:var(--muted)"></i>24h average</span></div></div>
        <div class="card-pad"><div id="miner-chart" style="height:250px"></div></div></div>

      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Workers</h3><span class="muted">${workers.length} online</span></div>
        ${workers.length ? `<div class="table-wrap"><table><thead><tr><th>Worker</th><th class="num">Hashrate</th><th class="num">Shares/s</th><th>Share</th></tr></thead><tbody>
        ${workers.sort((a, b) => b[1].hashrate - a[1].hashrate).map(([n, w]) => {
          const pct = hr ? (w.hashrate / hr) * 100 : 0;
          return `<tr><td><span class="coin"><span class="dot ${w.hashrate ? "" : "red"}"></span><b>${esc(n || "default")}</b></span></td><td class="num">${F.hashrate(w.hashrate)}</td><td class="num text-2">${F.num(w.sharesPerSecond, 3)}</td>
            <td style="min-width:120px"><div class="progress"><i style="width:${pct}%"></i></div></td></tr>`;
        }).join("")}</tbody></table></div>` : '<div class="empty">No workers online.</div>'}
      </div>

      <div class="tabs" id="miner-tabs">${["payments", "earnings", "blocks"].map((t) => `<button class="tab ${S.minerTab === t ? "active" : ""}" data-tab="${t}">${{ payments: "Payments", earnings: "Daily Earnings", blocks: "Blocks Found" }[t]}</button>`).join("")}</div>
      <div id="miner-tab"></div>
    </div>`;

    Charts.lineChart($("#miner-chart"), {
      series: [
        { name: "Hashrate", color: "#3b82f6", values: samples },
        { name: "24h avg", color: "#7c7c85", area: false, dash: true, values: samples.length ? [{ t: samples[0].t, v: avg }, { t: samples[samples.length - 1].t, v: avg }] : [] }
      ],
      format: F.hashrate
    });
    $$("#miner-tabs .tab").forEach((b) => b.addEventListener("click", () => {
      S.minerTab = b.dataset.tab;
      $$("#miner-tabs .tab").forEach((x) => x.classList.toggle("active", x === b));
      renderMinerTab(pool, addr);
    }));
    renderMinerTab(pool, addr);
  }

  async function renderMinerTab(pool, addr) {
    const el = $("#miner-tab");
    const tok = renderToken;
    el.innerHTML = '<div class="loading" style="padding:40px"><div class="spinner"></div></div>';
    const key = `m-${S.minerTab}:${pool.id}:${addr}`;
    const page = S.pages[key] || 0;
    const rerender = () => renderMinerTab(pool, addr);
    if (S.minerTab === "payments") {
      const r = unpage(await API.minerPayments(pool.id, addr, page, 15).catch(() => []));
      if (tok !== renderToken) return;
      el.innerHTML = paymentsTable(r.items, pool, { pageKey: key, pageCount: r.pageCount, showAddr: false });
    } else if (S.minerTab === "earnings") {
      const r = unpage(await API.minerEarnings(pool.id, addr, page, 30).catch(() => []));
      if (tok !== renderToken) return;
      el.innerHTML = r.items.length ? `<div class="card"><div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Amount</th></tr></thead><tbody>
        ${r.items.map((x) => `<tr><td>${new Date(x.date).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</td><td class="num">${F.coin(x.amount)} <span class="muted">${sym(pool)}</span></td></tr>`).join("")}
        </tbody></table></div>${pager(key, r.pageCount)}</div>` : '<div class="card"><div class="empty">No earnings recorded yet.</div></div>';
    } else {
      const r = unpage(await API.minerBlocks(pool.id, addr, page, 15).catch(() => []));
      if (tok !== renderToken) return;
      el.innerHTML = blocksTable(r.items, { pageKey: key, pageCount: r.pageCount });
    }
    bindPager(el, rerender);
  }

  /* ---------------- DASHBOARD (lookup) ---------------- */
  async function pageDashboard(tok, quiet) {
    if (quiet) return;
    loading();
    const pools = await loadPools();
    if (tok !== renderToken) return;
    const recent = store.get("recentMiners", []).filter((r) => poolById(r.pool));
    app.innerHTML = `<div class="container" style="max-width:860px">
      <div class="page-head" style="text-align:center;padding-top:56px"><h1 style="justify-content:center">Miner Dashboard</h1><p>Enter your wallet address to see hashrate, workers, balance and payouts.</p></div>
      <div class="card glow" style="margin-top:28px"><form class="lookup card-pad" id="dash-form">
        <select class="field" name="pool" style="flex:0 1 240px">
          <option value="__auto">Search all pools</option>
          ${pools.map((p) => `<option value="${esc(p.id)}">${esc(p.coin?.symbol)} · ${esc(F.scheme(p))} — ${esc(poolName(p))}</option>`).join("")}
        </select>
        <input class="field grow" name="addr" placeholder="Wallet address" autocomplete="off" spellcheck="false" required>
        <button class="btn btn-primary">Open dashboard ${ICON.arrow}</button>
      </form><div id="dash-msg" class="muted" style="padding:0 20px 16px;font-size:13px" hidden></div></div>
      ${recent.length ? `<h3 style="margin:32px 0 12px;font-size:15px">Recent lookups</h3><div class="stack" style="gap:8px">
        ${recent.map((r) => { const p = poolById(r.pool); return `<a class="top-pool" href="#/miner/${encodeURIComponent(r.pool)}/${encodeURIComponent(r.addr)}">${F.coinIcon(p.coin)}<div class="meta"><div><b>${sym(p)}</b> ${schemeBadge(p)}</div><div class="addr">${esc(F.shortAddr(r.addr, 12))}</div></div><div class="vals"><div>${F.ago(r.at)}</div></div></a>`; }).join("")}
      </div>` : ""}
    </div>`;
    $("#dash-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const addr = e.target.addr.value.trim();
      const pid = e.target.pool.value;
      if (!addr) return;
      if (pid !== "__auto") { location.hash = `#/miner/${encodeURIComponent(pid)}/${encodeURIComponent(addr)}`; return; }
      const msg = $("#dash-msg");
      msg.hidden = false;
      msg.textContent = `Searching ${pools.length} pools…`;
      const found = (await Promise.all(pools.map((p) => API.miner(p.id, addr).then((s) => (s ? p : null)).catch(() => null)))).filter(Boolean);
      if (found.length === 1) location.hash = `#/miner/${encodeURIComponent(found[0].id)}/${encodeURIComponent(addr)}`;
      else if (found.length > 1) msg.innerHTML = `Found on ${found.length} pools: ${found.map((p) => `<a class="accent" href="#/miner/${encodeURIComponent(p.id)}/${encodeURIComponent(addr)}">${esc(p.coin?.symbol)} ${esc(F.scheme(p))}</a>`).join(" · ")}`;
      else msg.textContent = "No stats found for that address on any pool. If you just started mining, give it a few minutes.";
    });
  }

  /* ---------------- BLOCKS ---------------- */
  async function pageBlocks(tok, quiet) {
    if (!quiet) loading();
    const pools = await loadPools(quiet);
    const pid = S.blocksPool;
    const key = "blocks-all:" + pid;
    const page = S.pages[key] || 0;
    let items, pageCount = 0;
    if (pid === "all") { items = await API.blocks(page, 25); }
    else { const r = unpage(await API.poolBlocks(pid, page, 25)); items = r.items; pageCount = r.pageCount; }
    if (tok !== renderToken) return;
    const confirmed = pools.reduce((a, p) => a + (p.totalConfirmedBlocks || 0), 0);
    const pending = pools.reduce((a, p) => a + (p.totalPendingBlocks || 0), 0);
    app.innerHTML = `<div class="container">
      <div class="page-head"><h1>Blocks</h1><p>${F.num(confirmed)} confirmed and ${F.num(pending)} pending blocks across all pools.</p></div>
      <div class="toolbar" style="margin-top:20px">
        <select class="field" id="blocks-pool" style="min-width:240px"><option value="all">All pools</option>${pools.map((p) => `<option value="${esc(p.id)}" ${p.id === pid ? "selected" : ""}>${esc(p.coin?.symbol)} · ${esc(F.scheme(p))}</option>`).join("")}</select>
        <span class="live-label">${ICON.wifi}Updated ${F.time()}</span>
      </div>
      ${blocksTable(items, { showPool: pid === "all", pageKey: key, pageCount: pid === "all" ? (items.length === 25 ? page + 2 : page + 1) : pageCount })}
    </div>`;
    $("#blocks-pool").addEventListener("change", (e) => { S.blocksPool = e.target.value; route(); });
    bindPager(app, () => route());
  }

  /* ---------------- CONNECT ---------------- */
  async function pageConnect(tok, quiet, id) {
    if (quiet) return;
    loading();
    const pools = await loadPools();
    if (tok !== renderToken) return;
    const pool = poolById(id) || pools[0];
    app.innerHTML = `<div class="container">
      <div class="page-head"><h1>Start Mining</h1><p>Three steps and your hardware is earning on ${esc(C.name)}.</p></div>
      <div class="grid-2" style="margin-top:24px;align-items:start">
        <div class="card card-pad"><div class="steps">
          <div class="step"><div><h4>Choose a pool</h4><p>Pick your coin and payout style — PPLNS for steady payouts, SOLO to keep the whole block reward.</p></div></div>
          <div class="step"><div><h4>Point your miner at us</h4><p>Use a stratum URL below with your wallet address as the username and any password.</p></div></div>
          <div class="step"><div><h4>Watch your dashboard</h4><p>Your hashrate shows up within minutes. Payouts are automatic once you reach the minimum.</p></div></div>
        </div></div>
        <div class="card card-pad">
          <label class="muted" style="font-size:13px;display:block;margin-bottom:8px">Pool</label>
          <select class="field" id="connect-pool" style="width:100%">${pools.map((p) => `<option value="${esc(p.id)}" ${p.id === pool?.id ? "selected" : ""}>${esc(poolName(p))} (${esc(p.coin?.symbol)}) · ${esc(F.scheme(p))} · ${esc(p.coin?.algorithm || "")}</option>`).join("")}</select>
          ${pool ? `<dl class="kv" style="margin-top:18px">
            <dt>Algorithm</dt><dd>${esc(pool.coin?.algorithm || "—")}</dd>
            <dt>Fee</dt><dd>${F.pct(pool.poolFeePercent, 1)}</dd>
            <dt>Minimum payout</dt><dd>${F.coin(pool.paymentProcessing?.minimumPayment)} ${sym(pool)}</dd>
            <dt>Miners online</dt><dd>${F.num(pool.poolStats?.connectedMiners)}</dd></dl>` : ""}
        </div>
      </div>
      <div style="margin-top:24px">${pool ? connectBlock(pool, Object.entries(pool.ports || {}).sort((a, b) => +a[0] - +b[0])) : '<div class="empty">No pools configured.</div>'}</div>
    </div>`;
    $("#connect-pool")?.addEventListener("change", (e) => { location.hash = `#/connect/${encodeURIComponent(e.target.value)}`; });
    runPings(app);
  }

  /* ---------------- FAQ / API ---------------- */
  function pageFaq() {
    app.innerHTML = `<div class="container" style="max-width:820px">
      <div class="page-head"><h1>Frequently Asked Questions</h1><p>Can't find your answer? ${C.links?.support ? `<a class="accent" href="${esc(C.links.support)}">Contact support</a>.` : C.links?.telegram ? `<a class="accent" href="${esc(C.links.telegram)}" target="_blank" rel="noopener">Ask on Telegram</a>.` : ""}</p></div>
      <div style="margin-top:20px">${(C.faq || []).map((f, i) => `<details class="faq-item" ${i === 0 ? "open" : ""}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div></div>`;
  }
  function pageApi() {
    const eps = [
      ["GET", "/pools", "All pools with live stats"],
      ["GET", "/pools/{poolId}", "Single pool"],
      ["GET", "/pools/{poolId}/performance?r=day&i=hour", "Pool hashrate history"],
      ["GET", "/pools/{poolId}/miners?page=0&pageSize=15", "Top miners"],
      ["GET", "/v2/pools/{poolId}/blocks?page=0&pageSize=15", "Pool blocks (paged)"],
      ["GET", "/v2/pools/{poolId}/payments?page=0&pageSize=15", "Pool payments (paged)"],
      ["GET", "/pools/{poolId}/miners/{address}", "Miner stats & workers"],
      ["GET", "/v2/pools/{poolId}/miners/{address}/payments", "Miner payments (paged)"],
      ["GET", "/v2/pools/{poolId}/miners/{address}/earnings/daily", "Miner daily earnings"],
      ["GET", "/pools/{poolId}/miners/{address}/performance?mode=day", "Miner hashrate history"],
      ["GET", "/blocks?page=0&pageSize=15", "Blocks across all pools"]
    ];
    const abs = new URL(API.base, location.href).href.replace(/\/$/, "");
    app.innerHTML = `<div class="container" style="max-width:960px">
      <div class="page-head"><h1>Public API</h1><p>Everything on this site comes from our public JSON API. Base URL: <span class="endpoint" data-copy="${esc(abs)}">${esc(abs)}${ICON.copy}</span></p></div>
      <div class="card" style="margin-top:24px"><div class="table-wrap"><table><thead><tr><th>Method</th><th>Endpoint</th><th class="hide-sm">Description</th></tr></thead><tbody>
      ${eps.map(([m, p, d]) => `<tr><td><span class="badge green">${m}</span></td><td class="addr">${esc(p)}</td><td class="hide-sm text-2">${esc(d)}</td></tr>`).join("")}
      </tbody></table></div></div>
      <p class="muted" style="font-size:13px;margin-top:14px">Real-time events (blocks found, payments) are pushed over WebSocket at <code>${esc(API.wsUrl() || "/notifications")}</code>.</p></div>`;
  }

  /* ---------------- router ---------------- */
  const routes = [
    [/^\/?$/, pageHome, "home"],
    [/^\/pools\/?$/, pagePools, "pools"],
    [/^\/pool\/([^/]+)\/?$/, pagePool, "pools"],
    [/^\/miner\/([^/]+)\/([^/]+)\/?$/, pageMiner, "dashboard"],
    [/^\/dashboard\/?$/, pageDashboard, "dashboard"],
    [/^\/blocks\/?$/, pageBlocks, "blocks"],
    [/^\/connect(?:\/([^/]+))?\/?$/, pageConnect, "connect"],
    [/^\/faq\/?$/, pageFaq, "faq"],
    [/^\/api\/?$/, pageApi, "api"]
  ];
  let lastPath = null;

  // Per-route <title> and meta description (search engines and browser tabs)
  const BASE_TITLE = document.title;
  const metaDesc = document.querySelector('meta[name="description"]');
  const BASE_DESC = metaDesc ? metaDesc.content : "";
  function setMeta(nav, path, args) {
    const p = (nav === "pools" || nav === "connect") && args[0] ? poolById(args[0]) : null;
    const coin = p ? `${p.coin?.name || p.coin?.symbol || p.id} ${F.scheme(p)}` : "";
    const t = {
      pools: p ? `${coin} Pool – Stats & Blocks` : "Mining Pools",
      connect: p ? `How to Mine ${coin}` : "Connect Your Miner",
      dashboard: path.startsWith("/miner/") ? "Miner Stats" : "Miner Dashboard",
      blocks: "Recent Blocks", faq: "FAQ", api: "API"
    }[nav];
    document.title = t ? `${t} | ${C.name}` : BASE_TITLE;
    if (metaDesc) metaDesc.content = p ? `Mine ${coin} on ${C.name}: stratum ports, ${p.poolFeePercent ?? 0}% fee, live hashrate, miners and blocks.` : BASE_DESC;
  }

  async function route(quiet = false) {
    const path = decodeURI(location.hash.replace(/^#/, "") || "/");
    const match = routes.find(([re]) => re.test(path)) || routes[0];
    const args = (path.match(match[0]) || []).slice(1).map((a) => (a ? decodeURIComponent(a) : a));
    const tok = quiet ? renderToken : ++renderToken;
    if (!quiet && path !== lastPath) window.scrollTo(0, 0);
    lastPath = path;
    $$("#mainnav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === match[2]));
    try { await match[1](tok, quiet, ...args); if (tok === renderToken) setMeta(match[2], path, args); }
    catch (e) { console.error(e); if (!quiet && tok === renderToken) errorView(e); }
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.hidden) return;
      const a = document.activeElement;
      if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return; // don't disrupt typing
      if ($(".chart-tip:not([hidden])")) return; // or hovering a chart
      const y = window.scrollY;
      route(true).then(() => window.scrollTo(0, y));
    }, Math.max(10, C.refreshSeconds || 30) * 1000);
  }

  /* ---------------- websocket notifications ---------------- */
  function connectWs(delay = 1000) {
    const url = API.wsUrl();
    if (!url || API.isDemo || !("WebSocket" in window)) return;
    let ws;
    try { ws = new WebSocket(url); } catch { return; }
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      const p = poolById(m.poolId);
      const s = m.symbol || p?.coin?.symbol || "";
      if (m.type === "blockfound") { toast(`🎉 ${s} block found!`, `Height ${F.num(m.blockHeight)}${p ? ` on ${F.scheme(p)}` : ""}${m.miner ? ` by ${F.shortAddr(m.miner, 6)}` : ""}`, "green"); S.poolsAt = 0; route(true); }
      else if (m.type === "blockunlocked") toast(`${s} block ${F.num(m.blockHeight)} ${m.status === "orphaned" ? "orphaned" : "confirmed"}`, "");
      else if (m.type === "payment") toast(`${s} payout sent`, m.amount ? `${F.coin(m.amount)} ${s} to ${m.recpientsCount || m.recipientsCount || ""} miners` : "");
    };
    ws.onclose = () => setTimeout(() => connectWs(Math.min(delay * 2, 60000)), delay);
    ws.onopen = () => { delay = 1000; };
  }

  /* ---------------- boot ---------------- */
  initChrome();
  window.addEventListener("hashchange", () => route());
  route().then(() => { scheduleRefresh(); connectWs(); });
})();

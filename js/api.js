/* Miningcore API client (+ optional demo data) */
(function () {
  const C = window.POOL_CONFIG;
  const base = (C.apiBase || "/api").replace(/\/$/, "");
  let demo = false;
  let everOk = false;
  const listeners = new Set();

  async function get(path, { timeout = 12000 } = {}) {
    if (demo) return Demo.route(path);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(base + path, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (!res.ok) {
        const err = new Error(`API ${res.status} on ${path}`);
        err.status = res.status;
        throw err;
      }
      everOk = true;
      setStatus("on");
      // Miningcore answers 204 (no body) when it has no data, e.g. an unknown miner
      if (res.status === 204) return null;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) throw new Error(`API at ${base} did not return JSON for ${path}`);
      const data = await res.json();
      everOk = true;
      setStatus("on");
      return data;
    } catch (e) {
      if (!everOk && C.demoFallback === true) {
        demo = true;
        setStatus("demo");
        return Demo.route(path);
      }
      if (!e.status) setStatus("off");
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  function setStatus(s) { listeners.forEach((fn) => fn(s)); }
  const cap = (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase();

  const api = {
    base,
    get isDemo() { return demo; },
    onStatus: (fn) => listeners.add(fn),
    pools: () => get("/pools").then((r) => r.pools || []),
    pool: (id) => get(`/pools/${encodeURIComponent(id)}`).then((r) => r.pool),
    // Miningcore binds these enums case-sensitively: it accepts "Day"/"Month"/"Hour" but rejects "day" with HTTP 400
    performance: (id, r = "day", i = "hour") => get(`/pools/${encodeURIComponent(id)}/performance?r=${cap(r)}&i=${cap(i)}`).then((x) => x.stats || []),
    miners: (id, page = 0, pageSize = 25) => get(`/pools/${encodeURIComponent(id)}/miners?page=${page}&pageSize=${pageSize}`),
    blocks: (page = 0, pageSize = 15) => get(`/blocks?page=${page}&pageSize=${pageSize}`),
    poolBlocks: (id, page = 0, pageSize = 15) => get(`/v2/pools/${encodeURIComponent(id)}/blocks?page=${page}&pageSize=${pageSize}`),
    poolPayments: (id, page = 0, pageSize = 15) => get(`/v2/pools/${encodeURIComponent(id)}/payments?page=${page}&pageSize=${pageSize}`),
    miner: (id, addr, perfMode = "day") => get(`/pools/${encodeURIComponent(id)}/miners/${encodeURIComponent(addr)}?perfMode=${cap(perfMode)}`),
    minerPayments: (id, addr, page = 0, pageSize = 15) => get(`/v2/pools/${encodeURIComponent(id)}/miners/${encodeURIComponent(addr)}/payments?page=${page}&pageSize=${pageSize}`),
    minerBlocks: (id, addr, page = 0, pageSize = 15) => get(`/v2/pools/${encodeURIComponent(id)}/miners/${encodeURIComponent(addr)}/blocks?page=${page}&pageSize=${pageSize}`),
    minerEarnings: (id, addr, page = 0, pageSize = 30) => get(`/v2/pools/${encodeURIComponent(id)}/miners/${encodeURIComponent(addr)}/earnings/daily?page=${page}&pageSize=${pageSize}`),
    minerBalanceChanges: (id, addr, page = 0, pageSize = 15) => get(`/v2/pools/${encodeURIComponent(id)}/miners/${encodeURIComponent(addr)}/balancechanges?page=${page}&pageSize=${pageSize}`),

    wsUrl() {
      if (C.wsUrl) return C.wsUrl;
      try {
        const u = new URL(base, location.href);
        return `${u.protocol === "https:" ? "wss" : "ws"}://${u.host}/notifications`;
      } catch { return null; }
    }
  };

  /* ------------------------------------------------------------------ */
  /* Demo data — only used when demoFallback is true and the API is down */
  /* ------------------------------------------------------------------ */
  const Demo = (() => {
    const now = Date.now();
    const H = 3600e3;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    const coins = [
      { id: "btc", name: "Bitcoin", symbol: "BTC", algorithm: "SHA256d", family: "bitcoin", hr: 4.2e17, net: 6.9e20, diff: 1.27e14, height: 921842, reward: 3.125, blockTime: 600 },
      { id: "bch", name: "Bitcoin Cash", symbol: "BCH", algorithm: "SHA256d", family: "bitcoin", hr: 8.1e16, net: 4.4e18, diff: 6.1e11, height: 921505, reward: 3.125, blockTime: 600 },
      { id: "ltc", name: "Litecoin", symbol: "LTC", algorithm: "Scrypt", family: "bitcoin", hr: 3.6e13, net: 2.6e15, diff: 9.7e7, height: 2972310, reward: 6.25, blockTime: 150 },
      { id: "doge", name: "Dogecoin", symbol: "DOGE", algorithm: "Scrypt", family: "bitcoin", hr: 3.1e13, net: 2.4e15, diff: 4.1e7, height: 5893122, reward: 10000, blockTime: 60 },
      { id: "fb", name: "Fractal Bitcoin", symbol: "FB", algorithm: "SHA256d", family: "bitcoin", hr: 2.2e16, net: 6.0e17, diff: 3.1e10, height: 1031220, reward: 25, blockTime: 30 },
      { id: "kas", name: "Kaspa", symbol: "KAS", algorithm: "kHeavyHash", family: "kaspa", hr: 6.4e14, net: 1.1e18, diff: 5.3e14, height: 113002113, reward: 4.36, blockTime: 1 }
    ];
    const ports = (base, diff) => ({
      [base]: { listenAddress: "0.0.0.0", name: "Low difficulty", difficulty: diff, varDiff: { minDiff: diff / 4, maxDiff: diff * 64, targetTime: 15, retargetTime: 90, variancePercent: 30 } },
      [base + 10]: { listenAddress: "0.0.0.0", name: "High difficulty (ASIC / rental)", difficulty: diff * 64, varDiff: { minDiff: diff * 16, maxDiff: null, targetTime: 15, retargetTime: 90, variancePercent: 30 } },
      [base + 20]: { listenAddress: "0.0.0.0", name: "TLS", difficulty: diff * 8, tls: true, tlsAuto: true, varDiff: { minDiff: diff, maxDiff: null, targetTime: 15, retargetTime: 90, variancePercent: 30 } }
    });
    const addrs = ["bc1qx9t2l3pd5dq7m6kqyq8r2gq5h7k4c9u0wls0e4", "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el", "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h",
      "bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6", "bc1qjasf9z3h7w3jspkhtgatgpyvvzgpa2wwd2lr0e", "bc1q4c8n5t00jmj8temxdgcc3t32nkg2wjwz24lywv",
      "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"];

    const pools = [];
    let port = 3032;
    coins.forEach((c) => {
      ["pplns", "solo"].forEach((sch) => {
        const share = sch === "solo" ? 0.35 : 0.65;
        const hr = c.hr * share * (0.85 + rnd() * 0.3);
        const miners = Math.round((sch === "solo" ? 180 : 640) * (c.hr / 4.2e17) ** 0.25 + rnd() * 40);
        const blocks = Math.round((sch === "solo" ? 3 : 40) * (600 / c.blockTime) ** 0.5 + rnd() * 10);
        pools.push({
          id: `${c.id}-${sch}`,
          coin: { type: c.family === "bitcoin" ? "BTC" : c.family.toUpperCase(), name: c.name, symbol: c.symbol, family: c.family, algorithm: c.algorithm, website: "https://example.org" },
          ports: ports(port, c.algorithm === "Scrypt" ? 65536 : c.algorithm === "SHA256d" ? 16384 : 1),
          paymentProcessing: { enabled: true, minimumPayment: c.symbol === "DOGE" ? 50 : c.symbol === "KAS" ? 10 : 0.001, payoutScheme: sch.toUpperCase() },
          clientConnectionTimeout: 600, jobRebroadcastTimeout: 10, blockRefreshInterval: 500,
          poolFeePercent: sch === "solo" ? 1.0 : 1.5,
          address: addrs[pools.length % addrs.length], addressInfoLink: "#",
          poolStats: { connectedMiners: miners, poolHashrate: hr, sharesPerSecond: 40 + rnd() * 400 },
          networkStats: { networkType: "Main", networkHashrate: c.net, networkDifficulty: c.diff, lastNetworkBlockTime: new Date(now - rnd() * c.blockTime * 1000).toISOString(), blockHeight: c.height, connectedPeers: 40 + Math.round(rnd() * 80), rewardType: "POW" },
          topMiners: [],
          totalPaid: blocks * c.reward * 0.9 * (sch === "solo" ? 1 : 0.95),
          totalBlocks: blocks, totalConfirmedBlocks: blocks - 2, totalPendingBlocks: 2,
          blockReward: c.reward, lastPoolBlockTime: new Date(now - rnd() * 30 * H).toISOString(),
          poolEffort: 0.2 + rnd() * 1.2,
          _blockTime: c.blockTime
        });
        port += 1;
      });
      port = Math.ceil(port / 1000) * 1000 + 32;
    });
    pools.forEach((p) => {
      const n = Math.min(15, p.poolStats.connectedMiners);
      let left = p.poolStats.poolHashrate;
      p.topMiners = Array.from({ length: n }, (_, i) => {
        const h = left * (0.18 + rnd() * 0.12);
        left -= h;
        return { miner: addrs[(i + pools.indexOf(p)) % addrs.length].slice(0, 30 + (i % 8)) + i, hashrate: h, sharesPerSecond: 0.2 + rnd() * 4 };
      });
    });

    const blocks = [];
    pools.forEach((p) => {
      for (let i = 0; i < Math.min(8, p.totalBlocks); i++) {
        const age = rnd() * 6 * 24 * H + i * 3 * H;
        const conf = age > 18 * H ? 1 : Math.min(1, age / (18 * H));
        blocks.push({
          poolId: p.id, blockHeight: p.networkStats.blockHeight - Math.round(age / 1000 / p._blockTime), networkDifficulty: p.networkStats.networkDifficulty,
          status: conf >= 1 ? (rnd() < 0.04 ? "orphaned" : "confirmed") : "pending", type: "block", confirmationProgress: conf,
          effort: 0.15 + rnd() * 1.6, minerEffort: rnd() * 2, reward: p.blockReward + rnd() * p.blockReward * 0.04, infoLink: "#",
          hash: Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join(""),
          miner: p.topMiners[Math.floor(rnd() * p.topMiners.length)]?.miner || addrs[0], source: "", created: new Date(now - age).toISOString()
        });
      }
    });
    blocks.sort((a, b) => new Date(b.created) - new Date(a.created));

    function perf(p, r, i) {
      const pts = r === "month" ? 30 : i === "hour" ? 24 : 48;
      const step = r === "month" ? 24 * H : H;
      const out = [];
      let hr = p.poolStats.poolHashrate * 0.85;
      for (let k = pts - 1; k >= 0; k--) {
        hr = Math.max(p.poolStats.poolHashrate * 0.5, hr * (0.95 + rnd() * 0.11));
        out.push({ poolHashrate: hr, connectedMiners: Math.round(p.poolStats.connectedMiners * (0.9 + rnd() * 0.2)), validSharesPerSecond: 50 + rnd() * 100, networkHashrate: p.networkStats.networkHashrate * (0.97 + rnd() * 0.06), networkDifficulty: p.networkStats.networkDifficulty, created: new Date(now - k * step).toISOString() });
      }
      out[out.length - 1].poolHashrate = p.poolStats.poolHashrate;
      return out;
    }

    function payments(p, addr) {
      return Array.from({ length: 15 }, (_, i) => ({
        coin: p.coin.symbol, address: addr || p.topMiners[i % p.topMiners.length]?.miner, addressInfoLink: "#",
        amount: p.paymentProcessing.minimumPayment * (1 + rnd() * 12),
        transactionConfirmationData: Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join(""),
        transactionInfoLink: "#", created: new Date(now - i * 7 * H - rnd() * H).toISOString()
      }));
    }

    function minerStats(p, addr) {
      const workers = ["rig01", "rig02", "s21-a", "s21-b", "l9-garage"].slice(0, 2 + Math.floor(rnd() * 4));
      const total = p.poolStats.poolHashrate * (0.01 + rnd() * 0.04);
      const perW = workers.map(() => 0.5 + rnd());
      const sum = perW.reduce((a, b) => a + b, 0);
      const mk = (f) => Object.fromEntries(workers.map((w, i) => [w, { hashrate: (total * perW[i] / sum) * f, sharesPerSecond: 0.3 + rnd() * 2 }]));
      return {
        pendingShares: 1e9 * rnd(), pendingBalance: p.paymentProcessing.minimumPayment * rnd() * 0.9, totalPaid: p.paymentProcessing.minimumPayment * 140 * (1 + rnd()),
        todayPaid: p.paymentProcessing.minimumPayment * 2.4, minerEffort: rnd() * 1.4,
        lastPayment: new Date(now - 5 * H).toISOString(), lastPaymentLink: "#",
        performance: { created: new Date(now).toISOString(), workers: mk(1) },
        performanceSamples: Array.from({ length: 24 }, (_, k) => ({ created: new Date(now - (23 - k) * H).toISOString(), workers: mk(0.85 + rnd() * 0.3) })),
        totalConfirmedBlocks: Math.floor(rnd() * 3), totalPendingBlocks: 0
      };
    }

    const paged = (arr, page, size) => ({ result: arr.slice(page * size, page * size + size), success: true, itemCount: arr.length, pageCount: Math.ceil(arr.length / size) });

    function route(path) {
      const [p, qs] = path.split("?");
      const q = new URLSearchParams(qs || "");
      const page = +q.get("page") || 0, size = +q.get("pageSize") || 15;
      const seg = p.split("/").filter(Boolean).map(decodeURIComponent);
      const v2 = seg[0] === "v2";
      if (v2) seg.shift();
      return new Promise((res) => setTimeout(() => {
        if (seg[0] === "blocks") return res(blocks.slice(page * size, page * size + size));
        if (seg[0] !== "pools") return res(null);
        if (seg.length === 1) return res({ pools });
        const pool = pools.find((x) => x.id === seg[1]);
        if (!pool) return res(null);
        if (seg.length === 2) return res({ pool });
        if (seg[2] === "performance") return res({ stats: perf(pool, (q.get("r") || "day").toLowerCase(), (q.get("i") || "hour").toLowerCase()) });
        if (seg[2] === "blocks") { const b = blocks.filter((x) => x.poolId === pool.id); return res(v2 ? paged(b, page, size) : b); }
        if (seg[2] === "payments") return res(v2 ? paged(payments(pool), page, size) : payments(pool));
        if (seg[2] === "miners" && seg.length === 3) return res(pool.topMiners.slice(page * size, page * size + size));
        if (seg[2] === "miners") {
          const addr = seg[3];
          if (seg[4] === "payments") return res(paged(payments(pool, addr), page, size));
          if (seg[4] === "blocks") return res(paged(blocks.filter((x) => x.poolId === pool.id).slice(0, 2).map((b) => ({ ...b, miner: addr })), page, size));
          if (seg[4] === "earnings") return res(paged(Array.from({ length: 14 }, (_, i) => ({ date: new Date(now - i * 24 * H).toISOString(), amount: pool.paymentProcessing.minimumPayment * (1 + rnd() * 3) })), page, size));
          if (seg[4] === "balancechanges") return res(paged([], page, size));
          return res(minerStats(pool, addr));
        }
        res(null);
      }, 120));
    }
    return { route };
  })();

  window.API = api;
})();

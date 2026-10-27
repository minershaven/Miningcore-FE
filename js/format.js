/* Formatting helpers */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const HASH_UNITS = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s", "ZH/s"];
  function hashrateParts(h) {
    h = Number(h) || 0;
    let i = 0;
    while (h >= 1000 && i < HASH_UNITS.length - 1) { h /= 1000; i++; }
    const v = h === 0 ? "0" : h >= 100 ? h.toFixed(1) : h >= 10 ? h.toFixed(2) : h.toFixed(2);
    return [v.replace(/\.?0+$/, "") || "0", HASH_UNITS[i]];
  }
  const hashrate = (h) => hashrateParts(h).join(" ");
  const hashrateHtml = (h) => { const [v, u] = hashrateParts(h); return `${v} <small>${u}</small>`; };

  const SI = ["", "K", "M", "G", "T", "P", "E", "Z"];
  function si(n, digits = 2) {
    n = Number(n) || 0;
    let i = 0;
    while (Math.abs(n) >= 1000 && i < SI.length - 1) { n /= 1000; i++; }
    return (i === 0 ? trim(n.toFixed(n % 1 ? digits : 0)) : trim(n.toFixed(digits))) + (SI[i] ? " " + SI[i] : "");
  }
  const trim = (s) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

  function num(n, max = 0) {
    return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: max });
  }
  function coin(n, digits = 8) {
    n = Number(n) || 0;
    if (n === 0) return "0";
    const d = n >= 1000 ? 2 : n >= 1 ? 4 : digits;
    return n.toLocaleString(undefined, { maximumFractionDigits: d });
  }
  function pct(n, digits = 1) {
    return `${(Number(n) || 0).toFixed(digits)}%`;
  }

  function ago(date) {
    if (!date) return "—";
    const d = date instanceof Date ? date : new Date(date);
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return `${Math.floor(s)}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
    const days = Math.floor(s / 86400);
    return days < 30 ? `${days}d ago` : d.toLocaleDateString();
  }
  function dateTime(date) {
    if (!date) return "—";
    return new Date(date).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function time(date) {
    return new Date(date || Date.now()).toLocaleTimeString();
  }
  function duration(sec) {
    sec = Math.max(0, Number(sec) || 0);
    if (!isFinite(sec)) return "∞";
    if (sec < 60) return `${Math.round(sec)}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
    if (sec < 86400 * 365) return `${(sec / 86400).toFixed(1)}d`;
    return `${(sec / 86400 / 365).toFixed(1)}y`;
  }

  function shortAddr(a, n = 8) {
    if (!a) return "—";
    return a.length > n * 2 + 3 ? `${a.slice(0, n)}…${a.slice(-n)}` : a;
  }

  // Deterministic, pleasant colour for unknown coins
  const KNOWN = {
    BTC: "#f7931a", BCH: "#0ac18e", LTC: "#345d9d", DOGE: "#c2a633", XMR: "#ff6600", ETC: "#3ab83a", RVN: "#384182",
    KAS: "#49eacb", ERG: "#ff5e18", DGB: "#006ad2", DASH: "#008ce7", ZEC: "#e8b030", FB: "#d97706", BSV: "#eab300",
    ALPH: "#6b7280", FLUX: "#2b61d1", NEXA: "#ffa500", XEC: "#0074c2", PEP: "#2e9e41", CKB: "#3cc68a", HNS: "#8b5cf6"
  };
  function coinColor(sym) {
    sym = (sym || "?").toUpperCase();
    if (KNOWN[sym]) return KNOWN[sym];
    let h = 0;
    for (const c of sym) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 62% 45%)`;
  }
  function coinIcon(c, size = "") {
    const sym = (c?.symbol || "?").toUpperCase();
    const custom = (window.POOL_CONFIG.coinIcons || {})[sym];
    const cls = `coin-icon ${size}`;
    if (custom) return `<span class="${cls}"><img src="${esc(custom)}" alt="${esc(sym)}"></span>`;
    // small badges show the first letter, large ones up to 4 characters
    const label = size === "lg" ? sym.slice(0, 4) : sym.slice(0, 1);
    const fs = size === "lg" && label.length > 2 ? ` font-size:${label.length > 3 ? 11 : 13}px;` : "";
    return `<span class="${cls}" style="background:${coinColor(sym)};${fs}">${esc(label)}</span>`;
  }

  function scheme(pool) {
    return (pool?.paymentProcessing?.payoutScheme || "—").toUpperCase();
  }

  window.F = { esc, hashrate, hashrateHtml, hashrateParts, si, num, coin, pct, ago, dateTime, time, duration, shortAddr, coinColor, coinIcon, scheme };
})();

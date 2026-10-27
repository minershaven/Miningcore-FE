/*
 * Pool front-end configuration.
 * Everything coin-related (coins, algorithms, ports, fees, payout schemes)
 * is read live from the Miningcore API — add a pool to Miningcore's config
 * and it appears here automatically. Only branding and stratum hostnames
 * live in this file.
 */
window.POOL_CONFIG = {
  // Branding
  name: "Miners Haven",
  tagline: "Built by miners, for miners",
  description:
    "Your hashpower, your strategy. Choose high-stakes SOLO mining or steady PPLNS payouts across every coin we run. Low-latency stratum servers, transparent stats and fast payouts — 24/7.",
  logo: null, // e.g. "img/logo.svg" — leave null to use the built-in mark

  // Miningcore API. Use "/api" when the UI is served from the same host
  // (reverse proxy), or a full URL such as "https://api.example.com/api".
  apiBase: "/api",

  // WebSocket notifications relay (block found, payments …).
  // null = derive from apiBase host  ->  ws(s)://<host>/notifications
  wsUrl: null,

  // When the API can't be reached: true = show clearly-labelled demo data
  // (handy while designing), false = show an error. Keep false in production.
  demoFallback: false,

  refreshSeconds: 30,

  // Stratum locations shown on the home page and on the "Connect" pages.
  // Miningcore only knows ports (listenAddress is usually 0.0.0.0),
  // so hostnames are configured here.
  // pingUrl (optional): any small HTTPS URL on that server, used to show latency.
  stratumLocations: [
    { country: "United States", city: "East",      region: "North America", flag: "us", host: "us.example-pool.com",   pingUrl: null },
    { country: "Germany",       city: "Frankfurt", region: "Europe",        flag: "de", host: "eu.example-pool.com",   pingUrl: null },
    { country: "Singapore",     city: "",          region: "Asia",          flag: "sg", host: "asia.example-pool.com", pingUrl: null }
  ],

  // Optional per-symbol icon overrides. Unknown coins get a generated badge.
  coinIcons: {
    // BTC: "img/coins/btc.svg"
  },

  links: {
    telegram: null, // "https://t.me/yourpool"
    discord: null,
    twitter: null,
    support: null // "mailto:support@example.com"
  },

  // Partner / service cards on the home page. Remove entries or set [] to hide.
  partners: [],

  faq: [
    { q: "What is the difference between PPLNS and SOLO?",
      a: "PPLNS (Pay Per Last N Shares) splits every block the pool finds between miners based on the shares they submitted in the last window — smoother, more regular income. SOLO pays the whole block reward to the miner who finds it — big payouts, but much higher variance." },
    { q: "How do I start mining?",
      a: "Pick a pool on the Connect page, point your miner at one of the stratum endpoints with your wallet address as the username (add .workername to tell rigs apart), and use any password. Your stats appear on the Dashboard within a few minutes." },
    { q: "When do I get paid?",
      a: "Payouts are sent automatically once your confirmed balance reaches the pool's minimum payment, shown on each pool page. Blocks must reach the required number of confirmations before rewards become payable." },
    { q: "Which port should I use?",
      a: "Pick the port whose starting difficulty best matches your hardware. Most ports use variable difficulty and adjust automatically. Ports marked TLS encrypt the connection." },
    { q: "Why is my hashrate on the pool lower than on my miner?",
      a: "Pool-side hashrate is estimated from submitted shares, so it fluctuates over short periods. Compare averages over several hours rather than single readings." }
  ]
};

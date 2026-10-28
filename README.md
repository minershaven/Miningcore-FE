# Pool front end for Miningcore

A dark, responsive front end for your Miningcore API. It's plain HTML, CSS and JavaScript, so there's no build step and nothing to install.

## How it adapts to new coins
Every coin, algorithm, payout scheme (PPLNS / SOLO / PPLNSBF …), fee, minimum payout and stratum port is read from `GET /api/pools` at runtime. When you add or enable a pool in Miningcore's config and restart, it shows up everywhere: the home page, the pools table, the filters, the Connect page and the dashboard lookup. You don't edit the front end.

Coins this UI doesn't recognise get a generated colour badge. To use a real logo, add it to `coinIcons` in `config.js`, for example `{ BTC: "img/coins/btc.svg" }`.

## Pages
| Route | What it shows |
|---|---|
| `#/` | Hero, live stats, hashrate by algorithm, top pools, stratum locations, all pools, recent blocks |
| `#/pools` | Sortable, searchable pool table with algorithm and type filters |
| `#/pool/{id}` | KPIs, 24h/30d hashrate chart, pool details, top miners, ports and miner setup, blocks, payments |
| `#/miner/{id}/{address}` | Hashrate chart, workers, balance progress to minimum payout, payments, daily earnings, blocks |
| `#/dashboard` | Address lookup on one pool or across all pools, plus recent lookups |
| `#/blocks` | All blocks, filterable by pool |
| `#/connect` | Getting-started steps, ports table, ready-to-copy miner config |
| `#/faq`, `#/api` | FAQ (edit it in config.js) and the public API reference |

Data refreshes every 30 s. Block-found and payment toasts arrive over Miningcore's `/notifications` WebSocket.

## Setup
1. Edit `config.js`: your pool name, tagline, `apiBase`, stratum hostnames (`stratumLocations`) and links.
2. Serve the folder with any static web server.

### Recommended: nginx on the same host (no CORS needed)
```nginx
server {
    listen 443 ssl;
    server_name pool.example.com;
    root /var/www/pool-ui;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;   # Miningcore api port
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /notifications {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
Keep `apiBase: "/api"` with this setup.

### API on a different domain
Set `apiBase: "https://api.example.com/api"`, and make sure that domain sends CORS headers (`Access-Control-Allow-Origin`) for your front-end's origin.

## Notes
- The admin endpoints (`/api/admin/...`) are never called.
- `demoFallback: true` shows clearly labelled sample data when the API can't be reached. It's useful for previewing the design. Keep it `false` in production.
- Pool-wide totals never add hashrates from different algorithms together. Hashrate is shown per algorithm instead.
- Miner lookups for Ethereum-family coins are lowercased by Miningcore itself.

## Installing Miningcore on the server
`deploy/install-miningcore.sh` sets up the backend on Ubuntu 22.04 or 24.04. It installs .NET 9, PostgreSQL, the database tables, a build of your Miningcore fork, a starter config, and a `miningcore` systemd service:

```
wget https://raw.githubusercontent.com/minershaven/Miningcore-FE/main/deploy/install-miningcore.sh
sudo bash install-miningcore.sh
```

Everything installs into `~/miningcore` in the home folder of the user who runs `sudo`, and Miningcore runs as that user. The starter config in `~/miningcore/config.json` contains one Zano pool, which is **disabled**. Miningcore won't run with zero pools enabled, so the service starts only after you enable a pool and run `sudo systemctl restart miningcore`. Re-running the script is safe. It rebuilds from the latest source and keeps your config and database.

`deploy/nginx-theminershaven.org.conf` is the matching nginx site.

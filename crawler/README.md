# Crawler Service

## Setup

Install dependencies:

```bash
pnpm install
```

### Development scripts

- `pnpm dev` — build in watch mode.
- `pnpm build` — generate production bundles.
- `pnpm test` — run the Vitest suite.

## Proxy Management

Proxy configuration is persisted in a SQLite database via the built-in `node:sqlite` module. The database path is controlled by the `proxyDbPath` config value and defaults to `crawler-proxies.db` in the current working directory.

On startup the service:

1. Creates/opens the SQLite database file.
2. Initializes the schema (table `proxies`).
3. Wires the synchronous `ProxyStore` into `ProxyManager`.

### API

The HTTP API is exposed at `/proxies` on the crawler server.

- `GET /proxies` — returns the current proxy pool with health stats.
- `POST /proxies` — accepts JSON body matching:

  ```json
  {
    "protocol": "http|https|socks5",
    "host": "proxy.example.com",
    "port": 8080,
    "username": "optional",
    "password": "optional"
  }
  ```

  Returns `201 Created` with the stored proxy object.

- `DELETE /proxies/:id` — removes the proxy by numeric id. Returns `204 No Content`.

Because state lives in SQLite, proxy cooldowns and success/failure counters survive service restarts.

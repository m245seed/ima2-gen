# Docker Deployment

ima2-gen ships a multi-stage `Dockerfile` (issue #114). The image builds the
web UI and server from source and runs the Express server directly.

## Quick start

```bash
docker build -t ima2-gen .
docker run -d --name ima2 \
  -p 3333:3333 \
  -e IMA2_LAN_TOKEN=change-me \
  -v ima2-data:/data \
  ima2-gen
```

Or with compose:

```bash
IMA2_LAN_TOKEN=change-me docker compose up -d
```

Then open `http://localhost:3333/?token=change-me` (or send the token as an
`x-ima2-token` header on API calls).

## Why `IMA2_LAN_TOKEN` is required

Inside a container the server must bind `0.0.0.0` to be reachable through the
port mapping. ima2-gen intentionally refuses to bind a non-loopback host
without an access token (`server.ts` security guard), so the container sets
`IMA2_HOST=0.0.0.0` and you must supply `IMA2_LAN_TOKEN`. Without it the
container exits at startup with a clear error — that is by design, not a bug.

## Environment

| Variable | Default (image) | Purpose |
|---|---|---|
| `IMA2_LAN_TOKEN` | — (required) | API access token for non-loopback bind |
| `IMA2_PORT` | `3333` | Server port |
| `IMA2_HOST` | `0.0.0.0` | Bind host |
| `IMA2_CONFIG_DIR` | `/data` | Config + generated output + credentials |
| `OPENAI_API_KEY` | — | Optional: API-key image provider |

State (config, generated images/videos, OAuth credentials) lives under `/data`
— mount a volume there to persist it.

## Provider setup

The container starts without any provider configured. Configure providers in
the web UI (Settings), or pass API keys via environment variables. OAuth
device/browser flows initiated from the web UI work as usual; tokens persist
in `/data`.

## Limitations

- The image runs the server only. CLI workflows (`ima2 gen`, etc.) can exec
  into the container (`docker exec -it ima2 node bin/ima2.js …`) but are
  primarily designed for host installs.
- Image builds are not yet exercised in CI. The Dockerfile mirrors the npm
  package contract (`package.json` `files[]`); if you hit a build/runtime
  issue, please open an issue with the log.

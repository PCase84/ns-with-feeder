# ns-with-feeder

Custom Nightscout build (Docker-based) with a patched Dexcom Share feeder.
Goal: improve handling of EU Share endpoints and phone-number based accounts.

## What this repo contains
- Docker setup that extends the official `nightscout/cgm-remote-monitor:latest`
- A small “feeder patch” we can swap in without forking the whole upstream
- Docs for required env vars

## Status
Work-in-progress. For now this is a template we’ll adapt to your Render setup.

## License
AGPL-3.0 — see [LICENSE](LICENSE).


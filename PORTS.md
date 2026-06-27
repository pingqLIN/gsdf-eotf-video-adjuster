# Port Governance

This project uses a fixed loopback port for the local Vite development server.

| Service | Host | Port | Visibility | Protocol | Notes |
| --- | --- | ---: | --- | --- | --- |
| `vite-dev` | `127.0.0.1` | `3101` | local | HTTP | Fixed Vite dev server. `npm run dev` uses `--strictPort` and should fail instead of silently falling back. |

The matching machine-level DevGov record is `gsdf-eotf-video-adjuster` / `vite-dev` in the local DevGov port registry.

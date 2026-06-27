# Port 治理

本專案的本機 Vite 開發伺服器使用固定 loopback port。

| Service | Host | Port | Visibility | Protocol | Notes |
| --- | --- | ---: | --- | --- | --- |
| `vite-dev` | `127.0.0.1` | `3101` | local | HTTP | 固定 Vite dev server。`npm run dev` 使用 `--strictPort`，port 被占用時應直接失敗，不得靜默 fallback。 |

對應的本機 DevGov 登記為 local DevGov port registry 中的 `gsdf-eotf-video-adjuster` / `vite-dev`。

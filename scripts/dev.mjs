import { createServer } from "vite";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createApp } from "../server/app.js";
import { localStore } from "./local-store.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  port = Number(process.env.PORT || 5186);
const origin = "http://127.0.0.1:" + port;
const handler = createApp({
  origin,
  secret: process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
  store: localStore(resolve(root, ".local-data")),
});
const service = await createServer({
  root,
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    fs: {
      deny: [
        ".env*",
        "**/.local-data/**",
        "**/server/**",
        "**/cloud-functions/**",
        "**/scripts/**",
      ],
    },
  },
  plugins: [
    {
      name: "local-workshop",
      configureServer(s) {
        s.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith("/api/")) return next();
          try {
            const r = new Request(origin + req.url, {
              method: req.method,
              headers: req.headers,
              ...(["GET", "HEAD"].includes(req.method)
                ? {}
                : { body: req, duplex: "half" }),
            });
            const out = await handler(r);
            res.statusCode = out.status;
            for (const [k, v] of out.headers) {
              if (k !== "set-cookie") res.setHeader(k, v);
            }
            const cookies = out.headers.getSetCookie();
            if (cookies.length) res.setHeader("set-cookie", cookies);
            res.end(await out.text());
          } catch {
            res.statusCode = 500;
            res.end();
          }
        });
      },
    },
  ],
});
await service.listen();
service.printUrls();

import { getStore } from "@edgeone/pages-blob";
import { createApp } from "../../server/app.js";
import { config } from "../../server/config.js";
/** EdgeOne supplies Blob credentials at runtime; all access stays in this function. */
export async function onRequest(context) {
  let handle;
  const blob = () => (handle ??= getStore(config.namespace));
  const store = {
    get: (key) => blob().get(key, { type: "json", consistency: "strong" }),
    put: (key, value) =>
      blob().setJSON(key, value, { cacheControl: "no-store" }),
    keys: async (prefix, limit) =>
      (await blob().list({ prefix, limit, consistency: "strong" })).blobs
        .map((x) => x.key)
        .slice(0, limit),
  };
  return createApp({
    store,
    origin: context.env?.APP_ORIGIN ?? process.env.APP_ORIGIN,
    secret: context.env?.SESSION_SECRET ?? process.env.SESSION_SECRET,
  })(context.request);
}

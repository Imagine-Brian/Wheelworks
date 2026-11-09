import { config, GameError } from "./config.js";
import { daily, liveFeed } from "./daily.js";
import { identity, issueLogin, sessionCookie, verifyLogin } from "./auth.js";
import { progress, player, savePlan, deliver } from "./workshop.js";
function json(data, status = 200, cookies = []) {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(JSON.stringify(data), { status, headers: h });
}
/** Bound even chunked request bodies before parsing untrusted JSON. */
async function readBody(req) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new GameError(415, "json_required", "Request must contain JSON.");
  if (Number(req.headers.get("content-length")) > config.maxBody)
    throw new GameError(413, "too_large", "Blueprint is too large.");
  // Makers exposes parsed JSON on request.body. The native Request still owns the original bytes.
  const stream =
    req.body instanceof ReadableStream
      ? req.body
      : new Response(await req.arrayBuffer()).body;
  const reader = stream?.getReader();
  let bytes = 0;
  const chunks = [];
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > config.maxBody) {
        await reader.cancel();
        throw new GameError(413, "too_large", "Blueprint is too large.");
      }
      chunks.push(value);
    }
  try {
    const d = JSON.parse(Buffer.concat(chunks).toString());
    if (!d || typeof d !== "object" || Array.isArray(d)) throw 0;
    return d;
  } catch {
    throw new GameError(400, "bad_body", "Could not read the request.");
  }
}
/** Bind all authenticated writes to the configured site and wallet identity. */
export function createApp({
  store,
  origin,
  secret,
  clock = Date.now,
  feed = liveFeed,
}) {
  return async (req) => {
    try {
      const route = new URL(req.url).pathname.replace(/^\/api\/?/, ""),
        now = clock(),
        verb = req.method;
      if (verb === "GET" && route === "challenge")
        return json(await daily(store, now, feed));
      if (verb === "GET" && route === "bridge")
        return json(await progress(store));
      if (!secret || Buffer.byteLength(secret) < 32 || !origin)
        throw new GameError(
          503,
          "auth_config",
          "Cloud sign-in is not configured.",
        );
      if (verb === "POST" && req.headers.get("origin") !== origin)
        throw new GameError(
          403,
          "origin_mismatch",
          "Send this request from the workshop.",
        );
      if (verb === "POST" && route === "auth/challenge") {
        const d = issueLogin(
          (await readBody(req)).address,
          secret,
          origin,
          now,
        );
        return json({ message: d.message }, 200, [d.cookie]);
      }
      if (verb === "POST" && route === "auth/verify") {
        const d = verifyLogin(
          req,
          (await readBody(req)).signature,
          secret,
          origin,
          now,
        );
        return json({ address: d.address }, 200, [d.cookie]);
      }
      if (verb === "POST" && route === "auth/logout")
        return json({ ok: true }, 200, [
          sessionCookie("wheel_auth", "", 0, origin),
        ]);
      const address = identity(req, secret, origin, now);
      if (verb === "GET" && route === "me")
        return json(await player(store, address, now));
      if (verb === "POST" && route === "save")
        return json(
          await savePlan(store, address, now, await readBody(req), feed),
        );
      if (verb === "POST" && route === "deliver")
        return json(
          await deliver(store, address, now, await readBody(req), feed),
        );
      throw new GameError(404, "not_found", "Endpoint not found.");
    } catch (err) {
      if (err instanceof GameError)
        return json({ code: err.code, message: err.message }, err.status);
      console.error("Workshop request failed", err?.name, err?.code);
      return json(
        {
          code: "server_error",
          message: "Workshop unavailable. Try again shortly.",
        },
        500,
      );
    }
  };
}

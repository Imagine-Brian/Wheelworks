import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import { config, GameError } from "./config.js";
const denied = () =>
  new GameError(401, "auth_required", "Sign in again with your wallet.");
const cookieMap = (request) =>
  Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(/;\s*/)
      .filter((x) => x.includes("="))
      .map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]),
  );
/** Authenticate typed credentials so a challenge cannot be used as a session. */
function seal(data, secret) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret).update(payload).digest("base64url")
  );
}
function open(request, name, secret, origin, now) {
  const [payload, mac] = String(cookieMap(request)["wheel_auth"] || "").split(
    ".",
  );
  if (!payload || !mac) throw denied();
  const wanted = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  if (
    wanted.length !== mac.length ||
    !timingSafeEqual(Buffer.from(wanted), Buffer.from(mac))
  )
    throw denied();
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (data.kind !== name || data.origin !== origin || data.exp <= now)
    throw denied();
  return data;
}
export function sessionCookie(name, value, seconds, origin) {
  return (
    name +
    "=" +
    value +
    "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
    seconds +
    (origin.startsWith("https:") ? "; Secure" : "")
  );
}
export function identity(request, secret, origin, now) {
  return open(request, "wheel_session", secret, origin, now).address;
}
export function issueLogin(address, secret, origin, now) {
  try {
    address = getAddress(address);
  } catch {
    throw new GameError(400, "invalid_address", "Invalid wallet address.");
  }
  const nonce = randomBytes(16).toString("hex"),
    exp = now + config.challengeSeconds * 1000;
  const message =
    new URL(origin).host +
    " wants you to sign in with your Ethereum account:\n" +
    address +
    "\n\nSign in to Squeek Wheelworks.\n\nURI: " +
    origin +
    "\nVersion: 1\nChain ID: 11155111\nNonce: " +
    nonce +
    "\nIssued At: " +
    new Date(now).toISOString() +
    "\nExpiration Time: " +
    new Date(exp).toISOString();
  return {
    message,
    cookie: sessionCookie(
      "wheel_auth",
      seal({ kind: "wheel_login", origin, address, message, exp }, secret),
      config.challengeSeconds,
      origin,
    ),
  };
}
/** The browser must present the private challenge cookie and signature over the exact server message. */
export function verifyLogin(req, signature, secret, origin, now) {
  const d = open(req, "wheel_login", secret, origin, now);
  try {
    if (verifyMessage(d.message, signature) !== d.address) throw denied();
  } catch {
    throw denied();
  }
  const address = d.address.toLowerCase();
  return {
    address,
    cookie: sessionCookie(
      "wheel_auth",
      seal(
        {
          kind: "wheel_session",
          address,
          origin,
          exp: now + config.sessionSeconds * 1000,
        },
        secret,
      ),
      config.sessionSeconds,
      origin,
    ),
  };
}

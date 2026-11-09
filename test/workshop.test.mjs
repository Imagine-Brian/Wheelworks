import test from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import { createApp } from "../server/app.js";
import { settledOrder } from "../server/daily.js";
import { hourly } from "../server/workshop.js";
import {
  simulate,
  starter,
  makeChallenge,
  tile,
  validLayout,
} from "../shared/game.js";
import { randomBytes } from "node:crypto";
const day = "2026-11-09",
  midnight = Date.parse(day + "T00:00:00Z"),
  origin = "https://example.test";
const feed = () => ({
  status: "available",
  chain: {
    chainId: "11155111",
    target: "sepolia",
    confirmations: "12",
    safeThroughBlock: "12094800",
  },
  window: { bucketSeconds: 21600 },
  recentSettlements: [{ blockTimestamp: new Date(midnight).toISOString() }],
  buckets: [5576, 3622, 0, 5681].map((n, i) => ({
    startAt: new Date(midnight - 86400000 + i * 21600000).toISOString(),
    endAt: new Date(midnight - 86400000 + (i + 1) * 21600000).toISOString(),
    workAdded: String(n),
  })),
});
function solve(c) {
  const a = starter(c);
  a[7] = tile("belt");
  a[17] = tile("belt");
  if (c.variant !== 0) {
    const top = c.variant === 1,
      base = top ? 5 : 15,
      dy = top ? -5 : 5;
    a[base + 2] = 0;
    a[base + 1] = tile(top ? "saw" : "press", top ? 0 : 2);
    a[base + 1 + dy] = a[base + 2 + dy] = tile("belt");
    a[base + 3 + dy] = tile("belt", top ? 2 : 0);
  }
  return a;
}
test("every practice and daily board has a feasible route; closed loops, bad layouts and unprocessed items fail", () => {
  for (let n = 0; n < 3; n++) {
    const c = makeChallenge(day, 0, n),
      a = solve(c);
    assert.ok(simulate(a, c).complete);
    assert.ok(!simulate(starter(c), c).complete);
    const b = [...a];
    b[6] = tile("belt", 3);
    assert.ok(!simulate(b, c).complete);
    assert.equal(validLayout(Array(25).fill(tile("battery")), c), false);
  }
  const c = makeChallenge(day, 0, 0),
    a = solve(c);
  a[7] = tile("belt", 3);
  assert.equal(simulate(a, c).wood.reason, "route loops back");
  a[7] = tile("belt");
  a[6] = tile("belt");
  assert.equal(simulate(a, c).wood.ok, false);
});
test("daily energy counts exactly four completed settlement buckets, fails closed on gaps or stale frontier, accepts confirmed zero", () => {
  const d = feed();
  assert.equal(settledOrder(d, day).work, "14879");
  d.buckets.forEach((b) => (b.workAdded = "0"));
  assert.equal(settledOrder(d, day).work, "0");
  d.recentSettlements = [];
  assert.throws(() => settledOrder(d, day));
  d.recentSettlements = feed().recentSettlements;
  d.buckets.pop();
  assert.throws(() => settledOrder(d, day));
});
test("offline production consumes a single daily budget; pending edits never rewrite completed hours", () => {
  const p = { hour: 1, rates: { wood: 5, metal: 4 }, energy: 19 };
  assert.deepEqual(hourly([p], day, midnight + 2.5 * 3600000), {
    boards: 0,
    gears: 0,
    used: 0,
  });
  assert.deepEqual(
    hourly(
      [p, { ...p, hour: 3, rates: { wood: 0, metal: 1 } }],
      day,
      midnight + 6 * 3600000,
    ),
    { boards: 2, gears: 3, used: 19 },
  );
});
function fixture() {
  const data = new Map();
  let now = midnight + 4 * 3600000;
  const store = {
    get: async (k) => data.get(k) ?? null,
    put: async (k, v) => data.set(k, structuredClone(v)),
    keys: async (p, limit) =>
      [...data.keys()].filter((k) => k.startsWith(p)).slice(0, limit),
  };
  const app = createApp({
    store,
    origin,
    secret: randomBytes(32).toString("hex"),
    clock: () => now,
    feed: async () => feed(),
  });
  const request = (route, body, cookie = "", org = origin) =>
    app(
      new Request(origin + "/api/" + route, {
        method: body === undefined ? "GET" : "POST",
        headers: { origin: org, "content-type": "application/json", cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { request, data, advance: (ms) => (now += ms) };
}
async function login(request, wallet) {
  const q = await request("auth/challenge", { address: wallet.address });
  const challenge = q.headers.getSetCookie()[0].split(";")[0];
  const { message } = await q.json();
  const signature = await wallet.signMessage(message);
  const r = await request("auth/verify", { signature }, challenge);
  assert.equal(r.status, 200);
  return r.headers
    .getSetCookie()
    .find((x) => x.startsWith("wheel_auth="))
    .split(";")[0];
}
test("wallet session, saved layout, idempotent concurrent delivery and isolation across wallets", async () => {
  const { request, data, advance } = fixture(),
    w = Wallet.createRandom(),
    other = Wallet.createRandom();
  const session = await login(request, w),
    c = await (await request("challenge")).json();
  const a = solve(c),
    body = { day, layout: a };
  assert.equal((await request("save", body)).status, 401);
  assert.equal(
    (await request("save", body, session, "https://elsewhere.test")).status,
    403,
  );
  assert.equal((await request("save", body, session)).status, 200);
  assert.deepEqual(
    (await (await request("me", undefined, session)).json()).saved.layout,
    a,
  );
  assert.equal(
    (
      await request(
        "deliver",
        { ...body, layout: starter(c), boards: 999 },
        session,
      )
    ).status,
    422,
  );
  const receipts = await Promise.all(
    Array.from({ length: 6 }, () => request("deliver", body, session)),
  );
  assert.ok(receipts.every((r) => r.status === 200));
  assert.equal((await (await request("bridge")).json()).count, 1);
  const second = await login(request, other);
  assert.equal(
    (await (await request("me", undefined, second)).json()).saved,
    null,
  );
  await request("deliver", body, second);
  assert.equal((await (await request("bridge")).json()).count, 2);
  assert.ok(
    [...data.keys()].includes(
      "bridge/v1/" + day + "/" + w.address.toLowerCase(),
    ),
  );
  advance(86400000);
  assert.equal((await request("me", undefined, session)).status, 401);
  const renewed = await login(request, w),
    next = await (await request("me", undefined, renewed)).json();
  assert.deepEqual(next.saved.layout, a);
  assert.equal(next.delivered, false);
  assert.ok(next.yesterday.boards > 0);
  assert.equal(next.production.boards, 0);
});
test("login rejects a signature for another wallet or an expired challenge", async () => {
  const { request, advance } = fixture(),
    w = Wallet.createRandom(),
    other = Wallet.createRandom();
  const q = await request("auth/challenge", { address: w.address });
  const cookie = q.headers.getSetCookie()[0].split(";")[0],
    { message } = await q.json();
  assert.equal(
    (
      await request(
        "auth/verify",
        { signature: await other.signMessage(message) },
        cookie,
      )
    ).status,
    401,
  );
  advance(300001);
  assert.equal(
    (
      await request(
        "auth/verify",
        { signature: await w.signMessage(message) },
        cookie,
      )
    ).status,
    401,
  );
});

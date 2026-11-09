import { validLayout, simulate, GOAL } from "../shared/game.js";
import { daily } from "./daily.js";
import { dayAt, GameError } from "./config.js";
const HOUR = 3600000;
const hourAt = (ms) => Math.floor(ms / HOUR) % 24;
const prefix = (address, day) => "plans/" + address + "/" + day + "/";
async function plans(store, address, day) {
  const keys = await store.keys(prefix(address, day), 24);
  return (await Promise.all(keys.sort().map((k) => store.get(k)))).filter(
    Boolean,
  );
}
/** An edit in hour h sets the layout for h+1. Past hourly slots stay immutable.
 * A day's energy belongs to the wallet for that day, including across layout changes. */
export function hourly(records, day, now) {
  let boards = 0,
    gears = 0,
    used = 0,
    plan;
  const finished = day < dayAt(now) ? 24 : hourAt(now);
  const slots = new Map(records.map((p) => [p.hour + 1, p]));
  for (let h = 0; h < finished; h++) {
    plan = slots.get(h) ?? plan;
    if (!plan) continue;
    for (const [line, amount] of [
      ["wood", "boards"],
      ["metal", "gears"],
    ]) {
      const cost = plan.rates[line];
      if (cost > 0 && used + cost <= plan.energy) {
        used += cost;
        if (amount === "boards") boards++;
        else gears++;
      }
    }
  }
  return { boards, gears, used };
}
export async function progress(store) {
  const keys = await store.keys("bridge/v1/", GOAL);
  return { count: keys.length, goal: GOAL };
}
export async function player(store, address, now) {
  const day = dayAt(now),
    yesterday = dayAt(now - 86400000);
  const [today, prior, delivered, blueprint] = await Promise.all([
    plans(store, address, day),
    plans(store, address, yesterday),
    store.get("bridge/v1/" + day + "/" + address),
    store.get("blueprints/" + address),
  ]);
  return {
    address,
    day,
    saved: today.at(-1) ?? blueprint ?? null,
    yesterday: hourly(prior, yesterday, now),
    production: hourly(today, day, now),
    delivered: Boolean(delivered),
  };
}
export async function savePlan(store, address, now, body, feed) {
  const c = await checked(store, now, body, feed),
    result = simulate(body.layout, c);
  const hour = hourAt(now),
    record = {
      day: c.id,
      hour,
      layout: body.layout,
      energy: c.energy,
      savedAt: new Date(now).toISOString(),
      rates: {
        wood: result.wood.ok ? result.wood.cost : 0,
        metal: result.metal.ok ? result.metal.cost : 0,
      },
    };
  await store.put(
    prefix(address, c.id) + String(hour).padStart(2, "0"),
    record,
  );
  await store.put("blueprints/" + address, record);
  return record;
}
async function checked(store, now, body, feed) {
  if (body.day !== dayAt(now))
    throw new GameError(
      409,
      "stale_order",
      "The daily order changed. Reload the shift.",
    );
  const c = await daily(store, now, feed);
  if (!validLayout(body.layout, c))
    throw new GameError(
      400,
      "bad_layout",
      "Invalid layout. Check fixed tiles and the capacitor limit.",
    );
  return c;
}
/** One deterministic receipt per wallet/day also makes simultaneous retries safe on Blob. */
export async function deliver(store, address, now, body, feed) {
  const c = await checked(store, now, body, feed);
  if (!simulate(body.layout, c).complete)
    throw new GameError(
      422,
      "unfinished",
      "Output or available power does not meet the daily order.",
    );
  await store.put("bridge/v1/" + c.id + "/" + address, {
    day: c.id,
    address,
    units: 1,
  });
  return progress(store);
}

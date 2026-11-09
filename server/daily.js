import { makeChallenge } from "../shared/game.js";
import { config, dayAt, GameError } from "./config.js";
const unavailable = () =>
  new GameError(503, "wheel_unavailable", "Wheel settlement is pending.");
/** Use yesterday's four closed settlement-time buckets and proof that the indexed chain passed midnight. */
export function settledOrder(data, day) {
  const end = Date.parse(day + "T00:00:00Z"),
    start = end - 86400000;
  if (
    data?.status !== "available" ||
    String(data.chain?.chainId) !== "11155111" ||
    data.chain?.target !== "sepolia" ||
    String(data.chain?.confirmations) !== "12" ||
    data.window?.bucketSeconds !== 21600 ||
    !data.recentSettlements?.some((s) => Date.parse(s.blockTimestamp) >= end)
  )
    throw unavailable();
  let work = 0n;
  for (let t = start; t < end; t += 21600000) {
    const rows = data.buckets?.filter(
      (b) =>
        Date.parse(b.startAt) === t && Date.parse(b.endAt) === t + 21600000,
    );
    if (
      rows?.length !== 1 ||
      typeof rows[0].workAdded !== "string" ||
      !/^\d{1,60}$/.test(rows[0].workAdded)
    )
      throw unavailable();
    work += BigInt(rows[0].workAdded);
  }
  return {
    ...makeChallenge(day, work),
    sourceDay: dayAt(start),
    sourceBlock: String(data.chain.safeThroughBlock),
  };
}
/** A date-keyed cache makes on-demand creation and the daily timer converge on the same order. */
export async function daily(store, now, readFeed) {
  const day = dayAt(now),
    key = "daily/" + day,
    cached = await store.get(key);
  if (cached) return cached;
  let value;
  try {
    value = settledOrder(await readFeed(), day);
  } catch {
    throw unavailable();
  }
  await store.put(key, value);
  return value;
}
export async function liveFeed() {
  const res = await fetch(config.settlements, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw unavailable();
  return res.json();
}

// Pieces carry their type and orientation in a single integer so a cloud save is 25 numbers.
export const SIZE = 5;
export const TYPES = ["empty", "belt", "saw", "press", "battery"];
export const ARROWS = ["↑", "→", "↓", "←"];
export const GOAL = 50;
export const tile = (kind, direction = 1) =>
  TYPES.indexOf(kind) * 4 + direction;
export const kindOf = (code) => TYPES[Math.floor(code / 4)];
const cost = { belt: 1, battery: 0, saw: 3, press: 3 };
const vectors = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Build a reproducible, solvable order. Both intake rows have a clear outer detour. */
export function makeChallenge(id, work, variant = undefined) {
  const dayCode = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const n = variant ?? Number((BigInt(work) + BigInt(dayCode)) % 3n);
  const boards = 2 + (dayCode % 2),
    gears = 2;
  const rocks = n === 0 ? [12] : n === 1 ? [7, 12] : [12, 17];
  // Each port is one step away from an editable cell. A detour adds two belts per item.
  const budget =
    (boards + gears) * 5 +
    (n === 1 ? boards : n === 2 ? gears : 0) * 2 +
    Number(BigInt(work) % 4n);
  return {
    id,
    work: String(work),
    boards,
    gears,
    energy: budget,
    rocks,
    variant: n,
  };
}
export const PRACTICE = [
  makeChallenge("practice-1", 3, 0),
  makeChallenge("practice-2", 2, 1),
  makeChallenge("practice-3", 1, 2),
];
export const ports = [5, 9, 15, 19];
export function fixed(i, c) {
  return ports.includes(i) || c.rocks.includes(i);
}
export function starter(c) {
  const a = Array(25).fill(0);
  for (const [i, k] of [
    [6, "saw"],
    [8, "belt"],
    [16, "press"],
    [18, "belt"],
  ])
    a[i] = tile(k);
  return a;
}
/** Reject malformed layouts, fixed-cell writes and exceeding the one-capacitor inventory. */
export function validLayout(a, c) {
  return (
    Array.isArray(a) &&
    a.length === 25 &&
    a.every(
      (v, i) =>
        Number.isInteger(v) && (v === 0 || (v >= 4 && v <= 19 && !fixed(i, c))),
    ) &&
    a.filter((v) => kindOf(v) === "battery").length <= 1
  );
}
/** Trace a resource to its matching dock with cycle detection and path diagnostics. */
function trace(a, c, wood) {
  const start = wood ? 5 : 15,
    end = wood ? 9 : 19,
    machine = wood ? "saw" : "press";
  let i = start + 1,
    processed = false,
    spent = 0;
  const path = [start],
    visited = new Set();
  while (i >= 0 && i < 25) {
    if (i === end && processed)
      return {
        ok: true,
        cost: spent,
        path: [...path, i],
        reason: "Connected",
        stop: i,
      };
    const k = kindOf(a[i]);
    const reason = visited.has(i)
      ? "route loops back"
      : ports.includes(i)
        ? "wrong dock or unprocessed material"
        : c.rocks.includes(i)
          ? "rock blocks the line"
          : k === "empty"
            ? "missing connection"
            : (k === "saw" || k === "press") && (processed || k !== machine)
              ? "wrong machine or processing order"
              : "";
    if (reason) return { ok: false, cost: spent, path, reason, stop: i };
    visited.add(i);
    path.push(i);
    spent += cost[k];
    processed ||= k === machine;
    const [dx, dy] = vectors[a[i] % 4],
      x = (i % 5) + dx,
      y = Math.floor(i / 5) + dy;
    if (x < 0 || x >= 5 || y < 0 || y >= 5) break;
    i = y * 5 + x;
  }
  return {
    ok: false,
    cost: spent,
    path,
    reason: "output points off the floor",
    stop: path[path.length - 1],
  };
}
/** The server uses the same bounded simulation as the browser, never client-reported counts. */
export function simulate(a, c) {
  if (!validLayout(a, c)) throw new Error("Invalid factory layout");
  const wood = trace(a, c, true),
    metal = trace(a, c, false);
  let energy = c.energy,
    boards = 0,
    gears = 0;
  for (let t = 0; t < Math.max(c.boards, c.gears); t++) {
    if (wood.ok && boards < c.boards && energy >= wood.cost) {
      energy -= wood.cost;
      boards++;
    }
    if (metal.ok && gears < c.gears && energy >= metal.cost) {
      energy -= metal.cost;
      gears++;
    }
  }
  return {
    wood,
    metal,
    boards,
    gears,
    energy,
    used: c.energy - energy,
    complete: boards === c.boards && gears === c.gears,
  };
}

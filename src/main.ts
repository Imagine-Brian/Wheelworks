import "./style.css";
import {
  PRACTICE,
  ARROWS,
  starter,
  simulate,
  validLayout,
  fixed,
  tile,
  kindOf,
} from "../shared/game.js";
import {
  api,
  signIn,
  walletProvider,
  ApiError,
  type Challenge,
  type Player,
  type Bridge,
} from "./api";
import { board, tools, coords, toolInfo } from "./board";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const btn = (id: string) => $<HTMLButtonElement>(id);
let challenge: Challenge = PRACTICE[0],
  live: Challenge | null = null,
  player: Player | null = null;
let layout: number[] = starter(challenge),
  tool = "belt",
  direction = 1,
  undo: number[][] = [],
  revision = 0,
  working = false;
let result: ReturnType<typeof simulate> | null = null,
  bridge: Bridge | null = null;
let modeChanged = false,
  dailyError = "",
  activeWalletVersion = 0;
const localKey = () => "wheelworks.v1." + challenge.id;
const isDaily = () => !challenge.id.startsWith("practice");
function message(value: string) {
  $("feedback").textContent = value;
}
function remember() {
  try {
    localStorage.setItem(localKey(), JSON.stringify(layout));
    $("save-info").textContent = "Draft saved on this device";
  } catch {
    $("save-info").textContent =
      "Storage unavailable. Keep this tab open to retain your edits.";
  }
}
function load(c: Challenge) {
  revision++;
  challenge = c;
  result = null;
  undo = [];
  layout = starter(c);
  try {
    const a = JSON.parse(localStorage.getItem(localKey()) || "null");
    if (validLayout(a, c)) layout = a;
  } catch {
    /* Fresh draft */
  }
  $("save-info").textContent = "Local blueprint";
  message(
    isDaily()
      ? "Fill both quotas to deliver one crate of bridge parts."
      : "Connect each intake to its matching dock. You can rerun a shift.",
  );
  render();
}
function render() {
  board($("board"), challenge, layout, edit);
  renderTools();
  for (const id of ["daily", "practice"])
    btn(id).setAttribute(
      "aria-pressed",
      String((id === "daily") === isDaily()),
    );
  $("order-name").textContent = isDaily()
    ? "Daily work order"
    : "Practice order";
  $("ticket-id").textContent = isDaily()
    ? challenge.id.slice(5)
    : "P / 0" + challenge.id.slice(-1);
  $("order-ref").textContent = isDaily()
    ? "UTC / " + challenge.id
    : "TRAINING / 0" + challenge.id.slice(-1);
  $("brief").textContent =
    challenge.variant === 0
      ? "Two lines, two gaps. Connect each machine to the dock on its right."
      : challenge.variant === 1
        ? "Rock on the lumber line. Route the boards around the north side and back to the dock."
        : "Rock on the iron line. Reroute the gears south and check each turn.";
  $("wood-count").textContent =
    (result?.boards ?? 0) + " / " + challenge.boards;
  $("metal-count").textContent = (result?.gears ?? 0) + " / " + challenge.gears;
  $("power").textContent =
    (result?.energy ?? challenge.energy) + " / " + challenge.energy;
  const e = $<HTMLProgressElement>("energy-meter");
  e.max = challenge.energy;
  e.value = result?.energy ?? challenge.energy;
  $("energy-note").textContent = isDaily()
    ? "Settled wheel work · " + challenge.sourceDay + " UTC"
    : "Practice power allowance";
  btn("undo").disabled = !undo.length;
  btn("deliver").hidden = !isDaily() || !result?.complete;
  btn("deliver").disabled =
    working || Boolean(player?.delivered && player.day === challenge.id);
  btn("deliver").textContent =
    player?.delivered && player.day === challenge.id
      ? "Order delivered"
      : "Deliver order";
  btn("save").disabled = !isDaily() || working;
  btn("restore").disabled = !isDaily() || working;
  btn("wallet").disabled = working;
  btn("wallet").textContent = player
    ? player.address.slice(0, 6) + "…" + player.address.slice(-4)
    : "Connect wallet";
  $("level-picker").hidden = isDaily();
  $("level-picker").replaceChildren();
  PRACTICE.forEach((c, i) => {
    const b = document.createElement("button");
    b.textContent = ["Straight run", "Wood detour", "Iron detour"][i];
    b.setAttribute("aria-pressed", String(c.id === challenge.id));
    b.onclick = () => load(c);
    $("level-picker").append(b);
  });
  $("source").textContent = live
    ? "Wheel settled · " +
      live.work +
      " work units · " +
      live.sourceDay +
      " UTC"
    : dailyError
      ? "Awaiting settlement · Practice available"
      : "Reading wheel settlement…";
}
function renderTools() {
  tools($("tools"), tool, (s) => {
    tool = s;
    renderTools();
  });
  $("tool-tip").textContent =
    toolInfo[tool] +
    (tool === "empty"
      ? ""
      : " Output " +
        ARROWS[direction] +
        ". Click a matching machine to rotate it.");
}
function edit(i: number) {
  if (working) return;
  if (fixed(i, challenge)) {
    message("Fixed tile. Choose an empty tile or a machine.");
    return;
  }
  const old = layout[i],
    v =
      tool === "empty"
        ? 0
        : tile(tool, kindOf(old) === tool ? ((old % 4) + 1) % 4 : direction);
  if (v === old) return;
  if (
    tool === "battery" &&
    kindOf(old) !== "battery" &&
    layout.some((n) => kindOf(n) === "battery")
  ) {
    message("One capacitor per floor. Remove the existing one to move it.");
    return;
  }
  revision++;
  undo.push([...layout]);
  if (undo.length > 50) undo.shift();
  layout[i] = v;
  result = null;
  remember();
  render();
  message(coords(i) + " updated. Run the line to test it.");
}
function rotate() {
  direction = (direction + 1) % 4;
  renderTools();
}
btn("rotate").onclick = rotate;
document.addEventListener("keydown", (e) => {
  if (
    e.key.toLowerCase() === "r" &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !$<HTMLDialogElement>("dialog").open
  )
    rotate();
});
btn("undo").onclick = () => {
  const a = undo.pop();
  if (a) {
    revision++;
    layout = a;
    result = null;
    remember();
    render();
    message("Last edit undone.");
  }
};
async function run() {
  const token = ++revision,
    r = simulate(layout, challenge);
  result = null;
  render();
  message("Material moving through the line…");
  const max = Math.max(r.wood.path.length, r.metal.path.length),
    delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 145;
  for (let i = 0; i < max; i++) {
    if (token !== revision) return;
    for (const line of [r.wood, r.metal])
      if (line.path[i] !== undefined)
        $("board").children[line.path[i]]?.classList.add("flow");
    await new Promise((res) => setTimeout(res, delay));
  }
  if (token !== revision) return;
  result = r;
  render();
  for (const line of [r.wood, r.metal])
    for (const i of line.path) $("board").children[i]?.classList.add("flow");
  const failures = [r.wood, r.metal].filter((line) => !line.ok);
  for (const line of failures)
    $("board").children[line.stop]?.classList.add("bottleneck");
  let best = r.used;
  if (r.complete) {
    try {
      const k = localKey() + ".best",
        prev = Number(localStorage.getItem(k));
      best = prev > 0 ? Math.min(prev, r.used) : r.used;
      localStorage.setItem(k, String(best));
    } catch {
      /* Browser storage may be disabled. */
    }
  }
  message(
    r.complete
      ? "Order complete! " +
          r.used +
          " power used, " +
          r.energy +
          " left. Personal best: " +
          best +
          " power. " +
          (isDaily() ? "Ready to deliver." : "Try the next practice shift.")
      : failures.length
        ? failures
            .map((line) => coords(line.stop) + " " + line.reason)
            .join("; ")
        : "Out of power. Shorten the route or replace one belt with a capacitor.",
  );
}
btn("run").onclick = () => void run();
async function getDaily(enter: boolean) {
  try {
    const data = await api<Challenge>("challenge");
    live = data;
    dailyError = "";
    if (enter || !modeChanged) load(data);
    else render();
  } catch (e) {
    dailyError = (e as Error).message;
    if (enter || !modeChanged) {
      load(PRACTICE[0]);
      message(dailyError + " Practice mode is active.");
    } else render();
  }
}
btn("daily").onclick = () => {
  if (working) return;
  modeChanged = true;
  void getDaily(true);
};
btn("practice").onclick = () => {
  if (working) return;
  modeChanged = true;
  load(PRACTICE[0]);
};
function displayBridge(b: Bridge | null) {
  bridge = b;
  const meter = $<HTMLProgressElement>("bridge-meter");
  meter.max = b?.goal ?? 50;
  if (b) meter.value = b.count;
  else meter.removeAttribute("value");
  $("bridge-count").textContent = b
    ? (b.count >= b.goal ? "Bridge complete · " : "") +
      b.count +
      " / " +
      b.goal +
      " crates"
    : "Progress unavailable";
}
function dialog(title: string, lines: string[]) {
  $("modal-title").textContent = title;
  $("modal-body").replaceChildren(
    ...lines.map((s) => {
      const p = document.createElement("p");
      p.textContent = s;
      return p;
    }),
  );
  $<HTMLDialogElement>("dialog").showModal();
}
btn("close").onclick = () => $<HTMLDialogElement>("dialog").close();
btn("help").onclick = () =>
  dialog("Operator manual", [
    "1. Select equipment and click a tile to place it. Arrows show the output direction. Click a matching piece again to rotate it.",
    "2. Run wood through a sawmill and iron through a gear press. Process each piece once, then route it to the matching dock on the right.",
    "3. Run the line to spot breaks. Each item uses 1 power per belt and 3 per machine. The capacitor moves it one tile for free.",
    "4. Yesterday’s settled wheel work powers the daily shift. Sign in with your wallet to deliver one verified crate per day.",
  ]);
btn("bridge-info").onclick = () =>
  dialog("Acorn Creek Bridge", [
    "Finish the bridge together by shipping 50 crates. Each verified daily order adds one crate.",
    bridge
      ? "Crates delivered: " + bridge.count + "."
      : "The build log is unavailable.",
    player
      ? "Today: " +
        (player.delivered ? "order delivered." : "order pending.") +
        " Offline output today: " +
        player.production.boards +
        " boards, " +
        player.production.gears +
        " gears. Yesterday: " +
        player.yesterday.boards +
        " boards, " +
        player.yesterday.gears +
        " gears."
      : "Connect your wallet to see your production and deliveries.",
    "A saved line starts at the next UTC hour. Each full hour it attempts one of each part until the daily power runs out or the UTC day ends.",
  ]);
async function account() {
  const v = activeWalletVersion;
  try {
    const p = await api<Player>("me");
    if (v === activeWalletVersion) player = p;
  } catch (e) {
    if (v === activeWalletVersion && e instanceof ApiError && e.status === 401)
      player = null;
  }
  render();
}
async function requirePlayer() {
  if (player) return;
  await signIn();
  await account();
  if (!player)
    throw new Error("Wallet session unavailable. Reconnect to try again.");
}
async function action(fn: () => Promise<void>) {
  if (working) return;
  working = true;
  render();
  try {
    await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) player = null;
    const text = (e as Error).message || "";
    message(
      /reject|denied/i.test(text)
        ? "Sign-in was declined in your wallet."
        : text.slice(0, 160),
    );
  } finally {
    working = false;
    render();
  }
}
btn("wallet").onclick = () =>
  void action(async () => {
    if (player) {
      await api("auth/logout", {});
      activeWalletVersion++;
      player = null;
      message("Wallet disconnected.");
    } else {
      await requirePlayer();
      message("Wallet connected. Save a blueprint or deliver the daily order.");
    }
  });
walletProvider()?.on?.("accountsChanged", () => {
  if (!player) return;
  activeWalletVersion++;
  player = null;
  void api("auth/logout", {}).catch(() => {});
  render();
  message("Wallet account changed. Sign in again.");
});
btn("save").onclick = () =>
  void action(async () => {
    await requirePlayer();
    const p = await api<{ savedAt: string }>("save", {
      day: challenge.id,
      layout,
    });
    await account();
    $("save-info").textContent =
      "Cloud save · " + new Date(p.savedAt).toLocaleTimeString("en-GB");
    message("Blueprint saved. Production starts at the next UTC hour.");
  });
btn("restore").onclick = () =>
  void action(async () => {
    await requirePlayer();
    const p = await api<Player>("me");
    if (!p.saved || p.day !== challenge.id) {
      message("This wallet has no saved blueprint yet.");
      return;
    }
    const previousDay = p.saved.day !== challenge.id;
    const restored = p.saved.layout.map((value, i) =>
      fixed(i, challenge) ? 0 : value,
    );
    if (!validLayout(restored, challenge))
      throw new Error("This blueprint is incompatible with the current floor.");
    revision++;
    undo.push([...layout]);
    layout = restored;
    result = null;
    remember();
    message(
      previousDay
        ? "Loaded the " +
            p.saved.day +
            " blueprint. Fixed tiles were cleared for today’s floor. Undo to revert."
        : "Cloud blueprint loaded. Undo to revert.",
    );
  });
btn("deliver").onclick = () =>
  void action(async () => {
    await requirePlayer();
    const b = await api<Bridge>("deliver", { day: challenge.id, layout });
    displayBridge(b);
    await account();
    message("Crate delivered to Acorn Creek Bridge!");
  });
load(PRACTICE[0]);
void getDaily(false);
void account();
void api<Bridge>("bridge")
  .then(displayBridge)
  .catch(() => displayBridge(null));

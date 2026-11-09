import { fixed, ports, TYPES, ARROWS, kindOf } from "../shared/game.js";
import type { Challenge } from "./api";
export const labels: Record<string, string> = {
  empty: "Remove",
  belt: "Belt",
  saw: "Sawmill",
  press: "Gear press",
  battery: "Capacitor",
};
const art: Record<string, string> = {
  belt: "belt",
  saw: "processor",
  press: "assembler",
  battery: "battery",
};
export const toolInfo: Record<string, string> = {
  belt: "Moves material for 1 power per tile.",
  saw: "Cuts wood into boards for 3 power each.",
  press: "Presses iron into gears for 3 power each.",
  battery: "Moves material for free. One capacitor per floor.",
  empty: "Click a machine to clear its tile.",
};
function sprite(name: string) {
  const el = document.createElement("img");
  el.alt = "";
  el.src = "/art/" + name + ".png";
  return el;
}
export function coords(i: number) {
  return String.fromCharCode(65 + (i % 5)) + (Math.floor(i / 5) + 1);
}
export function board(
  el: HTMLElement,
  c: Challenge,
  layout: number[],
  onPick: (i: number) => void,
) {
  const focus = (document.activeElement as HTMLElement)?.dataset.cell;
  el.replaceChildren();
  layout.forEach((v, i) => {
    const b = document.createElement("button"),
      k = kindOf(v),
      dock = ports.includes(i),
      rock = c.rocks.includes(i);
    b.className = "cell " + (dock ? "fixed" : rock ? "rock" : k);
    b.dataset.cell = String(i);
    const label = dock
      ? (
          {
            5: "Wood in",
            9: "Boards out",
            15: "Iron in",
            19: "Gears out",
          } as Record<number, string>
        )[i]
      : rock
        ? "Rock"
        : v
          ? labels[k]
          : "Empty";
    b.title = coords(i) + " · " + label + (v ? " " + ARROWS[v % 4] : "");
    b.setAttribute("aria-label", b.title);
    if (dock) {
      b.append(sprite(i % 5 === 0 ? "inlet" : "outlet"));
      const t = document.createElement("span");
      t.className = "tile-label";
      t.textContent = label;
      b.append(t);
    } else if (v) {
      b.append(sprite(art[k]));
      const t = document.createElement("span");
      t.className = "dir";
      t.textContent = ARROWS[v % 4];
      b.append(t);
    }
    b.addEventListener("click", () => onPick(i));
    b.setAttribute("aria-disabled", String(fixed(i, c)));
    el.append(b);
  });
  if (focus)
    el.querySelector<HTMLElement>('[data-cell="' + focus + '"]')?.focus({
      preventScroll: true,
    });
}
export function tools(
  el: HTMLElement,
  selected: string,
  pick: (s: string) => void,
) {
  el.replaceChildren();
  for (const k of [...TYPES.slice(1), "empty"]) {
    const b = document.createElement("button");
    b.className = "tool";
    b.setAttribute("aria-pressed", String(k === selected));
    if (k === "empty") {
      const s = document.createElement("span");
      s.className = "erase";
      s.textContent = "⌫";
      b.append(s);
    } else b.append(sprite(art[k]));
    b.append(document.createTextNode(labels[k]));
    b.onclick = () => pick(k);
    el.append(b);
  }
}

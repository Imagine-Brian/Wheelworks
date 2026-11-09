import { makeChallenge } from "../shared/game.js";
export type Challenge = ReturnType<typeof makeChallenge> & {
  sourceDay?: string;
  sourceBlock?: string;
};
export interface Plan {
  day: string;
  layout: number[];
  savedAt: string;
  hour: number;
}
export interface Player {
  address: string;
  day: string;
  saved: Plan | null;
  delivered: boolean;
  production: { boards: number; gears: number };
  yesterday: { boards: number; gears: number };
}
export interface Bridge {
  count: number;
  goal: number;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Same-origin, cookie-authenticated game APIs. Failure text is displayed as text only. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(0, "Workshop connection timed out. Try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data)
    throw new ApiError(
      res.status,
      data?.message || "Workshop unavailable. Please try again.",
    );
  return data as T;
}
interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, fn: () => void): void;
}
export const walletProvider = () =>
  (window as Window & { ethereum?: Provider }).ethereum;
async function walletRequest(
  wallet: Provider,
  args: { method: string; params?: unknown[] },
) {
  try {
    return await wallet.request(args);
  } catch (error) {
    if ((error as { code?: number })?.code === 4001)
      throw new Error("Sign-in was declined in your wallet.");
    throw new Error("Wallet request failed. Open your wallet and try again.");
  }
}
export async function signIn() {
  const wallet = walletProvider();
  if (!wallet)
    throw new Error(
      "Open an Ethereum wallet browser or enable a wallet extension. Practice is available immediately.",
    );
  const accounts = (await walletRequest(wallet, {
    method: "eth_requestAccounts",
  })) as string[];
  const address = accounts[0];
  const { message } = await api<{ message: string }>("auth/challenge", {
    address,
  });
  const bytes =
    "0x" +
    Array.from(new TextEncoder().encode(message), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
  const signature = await walletRequest(wallet, {
    method: "personal_sign",
    params: [bytes, address],
  });
  return api<{ address: string }>("auth/verify", { signature });
}

/** All sessions and day boundaries use server time; the deployed origin binds wallet signatures. */
export const config = {
  challengeSeconds: 300,
  sessionSeconds: 86400,
  maxBody: 8192,
  settlements: "https://api.squeekchain.com/v1/settlements?range=7d",
  namespace: "squeek-wheelworks-v1",
};
export const dayAt = (ms) => new Date(ms).toISOString().slice(0, 10);
export class GameError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

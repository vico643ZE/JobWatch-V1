import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export const COOKIE = "jobwatch_session";
export function authConfigured() {
  return Boolean(
    process.env.APP_URL &&
      /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(
        process.env.APP_PASSWORD_HASH || "",
      ) &&
      (process.env.SESSION_SECRET || "").length >= 32,
  );
}
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, hash = process.env.APP_PASSWORD_HASH) {
  if (
    typeof password !== "string" ||
    password.length > 256 ||
    !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash || "")
  )
    return false;
  const [, salt, key] = hash.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(key, "hex"),
  );
}
const sign = (value) =>
  createHmac("sha256", process.env.SESSION_SECRET)
    .update(`${value}.${process.env.APP_PASSWORD_HASH}`)
    .digest("hex");
export function createSession(now = Date.now()) {
  const payload = `${now + 7 * 86400000}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}
export function validSession(value, now = Date.now()) {
  if (!authConfigured() || typeof value !== "string" || value.length > 200)
    return false;
  const parts = value.split(".");
  if (
    parts.length !== 3 ||
    !/^\d+$/.test(parts[0]) ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[a-f0-9]{64}$/.test(parts[2])
  )
    return false;
  const expires = Number(parts[0]);
  return (
    expires > now &&
    expires <= now + 7 * 86400000 &&
    timingSafeEqual(
      Buffer.from(parts[2], "hex"),
      Buffer.from(sign(parts.slice(0, 2).join(".")), "hex"),
    )
  );
}
export function sameOrigin(request) {
  try {
    return (
      new URL(request.headers.get("origin")).origin ===
      new URL(process.env.APP_URL).origin
    );
  } catch {
    return false;
  }
}
export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.APP_URL?.startsWith("https://") === true,
  path: "/",
  maxAge: 7 * 86400,
});
export function loginBucket(request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown";
  return createHash("sha256").update(ip).digest("hex");
}

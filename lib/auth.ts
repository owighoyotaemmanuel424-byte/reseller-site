import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE = "mkx_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must be configured with at least 32 characters");
  }
  return secret;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + "$" + scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  return actual.length === hash.length && timingSafeEqual(Buffer.from(actual), Buffer.from(hash));
}

export function signSession(userId: string) {
  const exp = Date.now() + SESSION_TTL_MS;
  const body = userId + "." + exp;
  return body + "." + createHmac("sha256", sessionSecret()).update(body).digest("hex");
}

export function verifySession(value?: string) {
  if (!value) return null;
  const [id, exp, sig] = value.split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;

  let expected: string;
  try {
    expected = createHmac("sha256", sessionSecret()).update(id + "." + exp).digest("hex");
  } catch {
    return null;
  }

  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ? id
    : null;
}

export async function getCurrentUser() {
  const jar = await cookies();
  const id = verifySession(jar.get(COOKIE)?.value);
  if (!id) return null;

  const { sql } = await import("./db");
  const rows = await sql`SELECT id,email,role FROM users WHERE id=${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function setSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

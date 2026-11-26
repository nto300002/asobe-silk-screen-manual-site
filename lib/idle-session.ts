import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import {
  IDLE_LIMIT_MS,
  sessionExpiresAt as sessionExpiresAtInDb,
  startSession as startSessionInDb,
  touchSession as touchSessionInDb,
  endSession as endSessionInDb,
} from "./idle-session-core.mjs";

export { IDLE_LIMIT_MS };
export const SESSION_COOKIE = "asobe_app_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function db(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB unavailable");
  return env.DB;
}

async function requestToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function sessionExpiresAt(userId: string): Promise<number | null> {
  return sessionExpiresAtInDb(db(), await requestToken(), userId);
}

export async function hasActiveSession(userId: string): Promise<boolean> {
  return (await sessionExpiresAt(userId)) !== null;
}

export async function startSession(userId: string): Promise<string> {
  return startSessionInDb(db(), userId);
}

export async function touchSession(userId: string): Promise<boolean> {
  return touchSessionInDb(db(), await requestToken(), userId);
}

export async function endSession(): Promise<void> {
  return endSessionInDb(db(), await requestToken());
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

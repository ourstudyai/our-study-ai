import type { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const SUPREME_EMAIL = "ourstudyai@gmail.com";

// Reads the caller from "Authorization: Bearer <idToken>" first (always fresh, sent by authFetch),
// then falls back to the "session" cookie (which can hold an expired token).
export async function getRequestUser(req: NextRequest): Promise<DecodedIdToken | null> {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const cookie = req.cookies.get("session")?.value ?? "";
  for (const token of [bearer, cookie]) {
    if (!token) continue;
    try { return await adminAuth.verifyIdToken(token); } catch { /* try next */ }
    try { return await adminAuth.verifySessionCookie(token, false); } catch { /* try next */ }
  }
  return null;
}

export async function isAdminUser(decoded: DecodedIdToken): Promise<boolean> {
  if (decoded.email === SUPREME_EMAIL) return true;
  const u = await adminDb.collection("users").doc(decoded.uid).get();
  const role = u.data()?.role;
  return role === "admin" || role === "chief_admin";
}

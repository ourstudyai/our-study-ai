import {
  doc, getDoc, setDoc, addDoc, updateDoc,
  collection, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// ─── Area label from pathname ────────────────────────────────────────────────

export function areaFromPath(pathname: string): string {
  if (pathname.startsWith('/dashboard/course/')) return 'Course Chat';
  if (pathname.startsWith('/library')) return 'Library';
  if (pathname.startsWith('/contribute')) return 'Contribute';
  if (pathname.startsWith('/admin')) return 'Admin';
  if (pathname === '/dashboard') return 'Dashboard';
  return 'Other';
}

// ─── Feature cache (avoids per-call Firestore reads) ────────────────────────

interface CacheEntry { enabled: boolean; fetchedAt: number; }
const featureCache: Record<string, CacheEntry> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function checkTrackingEnabled(
  feature: 'presence' | 'sessions' | 'admin_actions'
): Promise<boolean> {
  try {
    // Check master toggle first
    const masterKey = '__master__';
    const now = Date.now();
    if (!featureCache[masterKey] || now - featureCache[masterKey].fetchedAt > CACHE_TTL) {
      const masterSnap = await getDoc(doc(db, 'analytics', 'tracking_config'));
      const enabled = masterSnap.exists() ? (masterSnap.data()?.enabled !== false) : true;
      featureCache[masterKey] = { enabled, fetchedAt: now };
    }
    if (!featureCache[masterKey].enabled) return false;

    // Check per-feature toggle
    const cacheKey = `feature_${feature}`;
    if (!featureCache[cacheKey] || now - featureCache[cacheKey].fetchedAt > CACHE_TTL) {
      const featSnap = await getDoc(doc(db, 'analytics', 'features'));
      const data = featSnap.exists() ? featSnap.data() : {};
      const enabled = data?.[feature]?.enabled !== false;
      featureCache[cacheKey] = { enabled, fetchedAt: now };
    }
    return featureCache[cacheKey].enabled;
  } catch {
    return false; // Fail silent — never block the user
  }
}

// Call this when a toggle changes so UI change is reflected immediately
export function invalidateFeatureCache() {
  Object.keys(featureCache).forEach(k => delete featureCache[k]);
}

// ─── Session tracking ────────────────────────────────────────────────────────

export async function startSession(
  userId: string,
  email: string,
  area: string
): Promise<string | null> {
  try {
    if (!(await checkTrackingEnabled('sessions'))) return null;
    const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const now = new Date().toISOString();
    await setDoc(doc(db, 'sessions', sessionId), {
      userId,
      email,
      startedAt: now,
      endedAt: null,
      duration: 0,
      currentArea: area,
      areas: [{ area, enteredAt: now, duration: 0 }],
    });
    return sessionId;
  } catch {
    return null;
  }
}

export async function updateSessionArea(
  sessionId: string,
  newArea: string
): Promise<void> {
  try {
    if (!sessionId) return;
    if (!(await checkTrackingEnabled('sessions'))) return;
    const ref = doc(db, 'sessions', sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const areas: any[] = data.areas ?? [];
    const now = new Date().toISOString();
    const nowMs = Date.now();

    // Close current area entry
    if (areas.length > 0) {
      const last = areas[areas.length - 1];
      last.duration = Math.round((nowMs - new Date(last.enteredAt).getTime()) / 1000);
      areas[areas.length - 1] = last;
    }

    // Only append if area actually changed
    if (areas.length === 0 || areas[areas.length - 1].area !== newArea) {
      areas.push({ area: newArea, enteredAt: now, duration: 0 });
    }

    await updateDoc(ref, { currentArea: newArea, areas });
  } catch {
    // Fail silent
  }
}

export async function endSession(sessionId: string): Promise<void> {
  try {
    if (!sessionId) return;
    const ref = doc(db, 'sessions', sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const areas: any[] = data.areas ?? [];
    const now = new Date().toISOString();
    const nowMs = Date.now();

    // Close final area entry
    if (areas.length > 0) {
      const last = areas[areas.length - 1];
      last.duration = Math.round((nowMs - new Date(last.enteredAt).getTime()) / 1000);
      areas[areas.length - 1] = last;
    }

    const duration = Math.round(
      (nowMs - new Date(data.startedAt).getTime()) / 1000
    );

    await updateDoc(ref, {
      endedAt: now,
      duration,
      areas,
      currentArea: null,
    });
  } catch {
    // Fail silent
  }
}

// ─── Presence ────────────────────────────────────────────────────────────────

export async function heartbeat(
  userId: string,
  email: string,
  displayName: string,
  area: string
): Promise<void> {
  try {
    if (!(await checkTrackingEnabled('presence'))) return;
    await setDoc(doc(db, 'presence', userId), {
      online: true,
      lastSeen: new Date().toISOString(),
      currentArea: area,
      email,
      displayName,
    });
  } catch {
    // Fail silent
  }
}

export async function clearPresence(userId: string): Promise<void> {
  try {
    await setDoc(doc(db, 'presence', userId), {
      online: false,
      lastSeen: new Date().toISOString(),
    }, { merge: true });
  } catch {
    // Fail silent
  }
}

// ─── Admin action log ────────────────────────────────────────────────────────

export async function logAdminAction(params: {
  adminId: string;
  email: string;
  action: string;
  targetId?: string;
  targetName?: string;
  details?: string;
}): Promise<void> {
  try {
    if (!(await checkTrackingEnabled('admin_actions'))) return;
    await addDoc(collection(db, 'admin_actions'), {
      ...params,
      at: new Date().toISOString(),
    });
  } catch {
    // Fail silent
  }
}

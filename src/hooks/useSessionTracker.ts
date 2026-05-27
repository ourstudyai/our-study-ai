'use client';
import { useEffect, useRef } from 'react';
import {
  startSession,
  endSession,
  updateSessionArea,
  heartbeat,
  clearPresence,
  areaFromPath,
} from '@/lib/analytics/tracker';

export function useSessionTracker(
  userId: string | null,
  email: string | null,
  displayName: string | null,
  pathname: string
) {
  const sessionIdRef = useRef<string | null>(null);
  const currentAreaRef = useRef<string>('');
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Session start on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !email) return;
    const area = areaFromPath(pathname);
    currentAreaRef.current = area;

    let cancelled = false;

    async function init() {
      const sessionId = await startSession(userId!, email!, area);
      if (cancelled) {
        // Component unmounted before session started — end it immediately
        if (sessionId) endSession(sessionId);
        return;
      }
      sessionIdRef.current = sessionId;

      // Initial heartbeat
      await heartbeat(userId!, email!, displayName ?? '', area);

      // Heartbeat every 5 minutes
      heartbeatIntervalRef.current = setInterval(async () => {
        await heartbeat(userId!, email!, displayName ?? '', currentAreaRef.current);
      }, 5 * 60 * 1000);
    }

    init();

    // ── Cleanup on unmount ───────────────────────────────────────────────────
    return () => {
      cancelled = true;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current);
        sessionIdRef.current = null;
      }
      if (userId) clearPresence(userId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, email]); // Only re-run if user changes — not on every pathname change

  // ── Area change on pathname change ─────────────────────────────────────────
  useEffect(() => {
    if (!userId || !sessionIdRef.current) return;
    const newArea = areaFromPath(pathname);
    if (newArea === currentAreaRef.current) return; // No change — skip write
    currentAreaRef.current = newArea;
    updateSessionArea(sessionIdRef.current, newArea);
  }, [pathname, userId]);

  // ── Tab hide / close detection ─────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        if (sessionIdRef.current) {
          endSession(sessionIdRef.current);
          sessionIdRef.current = null;
        }
        clearPresence(userId);
      } else if (document.visibilityState === 'visible') {
        // Tab came back — start a new session
        const area = areaFromPath(pathname);
        currentAreaRef.current = area;
        startSession(userId, email ?? '', area).then(id => {
          sessionIdRef.current = id;
        });
        heartbeat(userId, email ?? '', displayName ?? '', area);
        heartbeatIntervalRef.current = setInterval(async () => {
          await heartbeat(userId, email ?? '', displayName ?? '', currentAreaRef.current);
        }, 5 * 60 * 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [userId, email, displayName, pathname]);
}

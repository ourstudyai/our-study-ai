'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  getMaterialsByStatus,
  updateMaterialStatus,
  updateMaterial,
} from '@/lib/firestore/materials';
import { db } from '@/lib/firebase/config';
import {
  collection, getDocs, query, orderBy, where,
  addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { Material } from '@/lib/firestore/materials';
import AppNav from '@/components/AppNav';
import ApprovalModal from '@/components/admin/ApprovalModal';
import UploadsPanel from '@/components/admin/UploadsPanel';
import LuxLoader from '@/components/LuxLoader';
import { logAdminAction } from '@/lib/analytics/tracker';
const SUPREME = 'ourstudyai@gmail.com';

type Tab = 'uploads' | 'pending' | 'approved' | 'quarantined' | 'resurrection' |
           'users' | 'reports' | 'courses' | 'timetables' | 'assignments' | 'analytics';

const TABS: { key: Tab; label: string; icon: string; supremeOnly?: boolean }[] = [
  { key: 'uploads',      label: 'Uploads',     icon: '📥' },
  { key: 'pending',      label: 'Pending',     icon: '⏳' },
  { key: 'approved',     label: 'Approved',    icon: '✓' },
  { key: 'quarantined',  label: 'Quarantined', icon: '⚠' },
  { key: 'resurrection', label: 'Resurrection',icon: '↺' },
  { key: 'courses',      label: 'Courses',     icon: '📚' },
  { key: 'assignments',  label: 'Assignments', icon: '📋' },
  { key: 'timetables',   label: 'Timetables',  icon: '🗓' },
  { key: 'users',        label: 'Users',       icon: '👥' },
  { key: 'reports',      label: 'Reports',     icon: '📊' },
  { key: 'analytics',    label: 'Analytics',   icon: '📈', supremeOnly: true },
];

type Course = { id: string; name: string; code?: string; department: string; year: number; semester: number; description?: string };

// ============================================================
// ANALYTICS PANEL (Supreme only)
// ============================================================

function AnalyticsPanel({ db, isSupreme }: { db: any; isSupreme: boolean }) {
  // ── Toggle state ───────────────────────────────────────────────────────────
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

  // ── Live data ──────────────────────────────────────────────────────────────
  const [presence, setPresence] = useState<any[]>([]);
  const [todaySessions, setTodaySessions] = useState<any[]>([]);
  const [adminActions, setAdminActions] = useState<any[]>([]);
  const [actionFilter, setActionFilter] = useState('');

  // ── Legacy aggregated data ─────────────────────────────────────────────────
  const [legacyData, setLegacyData] = useState<any>(null);

  // ── Sub-tab ────────────────────────────────────────────────────────────────
  const [subTab, setSubTab] = useState<'live' | 'sessions' | 'actions' | 'stats'>('live');

  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ── Load toggles ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupreme) return;
    async function loadToggles() {
      try {
        const [masterSnap, featSnap] = await Promise.all([
          getDoc(doc(db, 'analytics', 'tracking_config')),
          getDoc(doc(db, 'analytics', 'features')),
        ]);
        setMasterEnabled(masterSnap.exists() ? masterSnap.data()?.enabled !== false : true);
        setFeatures(featSnap.exists() ? featSnap.data() : {});
      } catch {}
    }
    loadToggles();
  }, [isSupreme, db]);

  // ── Load analytics data (refreshes every 30min or on manual refresh) ───────
  const loadData = useCallback(async () => {
    if (!isSupreme) return;
    setLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        presenceSnap, todaySessionsSnap, adminActionsSnap,
        allSessionsSnap, matsSnap, usersSnap, coursesSnap,
      ] = await Promise.all([
        getDocs(collection(db, 'presence')),
        getDocs(query(collection(db, 'sessions'), where('startedAt', '>=', todayISO), orderBy('startedAt', 'desc'))),
        getDocs(query(collection(db, 'admin_actions'), orderBy('at', 'desc'))),
        getDocs(query(collection(db, 'sessions'), where('startedAt', '>=', sevenDaysAgo))),
        getDocs(collection(db, 'materials')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'courses')),
      ]);

      setPresence(presenceSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTodaySessions(todaySessionsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAdminActions(adminActionsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // ── Legacy aggregation ─────────────────────────────────────────────────
      const mats = matsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const allSessions = allSessionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      // Area breakdown (7d)
      const areaTime: Record<string, number> = {};
      const areaFreq: Record<string, number> = {};
      // User activity (7d)
      const userTime: Record<string, number> = {};
      const userFreq: Record<string, number> = {};
      const userEmail: Record<string, string> = {};
      let totalDurationToday = 0;

      allSessions.forEach((s: any) => {
        const dur = s.duration || 0;
        const uid = s.userId;
        userTime[uid] = (userTime[uid] || 0) + dur;
        userFreq[uid] = (userFreq[uid] || 0) + 1;
        if (s.email) userEmail[uid] = s.email;
        if (s.startedAt >= todayISO) totalDurationToday += dur;
        (s.areas || []).forEach((a: any) => {
          areaTime[a.area] = (areaTime[a.area] || 0) + (a.duration || 0);
          areaFreq[a.area] = (areaFreq[a.area] || 0) + 1;
        });
      });

      // Most active users (7d)
      const mostActive = Object.entries(userTime)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 10)
        .map(([uid, time]) => ({ uid, email: userEmail[uid] || uid, time: time as number, sessions: userFreq[uid] || 0 }));

      // Dormant users (no session in 7d)
      const activeUids = new Set(allSessions.map((s: any) => s.userId));
      const dormant = users.filter((u: any) => !activeUids.has(u.id) && u.role !== 'admin' && u.role !== 'chief_admin');

      // Material stats
      const matByStatus: Record<string, number> = {};
      const matByType: Record<string, number> = {};
      mats.forEach((m: any) => {
        matByStatus[m.status] = (matByStatus[m.status] || 0) + 1;
        const ext = (m.fileName || '').split('.').pop()?.toLowerCase() || 'other';
        matByType[ext] = (matByType[ext] || 0) + 1;
      });

      setLegacyData({
        mats, users, matByStatus, matByType,
        areaTime, areaFreq, mostActive, dormant,
        totalDurationToday,
        totalUsers: users.length,
        totalCourses: coursesSnap.size,
      });

      setLastRefresh(new Date());
    } catch (e) { console.error('Analytics load error:', e); }
    finally { setLoading(false); }
  }, [isSupreme, db]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  async function toggleMaster() {
    setToggleLoading('master');
    try {
      const newVal = !masterEnabled;
      const now = new Date().toISOString();
      const masterRef = doc(db, 'analytics', 'tracking_config');
      const snap = await getDoc(masterRef);
      const history = snap.exists() ? (snap.data()?.history || []) : [];
      history.push({ state: newVal ? 'on' : 'off', at: now });
      await setDoc(masterRef, { enabled: newVal, toggledAt: now, history });
      setMasterEnabled(newVal);
      // Invalidate tracker cache
      const { invalidateFeatureCache } = await import('@/lib/analytics/tracker');
      invalidateFeatureCache();
    } catch (e) { console.error(e); }
    finally { setToggleLoading(null); }
  }

  async function toggleFeature(feature: string) {
    setToggleLoading(feature);
    try {
      const current = features[feature]?.enabled !== false;
      const newVal = !current;
      const now = new Date().toISOString();
      const featRef = doc(db, 'analytics', 'features');
      const snap = await getDoc(featRef);
      const existing = snap.exists() ? snap.data() : {};
      const history = existing?.[feature]?.history || [];
      history.push({ state: newVal ? 'on' : 'off', at: now });
      await setDoc(featRef, {
        ...existing,
        [feature]: { enabled: newVal, toggledAt: now, history },
      });
      setFeatures((f: any) => ({ ...f, [feature]: { ...(f[feature] || {}), enabled: newVal, toggledAt: now, history } }));
      const { invalidateFeatureCache } = await import('@/lib/analytics/tracker');
      invalidateFeatureCache();
    } catch (e) { console.error(e); }
    finally { setToggleLoading(null); }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmtDur = (secs: number) => {
    if (!secs) return '0m';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const fmtTime = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const fmtDateTime = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isOnline = (lastSeen: string) =>
    lastSeen && (Date.now() - new Date(lastSeen).getTime()) < 6 * 60 * 1000; // 6min window

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!isSupreme) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      <p style={{ fontSize: '2rem' }}>🔒</p>
      <p>Analytics are visible to supreme administrators only.</p>
    </div>
  );

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const card = (title: string, value: string | number, sub?: string, color?: string) => (
    <div style={{
      background: 'var(--navy-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 16px', flex: '1 1 130px', minWidth: 120,
    }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: color || 'var(--gold)', margin: '4px 0' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );

  const sectionHead = (title: string) => (
    <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--gold)', opacity: 0.6, marginBottom: 10, marginTop: 24 }}>{title}</p>
  );

  const row = (label: string, value: any, color?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{label}</span>
      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: color || 'var(--gold)' }}>{value}</span>
    </div>
  );

  const ToggleRow = ({ label, feature, cost, history }: { label: string; feature: string; cost: string; history?: any[] }) => {
    const enabled = features[feature]?.enabled !== false;
    const toggledAt = features[feature]?.toggledAt;
    const gaps = (history || features[feature]?.history || [])
      .filter((h: any, i: number, arr: any[]) => h.state === 'off' && arr[i + 1])
      .map((h: any, i: number, arr: any[]) => {
        const off = new Date(h.at);
        const on = new Date(arr[i + 1]?.at);
        const mins = Math.round((on.getTime() - off.getTime()) / 60000);
        return `${fmtDateTime(h.at)} → ${fmtDateTime(arr[i + 1]?.at)} (${mins}m gap)`;
      });
    return (
      <div style={{ background: 'var(--navy-card)', border: `1px solid ${enabled ? 'rgba(196,160,80,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div>
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</p>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Cost: {cost}</p>
          </div>
          <button
            onClick={() => toggleFeature(feature)}
            disabled={toggleLoading === feature || !masterEnabled}
            style={{
              padding: '6px 16px', borderRadius: 99, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.75rem',
              background: enabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: enabled ? '#22c55e' : '#ef4444',
              opacity: toggleLoading === feature ? 0.5 : 1,
            }}
          >{toggleLoading === feature ? '…' : enabled ? '● ON' : '○ OFF'}</button>
        </div>
        {toggledAt && <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Last toggled: {fmtDateTime(toggledAt)}</p>}
        {gaps.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 3 }}>Gap history:</p>
            {gaps.slice(-3).map((g: string, i: number) => (
              <p key={i} style={{ fontSize: '0.6rem', color: '#fca5a5' }}>⏸ {g}</p>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Sub-tabs ───────────────────────────────────────────────────────────────
  const SUBTABS = [
    { key: 'live', label: '🟢 Live' },
    { key: 'sessions', label: '📊 Sessions' },
    { key: 'actions', label: '🛡 Admin Log' },
    { key: 'stats', label: '📈 Stats' },
  ] as const;

  return (
    <div style={{ paddingBottom: 80 }}>

      {/* ── Master toggle ── */}
      <div style={{
        background: masterEnabled ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
        border: `1px solid ${masterEnabled ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        borderRadius: 14, padding: '16px 16px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 700, color: 'var(--gold)', marginBottom: 2 }}>
              Tracking Master Switch
            </p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {masterEnabled ? 'All enabled features are actively recording.' : 'All tracking paused. No data is being written.'}
            </p>
          </div>
          <button
            onClick={toggleMaster}
            disabled={toggleLoading === 'master'}
            style={{
              padding: '8px 20px', borderRadius: 99, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.82rem',
              background: masterEnabled ? '#22c55e' : '#ef4444',
              color: 'white',
              opacity: toggleLoading === 'master' ? 0.5 : 1,
            }}
          >{toggleLoading === 'master' ? '…' : masterEnabled ? '● ON' : '○ OFF'}</button>
        </div>
      </div>

      {/* ── Feature toggles (ordered by cost) ── */}
      {sectionHead('Feature Toggles — Highest Cost First')}
      <ToggleRow
        label="① Presence & Live Users"
        feature="presence"
        cost="~7,680 writes/day at 40 users (5min heartbeat)"
      />
      <ToggleRow
        label="② Session Tracking"
        feature="sessions"
        cost="~1,200 writes/day (start + end + area changes)"
      />
      <ToggleRow
        label="③ Admin Action Log"
        feature="admin_actions"
        cost="~50 writes/day (action-triggered only)"
      />

      {/* ── Refresh bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 4 }}>
        <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          {lastRefresh ? `Last refreshed: ${fmtDateTime(lastRefresh.toISOString())}` : 'Loading…'}
        </p>
        <button
          onClick={loadData}
          disabled={loading}
          style={{ fontSize: '0.72rem', padding: '4px 12px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--gold)', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
        >{loading ? 'Refreshing…' : '↺ Refresh'}</button>
      </div>

      {/* ── Sub-tab bar ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, marginTop: 12, overflowX: 'auto' }}>
        {SUBTABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} style={{
            padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
            background: subTab === t.key ? 'var(--gold)' : 'var(--navy-card)',
            color: subTab === t.key ? '#0a0f1e' : 'var(--text-muted)',
          }}>{t.label}</button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: 20 }}>Loading analytics…</p>}

      {/* ══════════════════════════════════════════════════════════════════════
          SUB-TAB: LIVE
      ══════════════════════════════════════════════════════════════════════ */}
      {!loading && subTab === 'live' && (
        <div>
          {sectionHead('Who\'s Online Right Now')}
          {presence.filter(p => isOnline(p.lastSeen)).length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>No one online right now.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {presence
                .filter(p => isOnline(p.lastSeen))
                .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
                .map(p => (
                  <div key={p.id} style={{ background: 'var(--navy-card)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{p.displayName || p.email}</p>
                      <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{p.email}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 700 }}>{p.currentArea}</p>
                      <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>seen {fmtTime(p.lastSeen)}</p>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {sectionHead('Recently Seen (Last 6 Hours)')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {presence
              .filter(p => !isOnline(p.lastSeen) && p.lastSeen && (Date.now() - new Date(p.lastSeen).getTime()) < 6 * 3600 * 1000)
              .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
              .map(p => (
                <div key={p.id} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{p.displayName || p.email}</p>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>last seen {fmtTime(p.lastSeen)} · {p.currentArea}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SUB-TAB: SESSIONS
      ══════════════════════════════════════════════════════════════════════ */}
      {!loading && subTab === 'sessions' && legacyData && (
        <div>
          {sectionHead('Today\'s App Uptime')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {card('Total Usage Today', fmtDur(legacyData.totalDurationToday), 'sum of all user sessions')}
            {card('Sessions Today', todaySessions.length, 'individual sessions')}
            {card('Unique Users Today', new Set(todaySessions.map((s: any) => s.userId)).size + '')}
          </div>

          {sectionHead('Today\'s Sessions')}
          {todaySessions.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>No sessions recorded today.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todaySessions.map((s: any) => (
                <div key={s.id} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{s.email}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 700 }}>{fmtDur(s.duration)}</p>
                  </div>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    {fmtTime(s.startedAt)} → {s.endedAt ? fmtTime(s.endedAt) : '(active)'}
                  </p>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(s.areas || []).map((a: any, i: number) => (
                      <span key={i} style={{ fontSize: '0.6rem', background: 'rgba(196,160,80,0.08)', color: 'var(--gold)', borderRadius: 99, padding: '1px 7px' }}>
                        {a.area} {a.duration ? `(${fmtDur(a.duration)})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {sectionHead('Most Active Users — Last 7 Days')}
          {legacyData.mostActive.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>No session data yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {legacyData.mostActive.map((u: any, i: number) => (
                <div key={u.uid} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700, minWidth: 18 }}>#{i + 1}</span>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{u.email}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 700 }}>{fmtDur(u.time)}</p>
                    <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{u.sessions} session{u.sessions !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sectionHead('Area Usage — Last 7 Days')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(legacyData.areaTime)
              .sort((a: any, b: any) => b[1] - a[1])
              .map(([area, time]: any) => (
                <div key={area} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', display: 'flex', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{area}</p>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 700 }}>{fmtDur(time)}</p>
                    <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{legacyData.areaFreq[area] || 0} visits</p>
                  </div>
                </div>
              ))}
          </div>

          {sectionHead(`Dormant Users — No Activity in 7+ Days (${legacyData.dormant.length})`)}
          {legacyData.dormant.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#22c55e', textAlign: 'center', padding: 12 }}>All users active in the last 7 days. ✓</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {legacyData.dormant.map((u: any) => (
                <div key={u.id} style={{ background: 'var(--navy-card)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '8px 14px', display: 'flex', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{u.displayName || u.email}</p>
                  <p style={{ fontSize: '0.65rem', color: '#fca5a5' }}>dormant</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SUB-TAB: ADMIN LOG
      ══════════════════════════════════════════════════════════════════════ */}
      {!loading && subTab === 'actions' && (
        <div>
          {sectionHead('Admin Action Log')}
          <input
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            placeholder="Filter by action, email, or target…"
            style={{ width: '100%', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', color: 'var(--text-primary)', fontSize: '0.78rem', marginBottom: 12, boxSizing: 'border-box' as const }}
          />
          {adminActions
            .filter(a => !actionFilter || [a.action, a.email, a.targetName, a.details].join(' ').toLowerCase().includes(actionFilter.toLowerCase()))
            .map(a => (
              <div key={a.id} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, background: 'rgba(196,160,80,0.1)', color: 'var(--gold)', borderRadius: 99, padding: '1px 7px' }}>
                        {a.action.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{a.email}</span>
                    </div>
                    {a.targetName && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2 }}>{a.targetName}</p>}
                    {a.details && <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{a.details}</p>}
                  </div>
                  <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtDateTime(a.at)}</p>
                </div>
              </div>
            ))}
          {adminActions.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>No admin actions recorded yet.</p>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SUB-TAB: STATS
      ══════════════════════════════════════════════════════════════════════ */}
      {!loading && subTab === 'stats' && legacyData && (
        <div>
          {sectionHead('Platform Overview')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {card('Total Users', legacyData.totalUsers)}
            {card('Total Materials', legacyData.mats.length)}
            {card('Total Courses', legacyData.totalCourses)}
            {card('Approved', legacyData.matByStatus['approved'] || 0, undefined, '#22c55e')}
            {card('Pending', legacyData.matByStatus['pending_review'] || 0, undefined, '#eab308')}
            {card('Quarantined', legacyData.matByStatus['quarantined'] || 0, undefined, '#ef4444')}
          </div>

          {sectionHead('Materials by File Type')}
          {Object.entries(legacyData.matByType)
            .sort((a: any, b: any) => b[1] - a[1])
            .map(([ext, count]: any) => row(`.${ext}`, count))}
        </div>
      )}

    </div>
  );
}


// ============================================================
// REPORTS PANEL with sub-tabs
// ============================================================
function ReportsPanel({ db, isChiefAdmin }: { db: any; isChiefAdmin: boolean }) {
  const [subTab, setSubTab] = useState<'uploads' | 'flags'>('uploads');
  const [reports, setReports] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      try {
        const [rSnap, fSnap] = await Promise.all([
          getDocs(query(collection(db, 'upload_reports'), orderBy('timestamp', 'desc'))),
          getDocs(query(collection(db, 'flags'), orderBy('createdAt', 'desc'))),
        ]);
        setReports(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setFlags(fSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, [db]);

  const resolveFlag = async (flagId: string) => {
    await updateDoc(doc(db, 'flags', flagId), { status: 'resolved', adminNote: adminNote[flagId] || '', resolvedAt: new Date().toISOString() });
    setFlags(f => f.map(x => x.id === flagId ? { ...x, status: 'resolved' } : x));
  };

  const statusColor = (s: string) => s === 'resolved' ? 'var(--success,#4caf50)' : '#e07';

  if (loading) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading reports...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['uploads', 'flags'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            padding: '7px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
            background: subTab === t ? 'var(--gold)' : 'var(--surface)',
            color: subTab === t ? '#000' : 'var(--text-muted)',
          }}>
            {t === 'uploads' ? `📁 Uploads (${reports.length})` : `🚩 Flags (${flags.filter(f => f.status !== 'resolved').length} open)`}
          </button>
        ))}
      </div>

      {subTab === 'uploads' && (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {['upload_failed', 'processing_failed', 'partial_batch'].map(type => (
              <div key={type} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', flex: '1 1 120px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{type.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)' }}>{reports.filter(r => r.errorType === type).length}</div>
              </div>
            ))}
          </div>
          {reports.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No upload errors recorded.</p>}
          {reports.map(r => (
            <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{r.fileName}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{r.uploaderEmail} · {r.errorType}</div>
              <div style={{ fontSize: '0.8rem', color: '#f90', marginTop: 4 }}>{r.description}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{r.timestamp?.toDate?.()?.toLocaleString?.() || ''}</div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'flags' && (
        <div>
          {flags.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No flags yet.</p>}
          {flags.map(f => (
            <div key={f.id} style={{ background: 'var(--surface)', border: `1px solid ${statusColor(f.status)}44`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{f.userEmail}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: statusColor(f.status), textTransform: 'uppercase' }}>{f.status}</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', margin: '6px 0' }}><strong>Q:</strong> {f.question}</div>
              <div style={{ fontSize: '0.78rem', color: '#f90' }}><strong>Issue:</strong> {f.studentDescription}</div>
              {f.status !== 'resolved' && isChiefAdmin && (
                <div style={{ marginTop: 10 }}>
                  <textarea
                    placeholder="Admin note (optional)..."
                    value={adminNote[f.id] || ''}
                    onChange={e => setAdminNote(n => ({ ...n, [f.id]: e.target.value }))}
                    style={{ width: '100%', padding: 8, borderRadius: 6, background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.8rem', resize: 'vertical', minHeight: 60 }}
                  />
                  <button onClick={() => resolveFlag(f.id)} style={{
                    marginTop: 6, padding: '6px 16px', background: 'var(--gold)', color: '#000',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem'
                  }}>✓ Resolve</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


export default function AdminPage() {
  const { userProfile, firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;
  const isChiefAdmin = userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;
  const isSupreme = firebaseUser?.email === SUPREME;

  const [tab, setTab] = useState<Tab>('pending');
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [uploads, setUploads]       = useState<Material[]>([]);
  const [pending, setPending]       = useState<Material[]>([]);
  const [approved, setApproved]     = useState<Material[]>([]);
  const [quarantined, setQuarantined] = useState<Material[]>([]);
  const [resurrection, setResurrection] = useState<Material[]>([]);
  const [users, setUsers]           = useState<never[]>([]);
  const [courses, setCourses]       = useState<Course[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Material | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [dupWarn, setDupWarn] = useState<{ material: Material; courseId?: string; courseName?: string; existing: Material; existingCourse: Course | undefined } | null>(null);
  const [shareInput, setShareInput] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [search, setSearch]         = useState('');
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [reassignCourseId, setReassignCourseId] = useState('');
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteConfirmMaterial, setDeleteConfirmMaterial] = useState<Material | null>(null);
  const [reviewConfirmMaterial, setReviewConfirmMaterial] = useState<Material | null>(null);

  async function handleReassign(materialId: string, courseId: string, courseName: string) {
    try {
      const idToken = await firebaseUser?.getIdToken(true);
      if (!idToken) { alert('Not authenticated. Please refresh and try again.'); return; }
      const res = await fetch('/api/index-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ materialId: selected?.id, action: 'add' }),
      });
      if (res.ok) { alert('Reassigned successfully!'); setReassigning(null); setReassignCourseId(''); await load(); }
      else { const d = await res.json(); alert('Failed: ' + (d.error || res.status)); }
    } catch (e: any) { alert('Error: ' + e.message); }
  }

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [u, p, a, q, r] = await Promise.all([
        getMaterialsByStatus('upload_review'),
        getMaterialsByStatus('pending_review'),
        getMaterialsByStatus('approved'),
        getMaterialsByStatus('quarantined'),
        getMaterialsByStatus('ocr_pending'),
      ]);
      setUploads(u); setPending(p); setApproved(a); setQuarantined(q); setResurrection(r);
      const cSnap = await getDocs(query(collection(db, 'courses'), orderBy('name')));
      setCourses(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
    } finally { setLoading(false); }
  }, [isAdmin]);
useEffect(() => {
    if (!selected) { setPreviewText(null); return; }
    setPreviewLoading(true);
    fetch('/api/material-body?materialId=' + encodeURIComponent(selected.id))
      .then(r => r.json())
      .then(d => setPreviewText(d.extractedText ?? null))
      .catch(() => setPreviewText(null))
      .finally(() => setPreviewLoading(false));
  }, [selected?.id]);
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    if (!isAdmin) { router.replace('/dashboard'); return; }
    load();
  }, [authLoading, firebaseUser, isAdmin, load, router]);

  function filterAndSort(list: Material[]) {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(m =>
      m.fileName?.toLowerCase().includes(q) ||
      m.uploaderEmail?.toLowerCase().includes(q) ||
      m.suggestedCourseName?.toLowerCase().includes(q) ||
      m.detectedCourseName?.toLowerCase().includes(q)
    );
  }

  const listMap: Partial<Record<Tab, Material[]>> = {
    uploads: filterAndSort(uploads),
    pending: filterAndSort(pending),
    approved: filterAndSort(approved),
    quarantined: filterAndSort(quarantined),
    resurrection: filterAndSort(resurrection),
  };

  const counts: Partial<Record<Tab, number>> = {
    uploads: uploads.length,
    pending: pending.length,
    approved: approved.length,
    quarantined: quarantined.length,
    resurrection: resurrection.length,
    courses: courses.length,
  };

  async function handleApprove(m: Material, courseId?: string, courseName?: string) {
    const nameDuplicate = approved.find(
      a => a.id !== m.id && a.fileName.toLowerCase() === m.fileName.toLowerCase()
    );
    if (nameDuplicate) {
      const existingCourse = courses.find(c => c.id === (nameDuplicate.confirmedCourseId || nameDuplicate.suggestedCourseId));
      setDupWarn({ material: m, courseId, courseName, existing: nameDuplicate, existingCourse });
      return;
    }
    await doApprove(m, courseId, courseName);
  }

  async function doApprove(m: Material, courseId?: string, courseName?: string) {
    setActionLoading(true);
    try {
      await updateMaterial(m.id, { status: 'approved', confirmedCourseId: courseId ?? m.suggestedCourseId ?? '', confirmedCourseName: courseName ?? m.suggestedCourseName ?? '' });
      logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'material_approved', targetId: m.id, targetName: m.fileName, details: (courseId ?? '') + (courseName ? ' / ' + courseName : '') }).catch(() => {});
      await load();
      setDrawerOpen(false); setSelected(null);
    } finally { setActionLoading(false); }
  }

  async function handleReject(m: Material) {
    setActionLoading(true);
    try {
      await updateMaterialStatus(m.id, 'ocr_pending');
      await load();
      setDrawerOpen(false); setSelected(null);
    } finally { setActionLoading(false); }
  }

  async function handleDelete(m: Material) {
    setDeleteConfirmMaterial(null);
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/delete-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: m.id, publicId: m.publicId }),
      });
      if (!res.ok) { const e = await res.json(); alert('Delete failed: ' + (e.error ?? res.status)); return; }
      logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'material_deleted', targetId: m.id, targetName: m.fileName, details: m.publicId ?? '' }).catch(() => {});
      await load();
      setDrawerOpen(false); setSelected(null);
    } finally { setActionLoading(false); }
  }

  async function handleQuarantine(m: Material) {
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'materials', m.id), { status: 'quarantined' });
      logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'material_quarantined', targetId: m.id, targetName: m.fileName }).catch(() => {});
      await load();
      setDrawerOpen(false); setSelected(null);
    } finally { setActionLoading(false); }
  }

  function openDetail(m: Material) { setSelected(m); if (m.status === 'pending_review' || m.status === 'ocr_pending') { setApprovalOpen(true); } else { setDrawerOpen(true); } }

  if (authLoading || loading) return <LuxLoader label="Admin Panel" />;

  const currentList = listMap[tab] ?? [];

  function MainContent() {
    return (
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
          <div>
            <p style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, marginBottom: 2 }}>
              {TABS.find(t => t.key === tab)?.icon} {TABS.find(t => t.key === tab)?.label}
            </p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '1.3rem', fontWeight: 700 }}>Admin Panel</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isChiefAdmin && <span style={{ fontSize: '0.65rem', background: 'rgba(196,160,80,0.1)', border: '1px solid rgba(196,160,80,0.2)', borderRadius: 99, padding: '3px 9px', color: 'var(--gold)' }}>★ Chief</span>}
          </div>
        </div>

        {tab === 'uploads' && (
          <UploadsPanel
            uploads={filterAndSort(uploads)}
            onRefresh={load}
            onDelete={handleDelete}
            firebaseUser={firebaseUser}
          />
        )}

        {/* Search */}
        {['pending','approved','quarantined','resurrection'].includes(tab) && (
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search filename, course, email…"
            style={{ width: '100%', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 14px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 14, boxSizing: 'border-box' as const }}
          />
        )}

        {/* Material list */}
        {['pending','approved','quarantined','resurrection'].includes(tab) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <p style={{ fontSize: '2rem', marginBottom: 8 }}>✓</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>All clear — nothing {tab === 'pending' ? 'pending review' : tab}.</p>
              </div>
            ) : currentList.map(m => {
              const isHighConf = m.confidence === 'high' && m.suggestedCourseId;
              return (
                <div key={m.id} className="card-hover" onClick={() => openDetail(m)} style={{
                  background: 'var(--navy-card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{m.fileName}</p>
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>{m.uploaderEmail}</p>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {m.category && <span style={{ fontSize: '0.62rem', background: 'rgba(196,160,80,0.08)', color: 'var(--gold)', borderRadius: 99, padding: '1px 7px' }}>{m.category.replace('_',' ')}</span>}
                        {m.confidence && <span style={{ fontSize: '0.62rem', color: m.confidence === 'high' ? '#22c55e' : '#eab308' }}>● {m.confidence}</span>}
                        {m.wordCount ? <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{m.wordCount.toLocaleString()} words</span> : null}
                      </div>
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                          {m.confirmedCourseName
                            ? <span>✅ {m.confirmedCourseName}</span>
                            : (m.suggestedCourseName || m.detectedCourseName)
                            ? <span style={{opacity:0.6}}>📖 {m.suggestedCourseName || m.detectedCourseName}</span>
                            : null}
                        </p>
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {isHighConf && <span style={{ fontSize: '0.6rem', background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 99, padding: '1px 6px' }}>Auto-ready</span>}
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>→</span>
                    </div>
                  </div>
                  {reassigning === m.id ? (
                    <div onClick={e => e.stopPropagation()}>
                      <ReassignPicker
                        courses={courses}
                        defaultCourseId={m.confirmedCourseId ?? m.suggestedCourseId ?? ''}
                        onConfirm={(cId, cName) => { setReassignCourseId(cId); handleReassign(m.id, cId, cName); }}
                        onCancel={() => { setReassigning(null); setReassignCourseId(''); }}
                      />
                    </div>
                  ) : (
                    <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setReassigning(m.id)}
                        style={{ fontSize: '0.68rem', padding: '3px 10px', borderRadius: 6, background: 'transparent', border: '1px solid rgba(196,160,80,0.3)', color: 'var(--gold)', cursor: 'pointer' }}>
                        ↔ Reassign
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Courses tab */}
        {tab === 'courses' && <CoursesPanel courses={courses} onRefresh={load} />}

        {/* Assignments tab */}
        {tab === 'assignments' && <AssignmentsPanel courses={courses} />}

        {/* Users tab */}
        {tab === 'analytics' && (
          <div>
            <AnalyticsPanel db={db} isSupreme={isSupreme} />
          </div>
        )}
        {tab === 'users' && <UsersPanel currentUserEmail={firebaseUser?.email ?? ''} />}

        {/* Reports tab */}
            {tab === 'reports' && <div style={{padding: '24px 16px'}}><ReportsPanel db={db} isChiefAdmin={isChiefAdmin} /></div>}

        {/* Timetables tab */}
        {tab === 'timetables' && <TimetablesPanel courses={courses} />}
      </div>
    );
  }


  return (
    <AppNav>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .tab-bar::-webkit-scrollbar { display: none; }
        .tab-bar { -ms-overflow-style: none; scrollbar-width: none; }
        .card-hover { transition: border-color 0.15s, background 0.15s; }
        .card-hover:hover { border-color: rgba(196,160,80,0.4) !important; background: rgba(196,160,80,0.04) !important; }
        @media (max-width: 899px) {
          .main-content { padding-bottom: 80px !important; }
        }
      `}</style>
      {/* ── Mobile Tab Bar ── */}
      <div className="tab-bar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--navy-card)', borderTop: '1px solid var(--border)',
        display: 'flex', overflowX: 'auto', padding: '8px 0 12px',
        justifyContent: isDesktop ? 'center' : 'flex-start',
      }}>
        {TABS.filter(t => !t.supremeOnly || isSupreme).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '4px 14px', background: 'transparent', border: 'none',
            color: tab === t.key ? 'var(--gold)' : 'var(--text-muted)',
            fontSize: '0.6rem', fontWeight: tab === t.key ? 700 : 400,
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            borderTop: tab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: '1rem' }}>{t.icon}</span>
            {t.label}
            {counts[t.key] ? (
              <span style={{ fontSize: '0.58rem', fontWeight: 700,
                color: t.key === 'quarantined' ? '#ef4444' : '#eab308' }}>
                {counts[t.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Desktop layout wrapper ── */}
      <div className="hidden lg:flex" style={{ flex: 1, minHeight: '100dvh', paddingTop: '56px' }}>

        {/* Desktop admin tab sidebar */}
        <div style={{
          width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'var(--navy-card)', borderRight: '1px solid var(--border)',
          padding: '20px 0', overflowY: 'auto',
        }}>
          <div style={{ padding: '0 16px 16px' }}>
            <p style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, marginBottom: 4 }}>Admin Panel</p>
            {isChiefAdmin && <span style={{ fontSize: '0.62rem', background: 'rgba(196,160,80,0.1)', border: '1px solid rgba(196,160,80,0.2)', borderRadius: 99, padding: '2px 8px', color: 'var(--gold)' }}>★ Chief Admin</span>}
          </div>
          <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
            {[{ label: 'Pending', val: pending.length, color: '#eab308' }, { label: 'Quarantined', val: quarantined.length, color: '#ef4444' }].map(s => s.val > 0 ? (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(196,160,80,0.06)', borderRadius: 6, padding: '3px 10px' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{s.label}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: s.color }}>{s.val}</span>
              </div>
            ) : null)}
          </div>
          {TABS.filter(t => !t.supremeOnly || isSupreme).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px',
              background: tab === t.key ? 'rgba(196,160,80,0.1)' : 'transparent',
              border: 'none', borderLeft: tab === t.key ? '3px solid var(--gold)' : '3px solid transparent',
              color: tab === t.key ? 'var(--gold)' : 'var(--text-muted)',
              fontSize: '0.8rem', fontWeight: tab === t.key ? 700 : 400,
              cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: '0.85rem' }}>{t.icon}</span>
              {t.label}
              {counts[t.key] ? (
                <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700,
                  color: t.key === 'quarantined' ? '#ef4444' : t.key === 'pending' ? '#eab308' : 'var(--gold)',
                  background: 'rgba(196,160,80,0.1)', borderRadius: 99, padding: '1px 6px' }}>
                  {counts[t.key]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Desktop main content */}
        <div style={{ flex: 1, minHeight: '100dvh', background: 'var(--navy)', padding: '16px', paddingTop: '72px', overflowY: 'auto', minWidth: 0 }}>
          <MainContent />
        </div>
      </div>

      {/* Mobile main content */}
      <div className="lg:hidden" style={{ background: 'var(--navy)', padding: '16px', paddingTop: '68px', paddingBottom: '80px', minHeight: '100dvh' }}>
        <MainContent />
      </div>

      {/* Detail Drawer */}
      {drawerOpen && selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)' }} onClick={() => setDrawerOpen(false)}>
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70,
            background: 'var(--navy-card)', borderTop: '1px solid var(--border)',
            borderRadius: '20px 20px 0 0', maxHeight: '90dvh', overflowY: 'auto',
            animation: 'slideUp 0.25s ease',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 99 }} />
            </div>
            <div style={{ padding: '0 16px 32px' }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 700, color: 'var(--gold)', flex: 1 }}>{selected.fileName}</p>
                  <button onClick={() => setDrawerOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', padding: 0, flexShrink: 0 }}>✕</button>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>{selected.uploaderEmail}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selected.category && <span style={{ fontSize: '0.65rem', fontWeight: 700, background: 'rgba(196,160,80,0.1)', color: 'var(--gold)', borderRadius: 99, padding: '2px 8px' }}>{selected.category.replace('_',' ')}</span>}
                  {selected.confidence && <span style={{ fontSize: '0.65rem', color: selected.confidence === 'high' ? '#22c55e' : '#eab308', background: 'rgba(34,197,94,0.08)', borderRadius: 99, padding: '2px 8px' }}>● {selected.confidence} confidence</span>}
                  {selected.wordCount && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{selected.wordCount.toLocaleString()} words</span>}
                </div>
              </div>
              {(selected.suggestedCourseName || selected.detectedCourseName) && (
                <div style={{ background: 'rgba(196,160,80,0.06)', border: '1px solid rgba(196,160,80,0.15)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--gold)', opacity: 0.7, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Classifier Suggestion</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>{selected.suggestedCourseName || selected.detectedCourseName}</p>
                  {selected.classifierReason && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{selected.classifierReason}</p>}
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Extracted Text Preview</p>
                {previewLoading
                  ? <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Loading…</p>
                  : previewText
                    ? <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', maxHeight: 200, overflowY: 'auto', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {previewText.slice(0, 1200).replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/^-\s/gm, '• ')}{previewText.length > 1200 ? '…' : ''}
                      </div>
                    : <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No extracted text.</p>
                }
              </div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Assign to Course</p>
                <CourseSelector
                  courses={courses}
                  defaultCourseId={selected.suggestedCourseId ?? ''}
                  onSelect={(id, name) => handleApprove(selected, id, name)}
                  loading={actionLoading}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.status === 'pending_review' && (
                  <button onClick={() => handleApprove(selected)} disabled={actionLoading} style={{
                    width: '100%', padding: '12px', background: 'var(--gold)', color: 'var(--navy)',
                    border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                    opacity: actionLoading ? 0.6 : 1,
                  }}>
                    {actionLoading ? 'Approving…' : '✓ Approve'}
                  </button>
                )}
                {selected.status === 'approved' && (
                  <button onClick={async () => {
                    if (!window.confirm('Re-index this material? Old chunks will be replaced.')) return;
                    setActionLoading(true);
                    try {
                      const { extractedText } = await fetch('/api/material-body?materialId=' + encodeURIComponent(selected.id)).then(r => r.json());
                      if (!extractedText) { alert('❌ No extracted text found.'); return; }
                      const res = await fetch('/api/admin/reindex-material', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          materialId: selected.id,
                          courseId: selected.confirmedCourseId ?? selected.suggestedCourseId ?? '',
                          courseName: selected.confirmedCourseName ?? selected.suggestedCourseName ?? '',
                          category: selected.category,
                          extractedText,
                          shouldIndex: true,
                        }),
                      });
                      if (res.ok) {
                        logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'material_reindexed', targetId: selected.id, targetName: selected.fileName }).catch(() => {});
                        alert('✅ Re-indexed successfully.'); setDrawerOpen(false); setSelected(null);
                      } else { const d = await res.json(); alert('❌ Failed: ' + (d.error || res.status)); }
                    } finally { setActionLoading(false); }
                  }} disabled={actionLoading} style={{
                    width: '100%', padding: '11px', background: 'transparent',
                    border: '1px solid rgba(196,160,80,0.4)', borderRadius: 10,
                    color: 'var(--gold)', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600,
                    opacity: actionLoading ? 0.6 : 1,
                  }}>
                    {actionLoading ? 'Re-indexing…' : '↺ Re-index chunks'}
                  </button>
                )}
                {selected.status === 'approved' && (
                  <button onClick={async () => {
                    if (refreshLoading) return;
                    setRefreshLoading(true);
                    try {
                      const { extractedText } = await fetch('/api/material-body?materialId=' + encodeURIComponent(selected.id)).then(r => r.json());
                      if (!extractedText) { alert('❌ No extracted text found for this material.'); return; }
                      const res = await fetch('/api/admin/reindex-material', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          materialId: selected.id,
                          courseId: selected.confirmedCourseId ?? selected.suggestedCourseId ?? '',
                          courseName: selected.confirmedCourseName ?? selected.suggestedCourseName ?? '',
                          category: selected.category,
                          extractedText,
                          shouldIndex: true,
                        }),
                      });
      const d = await res.json();
      if (res.ok) {
        logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'topics_refreshed', targetId: selected.id, targetName: selected.fileName }).catch(() => {});
        alert('✅ Topics refresh queued successfully.');
      } else { alert('❌ Failed: ' + (d.error || `Status ${res.status}`)); }
                    } catch (e: any) {
                      alert('❌ Network error: ' + e?.message);
                    } finally { setRefreshLoading(false); }
                  }} disabled={refreshLoading || actionLoading} style={{
                    width: '100%', padding: '11px', background: 'transparent',
                    border: '1px solid rgba(196,160,80,0.4)', borderRadius: 10,
                    color: 'var(--gold)', fontSize: '0.82rem', cursor: refreshLoading ? 'not-allowed' : 'pointer', fontWeight: 600,
                    opacity: refreshLoading || actionLoading ? 0.6 : 1,
                  }}>
                    {refreshLoading ? 'Refreshing…' : '📋 Refresh topics'}
                  </button>
                )}
                {selected.status === 'approved' && (
                  <div style={{ marginBottom: 8 }}>
                    <button onClick={() => { setSharingOpen(o => !o); setShareInput(((selected as any).sharedCourseIds || []).join(', ')); }} style={{
                      width: '100%', padding: '10px', background: 'transparent',
                      border: '1px solid rgba(196,160,80,0.3)', borderRadius: 10,
                      color: 'var(--gold)', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600,
                    }}>🔗 Share with Courses {((selected as any).sharedCourseIds || []).length > 0 ? `(${((selected as any).sharedCourseIds || []).length})` : ''}</button>
                    {dupWarn && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--navy-card)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: '16px', padding: '24px', maxWidth: '420px', width: '100%' }}>
            <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>⚠️</p>
            <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fde68a', marginBottom: '10px' }}>This file already exists in the system</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '6px' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{dupWarn.existing.fileName}</span> is already approved
              {dupWarn.existingCourse ? (
                <> — found in <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{dupWarn.existingCourse.name}</span>,{' '}
                <span style={{ color: 'var(--text-muted)' }}>
                  {dupWarn.existingCourse.department.charAt(0).toUpperCase() + dupWarn.existingCourse.department.slice(1)} · Year {dupWarn.existingCourse.year} · Semester {dupWarn.existingCourse.semester}
                </span></>
              ) : ' in another course'}.
            </p>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
              If this material is needed for another course, use <span style={{ color: 'var(--gold)', fontWeight: 600 }}>Share with courses</span> in the Approved panel instead.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDupWarn(null)}
                style={{ flex: 1, padding: '10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.84rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={async () => { const w = dupWarn; setDupWarn(null); await doApprove(w.material, w.courseId, w.courseName); }}
                disabled={actionLoading}
                style={{ flex: 1, padding: '10px', borderRadius: '9px', border: 'none', background: 'rgba(234,179,8,0.15)', color: '#fde68a', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', opacity: actionLoading ? 0.5 : 1 }}>
                {actionLoading ? 'Approving…' : 'Approve Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
                    {sharingOpen && (
                      <div style={{ marginTop: 8, padding: 12, background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Select courses to share this material with. It will appear in their Materials panel.</div>
                        <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {courses.filter(c => c.id !== selected.confirmedCourseId).map(c => {
                            const checked = shareInput.split(',').map(s => s.trim()).filter(Boolean).includes(c.id);
                            return (
                              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: checked ? 'rgba(196,160,80,0.1)' : 'var(--navy)', cursor: 'pointer', border: `1px solid ${checked ? 'var(--gold)' : 'var(--border)'}` }}>
                                <input type="checkbox" checked={checked} onChange={e => {
                                  const ids = shareInput.split(',').map(s => s.trim()).filter(Boolean);
                                  const next = e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id);
                                  setShareInput(next.join(', '));
                                }} style={{ accentColor: 'var(--gold)' }} />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
                                  {c.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>· Year {c.year} Sem {c.semester} · {c.department}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <button onClick={async () => {
                          setShareLoading(true);
                          try {
                            const ids = shareInput.split(',').map(s => s.trim()).filter(Boolean);
                            await updateDoc(doc(db, 'materials', selected.id), { sharedCourseIds: ids, updatedAt: new Date().toISOString() });
                            (selected as any).sharedCourseIds = ids;
                            setSharingOpen(false);
                            alert('✅ Sharing updated.');
                          } catch (e: any) { alert('❌ Failed: ' + e.message); }
                          finally { setShareLoading(false); }
                        }} disabled={shareLoading} style={{
                          marginTop: 10, width: '100%', padding: '8px', background: 'var(--gold)',
                          border: 'none', borderRadius: 8, color: '#000', fontWeight: 700,
                          fontSize: '0.8rem', cursor: shareLoading ? 'not-allowed' : 'pointer',
                          opacity: shareLoading ? 0.6 : 1,
                        }}>{shareLoading ? 'Saving...' : 'Save Sharing'}</button>
                      </div>
                    )}
                  </div>
                )}
                {selected.status !== 'quarantined' && (
                  <button onClick={() => { if (!window.confirm('Quarantine this material? It will be hidden from students.')) return; handleQuarantine(selected); }} disabled={actionLoading} style={{
                    width: '100%', padding: '10px', background: 'transparent',
                    border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
                    color: '#fca5a5', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600,
                  }}>⚠ Quarantine</button>
                )}
                {(selected.status === 'quarantined' || selected.status === 'approved') && (
                  <button onClick={() => setReviewConfirmMaterial(selected)} disabled={actionLoading} style={{
                    width: '100%', padding: '10px', background: 'transparent',
                    border: '1px solid rgba(234,179,8,0.4)', borderRadius: 10,
                    color: '#fde68a', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600,
                  }}>↩ Send Back to Review</button>
                )}
                <button onClick={() => setDeleteConfirmMaterial(selected)} disabled={actionLoading} style={{
                  width: '100%', padding: '10px', background: 'transparent',
                  border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10,
                  color: '#ef4444', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600,
                }}>🗑 Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {approvalOpen && selected && (
        <ApprovalModal
          material={selected}
          courses={courses}
          onClose={() => { setApprovalOpen(false); setSelected(null); }}
          onDone={() => { setApprovalOpen(false); setSelected(null); load(); }}
        />
      )}

      {reviewConfirmMaterial && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          background: 'rgba(5,10,24,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'var(--navy-card)',
            border: '1px solid rgba(234,179,8,0.3)',
            borderRadius: 16, padding: '28px 24px',
            maxWidth: 340, width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            <p style={{ fontSize: '1.6rem', textAlign: 'center', marginBottom: 12 }}>↩</p>
            <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 8 }}>
              Send back to review?
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5, marginBottom: 6 }}>
              {reviewConfirmMaterial.fileName}
            </p>
            <p style={{ fontSize: '0.74rem', color: '#fde68a', textAlign: 'center', lineHeight: 1.6, marginBottom: 24 }}>
              This material will be hidden from students and moved back to the uploads queue for editing and re-approval.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setReviewConfirmMaterial(null)}
                style={{
                  flex: 1, padding: '11px', background: 'transparent',
                  border: '1px solid var(--border)', borderRadius: 10,
                  color: 'var(--text-muted)', fontSize: '0.84rem',
                  cursor: 'pointer', fontWeight: 600,
                }}
              >Cancel</button>
              <button
                onClick={async () => {
                  setActionLoading(true);
                  try {
                    await updateDoc(doc(db, 'materials', reviewConfirmMaterial.id), {
                      status: 'pending_review',
                      updatedAt: new Date().toISOString(),
                    });
                    logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'material_sent_to_review', targetId: reviewConfirmMaterial.id, targetName: reviewConfirmMaterial.fileName }).catch(() => {});
                    load();
                    setSelected(null);
                    setReviewConfirmMaterial(null);
                  } finally { setActionLoading(false); }
                }}
                disabled={actionLoading}
                style={{
                  flex: 1, padding: '11px',
                  background: 'rgba(234,179,8,0.15)',
                  border: '1px solid rgba(234,179,8,0.4)',
                  borderRadius: 10, color: '#fde68a',
                  fontSize: '0.84rem', fontWeight: 700,
                  cursor: 'pointer', opacity: actionLoading ? 0.6 : 1,
                }}
              >{actionLoading ? 'Moving…' : 'Send to review'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmMaterial && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          background: 'rgba(5,10,24,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'var(--navy-card)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 16, padding: '28px 24px',
            maxWidth: 340, width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            <p style={{ fontSize: '1.6rem', textAlign: 'center', marginBottom: 12 }}>🗑️</p>
            <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 8 }}>
              Delete permanently?
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5, marginBottom: 6 }}>
              {deleteConfirmMaterial.fileName}
            </p>
            <p style={{ fontSize: '0.74rem', color: '#fca5a5', textAlign: 'center', lineHeight: 1.6, marginBottom: 24 }}>
              Removes the file from storage, all extracted text, and all indexed chunks. Cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirmMaterial(null)}
                style={{
                  flex: 1, padding: '11px', background: 'transparent',
                  border: '1px solid var(--border)', borderRadius: 10,
                  color: 'var(--text-muted)', fontSize: '0.84rem',
                  cursor: 'pointer', fontWeight: 600,
                }}
              >Cancel</button>
              <button
                onClick={() => handleDelete(deleteConfirmMaterial)}
                disabled={actionLoading}
                style={{
                  flex: 1, padding: '11px', background: '#ef4444',
                  border: 'none', borderRadius: 10, color: 'white',
                  fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer',
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >{actionLoading ? 'Deleting…' : 'Delete permanently'}</button>
            </div>
          </div>
        </div>
      )}
    </AppNav>
  );
}


// ── Course Selector ────────────────────────────────────────────────────────────
function CourseSelector({ courses, defaultCourseId, onSelect, loading }: {
  courses: Course[]; defaultCourseId: string;
  onSelect: (id: string, name: string) => void; loading: boolean;
}) {
  const [selected, setSelected] = useState(defaultCourseId);
  const grouped = courses.reduce<Record<string, Course[]>>((acc, c) => {
    const key = `${c.department} · Year ${c.year} · Sem ${c.semester}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <select value={selected} onChange={e => setSelected(e.target.value)} style={{
        flex: 1, background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.82rem'
      }}>
        <option value="">— No course —</option>
        {Object.entries(grouped).map(([group, list]) => (
          <optgroup key={group} label={group}>
            {list.map(c => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</option>)}
          </optgroup>
        ))}
      </select>
      <button
        onClick={() => { const c = courses.find(x => x.id === selected); if (c) onSelect(c.id, c.name); }}
        disabled={loading || !selected}
        style={{ padding: '8px 14px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', opacity: (!selected || loading) ? 0.5 : 1 }}>
        Assign
      </button>
    </div>
  );
}

// ── Reassign Picker ───────────────────────────────────────────────────────────
function ReassignPicker({ courses, defaultCourseId, onConfirm, onCancel }: {
  courses: Course[];
  defaultCourseId: string;
  onConfirm: (courseId: string, courseName: string) => void;
  onCancel: () => void;
}) {
  const [dept, setDept] = useState('');
  const [year, setYear] = useState('');
  const [sem, setSem] = useState('');
  const [search, setSearch]         = useState('');
  const [deleteConfirmMaterial, setDeleteConfirmMaterial] = useState<Material | null>(null);
  const [selectedId, setSelectedId] = useState(defaultCourseId);

  const depts = Array.from(new Set(courses.map(c => c.department))).sort();
  const years = Array.from(new Set(courses.map(c => String(c.year)))).sort();
  const sems = Array.from(new Set(courses.map(c => String(c.semester)))).sort();

  const filtered = courses.filter(c => {
    if (dept && c.department !== dept) return false;
    if (year && String(c.year) !== year) return false;
    if (sem && String(c.semester) !== sem) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sel = courses.find(c => c.id === selectedId);

  return (
    <div style={{ marginTop: 8, background: 'var(--navy)', border: '1px solid rgba(196,160,80,0.25)', borderRadius: 10, padding: 10 }}>
      <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>↔ Reassign to course</p>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        <select value={dept} onChange={e => setDept(e.target.value)}
          style={{ flex: 1, minWidth: 80, background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', color: 'var(--text-primary)', fontSize: '0.72rem' }}>
          <option value=''>All depts</option>
          {depts.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)}
          style={{ flex: 1, minWidth: 60, background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', color: 'var(--text-primary)', fontSize: '0.72rem' }}>
          <option value=''>All yrs</option>
          {years.map(y => <option key={y} value={y}>Yr {y}</option>)}
        </select>
        <select value={sem} onChange={e => setSem(e.target.value)}
          style={{ flex: 1, minWidth: 60, background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', color: 'var(--text-primary)', fontSize: '0.72rem' }}>
          <option value=''>All sems</option>
          {sems.map(s => <option key={s} value={s}>Sem {s}</option>)}
        </select>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder='Search course name...'
        style={{ width: '100%', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', color: 'var(--text-primary)', fontSize: '0.72rem', marginBottom: 6, boxSizing: 'border-box' as const }} />
      <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {filtered.length === 0 && <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No courses found</p>}
        {filtered.map(c => (
          <button key={c.id} onClick={() => setSelectedId(c.id)}
            style={{ textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: `1px solid ${selectedId === c.id ? 'var(--gold)' : 'var(--border)'}`,
              background: selectedId === c.id ? 'rgba(196,160,80,0.12)' : 'transparent',
              color: selectedId === c.id ? 'var(--gold)' : 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}>
            {c.name} <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>· {c.department} Yr{c.year} Sem{c.semester}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => { if (sel) onConfirm(sel.id, sel.name); }}
          disabled={!selectedId}
          style={{ flex: 1, padding: '7px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', opacity: selectedId ? 1 : 0.5 }}>
          Confirm
        </button>
        <button onClick={onCancel}
          style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer' }}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Courses Panel ──────────────────────────────────────────────────────────────
function CoursesPanel({ courses, onRefresh }: { courses: Course[]; onRefresh: () => void }) {
  const { userProfile, firebaseUser } = useAuth();
  const isChiefAdmin = userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;
  const isSupreme = firebaseUser?.email === SUPREME;
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', department: 'philosophy', year: 1, semester: 1, description: '', published: true });

  const grouped = courses.reduce<Record<string, Course[]>>((acc, c) => {
    const key = `${c.department.charAt(0).toUpperCase() + c.department.slice(1)} · Year ${c.year} · Sem ${c.semester}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  function openEdit(c: any) {
    setEditId(c.id);
    setForm({ name: c.name, code: c.code || '', department: c.department, year: c.year, semester: c.semester, description: c.description || '', published: c.published !== false });
    setShowForm(true);
  }

  function openAdd() {
    setEditId(null);
    setForm({ name: '', code: '', department: 'philosophy', year: 1, semester: 1, description: '', published: true });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name) return;
    setSaving(true);
    try {
      const data = { name: form.name, code: form.code, department: form.department, year: Number(form.year), semester: Number(form.semester), description: form.description, published: form.published };
      if (editId) {
        await updateDoc(doc(db, 'courses', editId), data);
        logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'course_edited', targetId: editId, targetName: form.name }).catch(() => {});
      } else {
        const newDoc = await addDoc(collection(db, 'courses'), { ...data, createdAt: serverTimestamp() });
        logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'course_added', targetId: newDoc.id, targetName: form.name }).catch(() => {});
      }
      setShowForm(false);
      setEditId(null);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!isChiefAdmin) { alert('Only chief admin can delete courses. Please contact chief admin.'); return; }
    if (!window.confirm('Delete this course permanently? All linked materials will lose their course assignment.')) return;
    await deleteDoc(doc(db, 'courses', id));
    logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'course_deleted', targetId: id, targetName: courses.find((c: any) => c.id === id)?.name ?? id }).catch(() => {});
    onRefresh();
  }

  async function handleTogglePublish(c: any) {
    await updateDoc(doc(db, 'courses', c.id), { published: !(c.published !== false) });
    onRefresh();
  }

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 8, boxSizing: 'border-box' as const };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{courses.length} course{courses.length !== 1 ? 's' : ''}</p>
        <button onClick={openAdd} style={{ background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>+ Add Course</button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '0.9rem', marginBottom: 12, fontWeight: 700 }}>{editId ? 'Edit Course' : 'New Course'}</p>
          <input style={inputStyle} placeholder="Course name *" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
          <input style={inputStyle} placeholder="Course code (e.g. PHI301)" value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value}))} />
          <input style={inputStyle} placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={form.department} onChange={e => setForm(f => ({...f, department: e.target.value}))} style={{...inputStyle, marginBottom: 0, flex: 1}}>
              <option value="philosophy">Philosophy</option>
              <option value="theology">Theology</option>
            </select>
            <select value={form.year} onChange={e => setForm(f => ({...f, year: Number(e.target.value)}))} style={{...inputStyle, marginBottom: 0, flex: 1}}>
              {[1,2,3,4].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
            <select value={form.semester} onChange={e => setForm(f => ({...f, semester: Number(e.target.value)}))} style={{...inputStyle, marginBottom: 0, flex: 1}}>
              <option value={1}>Sem 1</option>
              <option value={2}>Sem 2</option>
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({...f, published: e.target.checked}))} />
            Published (visible to students)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !form.name} style={{ flex: 1, padding: '10px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: saving || !form.name ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setShowForm(false)} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {Object.entries(grouped).sort().map(([group, list]) => (
        <div key={group} style={{ marginBottom: 20 }}>
          <p style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, marginBottom: 8 }}>{group}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map((c: any) => (
              <div key={c.id} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: '0.85rem', color: c.published !== false ? 'var(--text-primary)' : 'var(--text-muted)' }}>{c.name}</p>
                    <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 99, background: c.published !== false ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: c.published !== false ? '#22c55e' : '#ef4444' }}>{c.published !== false ? 'Live' : 'Hidden'}</span>
                  </div>
                  {c.code && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.code}</p>}
                </div>
                <button onClick={() => handleTogglePublish(c)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.68rem', flexShrink: 0 }}>{c.published !== false ? 'Hide' : 'Publish'}</button>
                <button onClick={() => openEdit(c)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.68rem', flexShrink: 0 }}>Edit</button>
                <button onClick={() => handleDelete(c.id)} style={{ background: 'transparent', border: 'none', color: isChiefAdmin ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: '0.8rem', padding: '3px 6px', borderRadius: 6, flexShrink: 0 }} title={isChiefAdmin ? 'Delete' : 'Only chief admin can delete'}>✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {courses.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: '1.8rem', marginBottom: 8 }}>📚</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No courses yet. Add your first course above.</p>
        </div>
      )}
    </div>
  );
}

// ── Assignments Panel ──────────────────────────────────────────────────────────
function AssignmentsPanel({ courses }: { courses: Course[] }) {
  const { firebaseUser } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extending, setExtending] = useState<string | null>(null);
  const [extendDate, setExtendDate] = useState('');
  const [form, setForm] = useState({ title: '', description: '', type: 'Essay', courseId: '', dueDate: '' });
  const TYPES = ['Essay', 'Presentation', 'Test', 'Seminar paper', 'Report', 'Other'];

  useEffect(() => { loadAssignments(); }, []);

  async function loadAssignments() {
    try {
      const snap = await getDocs(query(collection(db, 'assignments'), where('status', '==', 'active'), orderBy('dueDate', 'asc')));
      const now = new Date();
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => new Date(a.dueDate) >= now));
    } catch {}
  }

  async function handleSave() {
    if (!form.title || !form.dueDate || !form.courseId) return;
    setSaving(true);
    try {
      const course = courses.find(c => c.id === form.courseId);
      await addDoc(collection(db, 'assignments'), {
        ...form, courseName: course?.name ?? '',
        department: course?.department ?? '', year: course?.year ?? 1, semester: course?.semester ?? 1,
        status: 'active', createdAt: new Date().toISOString(),
      });
      setShowForm(false);
      setForm({ title: '', description: '', type: 'Essay', courseId: '', dueDate: '' });
      await loadAssignments();
    } catch { alert('Failed to save'); } finally { setSaving(false); }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Cancel this assignment?')) return;
    await updateDoc(doc(db, 'assignments', id), { status: 'cancelled', updatedAt: new Date().toISOString() });
    const a = assignments.find((x: any) => x.id === id);
    logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'assignment_cancelled', targetId: id, targetName: a?.title ?? id }).catch(() => {});
    await loadAssignments();
  }

  async function handleExtend(id: string) {
    if (!extendDate) return;
    await updateDoc(doc(db, 'assignments', id), { dueDate: extendDate, extended: true, updatedAt: new Date().toISOString() });
    setExtending(null); setExtendDate('');
    await loadAssignments();
  }

  const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  const urgencyColor = (d: number) => d <= 1 ? '#ef4444' : d <= 3 ? '#eab308' : '#22c55e';

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 8, boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{assignments.length} active</p>
        <button onClick={() => setShowForm(s => !s)} style={{ background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>+ Add</button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <input style={inputStyle} placeholder="Title *" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} />
          <input style={inputStyle} placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} style={{...inputStyle, marginBottom: 0, flex: 1}}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input type="date" value={form.dueDate} onChange={e => setForm(f => ({...f, dueDate: e.target.value}))} style={{...inputStyle, marginBottom: 0, flex: 1}} />
          </div>
          <select value={form.courseId} onChange={e => setForm(f => ({...f, courseId: e.target.value}))} style={inputStyle}>
            <option value="">Select course *</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !form.title || !form.courseId || !form.dueDate} style={{ flex: 1, padding: '10px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {assignments.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: '1.8rem', marginBottom: 8 }}>📋</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No active assignments.</p>
        </div>
      )}

      {assignments.map((a: any) => {
        const days = daysUntil(a.dueDate);
        return (
          <div key={a.id} style={{ background: 'var(--navy-card)', border: `1px solid ${days <= 3 ? urgencyColor(days) + '33' : 'var(--border)'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, background: 'rgba(196,160,80,0.1)', color: 'var(--gold)', borderRadius: 99, padding: '2px 7px' }}>{a.type}</span>
                  {a.extended && <span style={{ fontSize: '0.6rem', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', borderRadius: 99, padding: '2px 7px' }}>Extended</span>}
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: urgencyColor(days) }}>{days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `${days}d left`}</span>
                </div>
                <p style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 2 }}>{a.title}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{a.courseName}</p>
                {a.description && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{a.description}</p>}
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>Due: {new Date(a.dueDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
            {extending === a.id ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input type="date" value={extendDate} onChange={e => setExtendDate(e.target.value)} style={{ flex: 1, background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', color: 'var(--text-primary)', fontSize: '0.78rem' }} />
                <button onClick={() => handleExtend(a.id)} style={{ background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 6, padding: '5px 12px', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Save</button>
                <button onClick={() => setExtending(null)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => { setExtending(a.id); setExtendDate(a.dueDate); }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.72rem' }}>Extend</button>
                <button onClick={() => handleCancel(a.id)} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 10px', color: '#fca5a5', cursor: 'pointer', fontSize: '0.72rem' }}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Users Panel ────────────────────────────────────────────────────────────────
function UsersPanel({ currentUserEmail }: { currentUserEmail: string }) {
  const { userProfile, firebaseUser } = useAuth();
  const isChiefAdmin = userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;
  const isSupreme = firebaseUser?.email === SUPREME;
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')))
      .then(snap => setUsers(snap.docs.map(d => ({ id: d.id, uid: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function setRole(uid: string, role: string) {
    if (!isChiefAdmin) { alert('Only chief admin can change roles.'); return; }
    if (role === 'chief_admin' && !window.confirm('Promote this user to Chief Admin? They will have full administrative access.')) return;
    if (role === 'student' && !window.confirm('Remove this admin role? They will lose all admin access.')) return;
    setActionLoading(uid);
    try {
      const res = await fetch('/api/admin/set-role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUid: uid, role, idToken: await firebaseUser?.getIdToken(true) }) });
      if (res.ok) {
        setUsers(u => u.map(x => x.uid === uid ? { ...x, role } : x));
        const u = users.find((x: any) => x.uid === uid);
        logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'user_role_changed', targetId: uid, targetName: u?.email ?? uid, details: '→ ' + role }).catch(() => {});
      } else { const d = await res.json(); alert('Role change failed: ' + (d.error || res.status)); }
    } finally { setActionLoading(null); }
  }

  async function handleDeactivate(uid: string) {
    if (!isChiefAdmin) { alert('Only chief admin can deactivate users.'); return; }
    if (uid === firebaseUser?.uid) { alert('You cannot deactivate your own account.'); return; }
    if (!window.confirm('Deactivate this user? They will not be able to log in.')) return;
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), { isActive: false, updatedAt: new Date().toISOString() });
      setUsers(u => u.map(x => x.uid === uid ? { ...x, isActive: false } : x));
      const u = users.find((x: any) => x.uid === uid);
      logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'user_deactivated', targetId: uid, targetName: u?.email ?? uid }).catch(() => {});
    } finally { setActionLoading(null); }
  }

  async function handleReactivate(uid: string) {
    if (!isChiefAdmin) { alert('Only chief admin can reactivate users.'); return; }
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), { isActive: true, updatedAt: new Date().toISOString() });
      setUsers(u => u.map(x => x.uid === uid ? { ...x, isActive: true } : x));
      const u = users.find((x: any) => x.uid === uid);
      logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'user_reactivated', targetId: uid, targetName: u?.email ?? uid }).catch(() => {});
    } finally { setActionLoading(null); }
  }

  async function handleDelete(uid: string) {
    if (!isChiefAdmin) { alert('Only chief admin can delete users. Please contact chief admin.'); return; }
    if (uid === firebaseUser?.uid) { alert('You cannot delete your own account.'); return; }
    setActionLoading(uid);
    try {
      const u = users.find((x: any) => x.uid === uid);
      await updateDoc(doc(db, 'users', uid), { isActive: false, deletedAt: new Date().toISOString(), fcmToken: null });
      logAdminAction({ adminId: firebaseUser?.uid ?? '', email: firebaseUser?.email ?? '', action: 'user_deleted', targetId: uid, targetName: u?.email ?? uid }).catch(() => {});
      setConfirmDelete(null);
      setUsers(u => u.filter(x => x.uid !== uid));
    } catch { alert('Delete failed.'); }
    finally { setActionLoading(null); }
  }

  const filtered = users.filter(u => !search || (u.email || '').toLowerCase().includes(search.toLowerCase()) || (u.displayName || '').toLowerCase().includes(search.toLowerCase()));

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>;

  const ROLE_COLORS: Record<string, string> = { chief_admin: 'var(--gold)', admin: '#a5b4fc', student: 'var(--text-muted)', class_rep: '#34d399' };

  return (
    <div>
      {!isChiefAdmin && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.8rem', color: '#fca5a5' }}>⚠️ Full user management is restricted to chief admin. Contact chief admin for role changes or deletions.</div>}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ width: '100%', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 12, boxSizing: 'border-box' as const }} />
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</p>
      {filtered.map(u => {
        const isThisSupreme = u.email === SUPREME;
        const isBusy = actionLoading === u.uid;
        return (
          <div key={u.uid || u.id} style={{ background: 'var(--navy-card)', border: `1px solid ${u.isActive === false ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, opacity: u.isActive === false ? 0.6 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName || u.email}</p>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{u.email}</p>
                {u.department && <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{u.department} · Yr {u.year} · Sem {u.currentSemester}</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, background: 'rgba(255,255,255,0.05)', color: ROLE_COLORS[u.role] || 'var(--text-muted)', borderRadius: 99, padding: '2px 8px' }}>{isThisSupreme ? '⭐ Supreme' : u.role || 'student'}</span>
                {u.isActive === false && <span style={{ fontSize: '0.6rem', color: '#ef4444' }}>Inactive</span>}
              </div>
            </div>
            {isChiefAdmin && !isThisSupreme && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {u.role === 'student' && <button onClick={() => setRole(u.uid, 'admin')} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(165,180,252,0.3)', background: 'transparent', color: '#a5b4fc', cursor: 'pointer' }}>→ Admin</button>}
                {u.role === 'student' && <button onClick={() => setRole(u.uid, 'chief_admin')} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(196,160,80,0.3)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer' }}>→ Chief</button>}
                {(u.role === 'admin' || u.role === 'chief_admin') && <button onClick={() => setRole(u.uid, 'student')} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#fca5a5', cursor: 'pointer' }}>Remove role</button>}
                {u.isActive !== false ? <button onClick={() => handleDeactivate(u.uid)} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Deactivate</button>
                : <button onClick={() => handleReactivate(u.uid)} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.3)', background: 'transparent', color: '#22c55e', cursor: 'pointer' }}>Reactivate</button>}
                {confirmDelete === u.uid ? (
                  <>
                    <button onClick={() => handleDelete(u.uid)} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 700 }}>Confirm delete</button>
                    <button onClick={() => setConfirmDelete(null)} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDelete(u.uid)} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'transparent', color: 'rgba(239,68,68,0.6)', cursor: 'pointer' }}>Delete</button>
                )}
                {isBusy && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>…</span>}
              </div>
            )}
          </div>
        );
      })}
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '60px 0' }}><p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No users found.</p></div>}
    </div>
  );
}

// ── Timetables Panel ───────────────────────────────────────────────────────────
function TimetablesPanel({ courses }: { courses: Course[] }) {
  const [timetables, setTimetables] = useState<any[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});

  const SLOTS = [
    { key: 'philosophy_normal', dept: 'philosophy', type: 'normal', label: 'Philosophy — General Timetable', desc: 'Daily/weekly schedule for Philosophy students' },
    { key: 'philosophy_exam', dept: 'philosophy', type: 'exam', label: 'Philosophy — Exam Timetable', desc: 'Regular exam schedule for Philosophy' },
    { key: 'philosophy_bphil', dept: 'philosophy', type: 'bphil', label: 'Philosophy — BPhil Exams (Year 4)', desc: 'Bachelor of Philosophy final exams' },
    { key: 'theology_normal', dept: 'theology', type: 'normal', label: 'Theology — General Timetable', desc: 'Daily/weekly schedule for Theology students' },
    { key: 'theology_exam', dept: 'theology', type: 'exam', label: 'Theology — Exam Timetable', desc: 'Regular exam schedule for Theology' },
    { key: 'theology_bth', dept: 'theology', type: 'bth', label: 'Theology — BTh Exams (Year 3)', desc: 'Bachelor of Theology final exams' },
  ];

  useEffect(() => { loadTimetables(); }, []);

  async function loadTimetables() {
    try {
      const snap = await getDocs(collection(db, 'timetables'));
      setTimetables(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {}
  }

  function getExisting(dept: string, type: string) {
    return timetables.find((t: any) => t.department === dept && t.type === type);
  }

  async function handleUpload(slot: typeof SLOTS[0]) {
    const file = files[slot.key];
    if (!file) return;
    setUploading(slot.key);
    setResult(r => ({ ...r, [slot.key]: '' }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('department', slot.dept);
      formData.append('type', slot.type);
      const res = await fetch('/api/upload-timetable', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setResult(r => ({ ...r, [slot.key]: `✅ Uploaded. ${data.examDates?.length ?? 0} dates extracted.` }));
        await loadTimetables();
        setFiles(f => ({ ...f, [slot.key]: null }));
      } else {
        setResult(r => ({ ...r, [slot.key]: `❌ ${data.error}` }));
      }
    } catch { setResult(r => ({ ...r, [slot.key]: '❌ Upload failed' })); }
    finally { setUploading(null); }
  }

  const inputStyle: React.CSSProperties = { background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: '0.82rem' };

  return (
    <div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>Upload one timetable per slot. Re-uploading replaces the existing one. OCR automatically extracts exam dates.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SLOTS.map(slot => {
          const existing = getExisting(slot.dept, slot.type);
          const isUploading = uploading === slot.key;
          const msg = result[slot.key];
          return (
            <div key={slot.key} style={{ background: 'var(--navy-card)', border: `1px solid ${existing ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 2 }}>{slot.label}</p>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{slot.desc}</p>
                </div>
                {existing && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.62rem', color: '#22c55e' }}>✓ Uploaded</span>
                  <a href={existing.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: 'var(--gold)', textDecoration: 'none' }}>View →</a>
                </div>}
              </div>
              {existing?.examDates?.length > 0 && (
                <div style={{ marginBottom: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  {existing.examDates.slice(0, 2).map((d: any, i: number) => (
                    <p key={i} style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>📅 {d.date} — {(d.courseName || '').substring(0, 45)}</p>
                  ))}
                  {existing.examDates.length > 2 && <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>+{existing.examDates.length - 2} more dates</p>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={e => setFiles(f => ({ ...f, [slot.key]: e.target.files?.[0] ?? null }))} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1 }} />
                <button onClick={() => handleUpload(slot)} disabled={!files[slot.key] || isUploading} style={{ ...inputStyle, background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 700, cursor: 'pointer', opacity: (!files[slot.key] || isUploading) ? 0.6 : 1, padding: '7px 16px', flexShrink: 0 }}>
                  {isUploading ? 'Uploading…' : existing ? 'Replace' : 'Upload'}
                </button>
              </div>
              {msg && <p style={{ fontSize: '0.75rem', marginTop: 6, color: msg.startsWith('✅') ? '#22c55e' : '#ef4444' }}>{msg}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

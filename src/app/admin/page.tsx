"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, getDocs, query, orderBy, doc, updateDoc, getDoc,
} from "firebase/firestore";
import {
  ref, uploadBytesResumable, getDownloadURL, listAll, getMetadata,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase/config";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  getMaterialsByStatus, updateMaterialStatus, saveChunks,
  resurrectMaterialsForCourse, Material, getReports, getMaterialStats,
  UploadReport, MaterialStats,
} from "@/lib/firestore/materials";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Course {
  id: string;
  name: string;
  code: string;
  department: string;
  year: number;
  semester: number;
  readiness?: "empty" | "partial" | "verified";
  materials?: Record<string, Record<string, string>>;
}

interface GroupedCourses {
  [department: string]: {
    [year: number]: {
      [semester: number]: Course[];
    };
  };
}

type UploadCategory = "lecture_notes" | "syllabus" | "aoc" | "past_questions";

const CATEGORIES: { key: UploadCategory; label: string; icon: string }[] = [
  { key: "lecture_notes", label: "Lecture Notes", icon: "📖" },
  { key: "syllabus", label: "Syllabus", icon: "📋" },
  { key: "aoc", label: "Areas of Concentration", icon: "🎯" },
  { key: "past_questions", label: "Past Questions", icon: "📝" },
];

interface ExistingFile {
  name: string;
  url: string;
  size?: number;
  uploadedAt?: string;
}

type ReviewTab = "pending_review" | "quarantined" | "awaiting_course" | "ocr_pending";

type FileStatus = {
  status: "idle" | "uploading" | "extracting" | "classifying" | "done" | "error";
  progress: number;
  error?: string;
  result?: {
    materialId: string;
    detectedStatus: string;
    category: string;
    suggestedCourseName: string | null;
    detectedCourseName: string | null;
    confidence: string;
    wordCount: number;
  };
};

// ─── Hint System ──────────────────────────────────────────────────────────────
export type HintSeverity = "info" | "tip" | "warning" | "action";

export interface Hint {
  id: string;
  severity: HintSeverity;
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

function AdminHints({ hints }: { hints: Hint[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = hints.filter((h) => !dismissed.has(h.id));
  if (visible.length === 0) return null;

  const severityStyles: Record<HintSeverity, string> = {
    info: "bg-blue-500/10 border-blue-500/20 text-blue-300",
    tip: "bg-[var(--color-gold)]/10 border-[var(--color-gold)]/20 text-[var(--color-gold)]",
    warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-300",
    action: "bg-purple-500/10 border-purple-500/20 text-purple-300",
  };

  const actionButtonStyles: Record<HintSeverity, string> = {
    info: "border-blue-400/40 text-blue-400 hover:bg-blue-500/10",
    tip: "border-[var(--color-gold)]/40 text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10",
    warning: "border-yellow-400/40 text-yellow-400 hover:bg-yellow-500/10",
    action: "border-purple-400/40 text-purple-400 hover:bg-purple-500/10",
  };

  return (
    <div className="mb-8 space-y-2">
      {visible.map((hint) => (
        <div key={hint.id} className={`flex items-start justify-between gap-4 px-4 py-3 rounded-xl border text-sm ${severityStyles[hint.severity]}`}>
          <div className="flex items-start gap-3 flex-1">
            <span className="text-base flex-shrink-0 mt-0.5">{hint.icon}</span>
            <div className="space-y-1">
              <p className="font-semibold">{hint.title}</p>
              <p className="text-xs opacity-80 leading-relaxed">{hint.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hint.action && (
              <button onClick={hint.action.onClick}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${actionButtonStyles[hint.severity]}`}>
                {hint.action.label}
              </button>
            )}
            <button onClick={() => setDismissed((p) => new Set(p).add(hint.id))}
              className="text-xs opacity-50 hover:opacity-100 transition-opacity px-1" title="Dismiss">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ReadinessDot({ status }: { status?: string }) {
  if (status === "verified") return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-green-500" title="Verified" />;
  if (status === "partial") return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-yellow-400" title="Partial" />;
  return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-red-500" title="Empty" />;
}

function confidenceBadge(confidence: string) {
  if (confidence === "high") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (confidence === "medium") return "bg-yellow-400/20 text-yellow-400 border-yellow-400/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ stats }: { stats: MaterialStats | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!stats) return null;

  const years = Object.keys(stats.byYear).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="mb-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--color-bg-tertiary)] transition-colors"
      >
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-[var(--color-gold)]">📊 File Activity</span>
          <span className="text-xs text-[var(--color-text-secondary)]">
            {stats.total} total · {years[0] ? `${stats.byYear[years[0]].total} in ${years[0]}` : ""}
          </span>
        </div>
        <span className="text-[var(--color-text-secondary)] text-xs">{expanded ? "▲ collapse" : "▼ expand"}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg p-3 text-center" style={{ background: "var(--color-bg-tertiary)" }}>
              <p className="text-2xl font-bold text-[var(--color-gold)]">{stats.total}</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">All time</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: "var(--color-bg-tertiary)" }}>
              <p className="text-2xl font-bold text-blue-400">
                {years.reduce((acc, y) => acc + stats.byYear[y].contributors, 0)}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">From students</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: "var(--color-bg-tertiary)" }}>
              <p className="text-2xl font-bold text-purple-400">
                {years.reduce((acc, y) => acc + stats.byYear[y].admins, 0)}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">From admins</p>
            </div>
          </div>

          {years.map((year) => {
            const yd = stats.byYear[year];
            return (
              <div key={year}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{year}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {yd.total} total · {yd.contributors} students · {yd.admins} admins
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {MONTHS.filter((m) => yd.byMonth[m]).map((month) => {
                    const md = yd.byMonth[month];
                    return (
                      <div key={month} className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs"
                        style={{ background: "var(--color-bg-tertiary)" }}>
                        <span className="text-[var(--color-text-secondary)]">{month}</span>
                        <span className="text-[var(--color-text-primary)] font-medium">{md.total}</span>
                        <span className="text-blue-400">{md.contributors}s</span>
                        <span className="text-purple-400">{md.admins}a</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Reports Section ──────────────────────────────────────────────────────────
function ReportsSection({ reports }: { reports: UploadReport[] }) {
  const [expanded, setExpanded] = useState(false);
  const unread = reports.filter((r) => !r.read).length;

  return (
    <div className="mb-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--color-bg-tertiary)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">⚠️ Contributor Reports</span>
          {unread > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-500/20 text-red-400">{unread} unread</span>
          )}
          {reports.length === 0 && (
            <span className="text-xs text-[var(--color-text-secondary)]">No reports yet</span>
          )}
        </div>
        <span className="text-[var(--color-text-secondary)] text-xs">{expanded ? "▲ collapse" : "▼ expand"}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3">
          {reports.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] py-4 text-center">
              No upload issues have been reported by contributors.
            </p>
          ) : (
            reports.map((report) => (
              <div key={report.id}
                className={`p-4 rounded-xl border text-sm space-y-1 ${report.read ? "border-[var(--color-border)] bg-[var(--color-bg-tertiary)]" : "border-red-500/20 bg-red-500/5"}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-semibold text-[var(--color-text-primary)]">{report.fileName}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${report.errorType === "upload_failed"
                    ? "border-red-400/30 text-red-400 bg-red-400/10"
                    : report.errorType === "processing_failed"
                      ? "border-yellow-400/30 text-yellow-400 bg-yellow-400/10"
                      : "border-orange-400/30 text-orange-400 bg-orange-400/10"}`}>
                    {report.errorType.replace("_", " ")}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)]">📧 {report.uploaderEmail}</p>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{report.description}</p>
                {report.timestamp && (
                  <p className="text-xs text-[var(--color-text-secondary)] opacity-60">
                    {report.timestamp.toDate().toLocaleString()}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [grouped, setGrouped] = useState<GroupedCourses>({});
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [activeReviewTab, setActiveReviewTab] = useState<ReviewTab>("pending_review");
  const [reviewMaterials, setReviewMaterials] = useState<Material[]>([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewCounts, setReviewCounts] = useState({ pending_review: 0, quarantined: 0, awaiting_course: 0, ocr_pending: 0 });
  const [batchApproving, setBatchApproving] = useState(false);
  const [reports, setReports] = useState<UploadReport[]>([]);
  const [stats, setStats] = useState<MaterialStats | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { router.push("/"); return; }
    if (userProfile && userProfile.role !== "admin" && userProfile.role !== "chief_admin") router.push("/");
  }, [firebaseUser, userProfile, authLoading, router]);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const q = query(collection(db, "courses"), orderBy("department"));
        const snapshot = await getDocs(q);
        const data: Course[] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Course[];
        setCourses(data);
        groupCourses(data);
      } catch (err) {
        console.error("Error fetching courses:", err);
      } finally {
        setCoursesLoading(false);
      }
    };
    if (firebaseUser) fetchCourses();
  }, [firebaseUser]);

  useEffect(() => {
    const fetchCounts = async () => {
      if (!firebaseUser) return;
      try {
        const [pending, quarantined, awaiting, ocr] = await Promise.all([
          getMaterialsByStatus("pending_review"),
          getMaterialsByStatus("quarantined"),
          getMaterialsByStatus("awaiting_course"),
          getMaterialsByStatus("ocr_pending"),
        ]);
        setReviewCounts({
          pending_review: pending.length,
          quarantined: quarantined.length,
          awaiting_course: awaiting.length,
          ocr_pending: ocr.length,
        });
      } catch (err) {
        console.error("Error fetching review counts:", err);
      }
    };
    fetchCounts();
  }, [firebaseUser]);

  useEffect(() => {
    const fetchMaterials = async () => {
      if (!firebaseUser) return;
      setReviewLoading(true);
      try {
        const data = await getMaterialsByStatus(activeReviewTab);
        setReviewMaterials(data);
      } catch (err) {
        console.error("Error fetching materials:", err);
      } finally {
        setReviewLoading(false);
      }
    };
    fetchMaterials();
  }, [firebaseUser, activeReviewTab]);

  useEffect(() => {
    const fetchReportsAndStats = async () => {
      if (!firebaseUser) return;
      try {
        const [r, s] = await Promise.all([getReports(), getMaterialStats()]);
        setReports(r);
        setStats(s);
      } catch (err) {
        console.error("Error fetching reports/stats:", err);
      }
    };
    fetchReportsAndStats();
  }, [firebaseUser]);

  const removeMaterialFromList = (materialId: string) => {
    setReviewMaterials((prev) => prev.filter((m) => m.id !== materialId));
    setReviewCounts((prev) => ({ ...prev, [activeReviewTab]: Math.max(0, prev[activeReviewTab] - 1) }));
  };

  const groupCourses = (data: Course[]) => {
    const result: GroupedCourses = {};
    data.forEach((course) => {
      const dept = course.department || "Unknown";
      const year = course.year || 1;
      const sem = course.semester || 1;
      if (!result[dept]) result[dept] = {};
      if (!result[dept][year]) result[dept][year] = {};
      if (!result[dept][year][sem]) result[dept][year][sem] = [];
      result[dept][year][sem].push(course);
    });
    setGrouped(result);
  };

  const toggleKey = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const updateCourseReadiness = (courseId: string, readiness: "empty" | "partial" | "verified") => {
    setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, readiness } : c));
    setGrouped((prev) => {
      const next = { ...prev };
      for (const dept of Object.keys(next)) {
        for (const year of Object.keys(next[dept])) {
          for (const sem of Object.keys(next[dept][Number(year)])) {
            next[dept][Number(year)][Number(sem)] = next[dept][Number(year)][Number(sem)].map(
              (c) => c.id === courseId ? { ...c, readiness } : c
            );
          }
        }
      }
      return next;
    });
  };

  const handleBatchApproveHighConfidence = async () => {
    const highConfidence = reviewMaterials.filter((m) => m.confidence === "high" && m.suggestedCourseId);
    if (highConfidence.length === 0) return;
    setBatchApproving(true);
    for (const material of highConfidence) {
      try {
        await saveChunks(material.id, material.suggestedCourseId!, material.category, material.extractedText);
        await updateMaterialStatus(material.id, "approved", material.suggestedCourseId!, material.suggestedCourseName ?? "");
        removeMaterialFromList(material.id);
      } catch (err) {
        console.error(`Batch approve failed for ${material.id}:`, err);
      }
    }
    setBatchApproving(false);
  };

  const handleResurrectAll = async () => {
    for (const course of courses) {
      try {
        await resurrectMaterialsForCourse(course.id, course.name);
      } catch (err) {
        console.error(`Resurrect failed for course ${course.id}:`, err);
      }
    }
    const awaiting = await getMaterialsByStatus("awaiting_course");
    setReviewCounts((prev) => ({ ...prev, awaiting_course: awaiting.length }));
    if (activeReviewTab === "awaiting_course") setReviewMaterials(awaiting);
  };

  // ── Hints ─────────────────────────────────────────────────────────────────
  const hints: Hint[] = [];
  const highConfidenceCount = activeReviewTab === "pending_review"
    ? reviewMaterials.filter((m) => m.confidence === "high" && m.suggestedCourseId).length : 0;

  if (highConfidenceCount > 1) {
    hints.push({
      id: "batch-approve-high", severity: "tip", icon: "⚡",
      title: `${highConfidenceCount} materials matched with high confidence`,
      description: "The classifier is very sure about these. You can approve them all at once instead of one by one.",
      action: { label: batchApproving ? "Approving..." : `Approve all ${highConfidenceCount} →`, onClick: handleBatchApproveHighConfidence },
    });
  }
  if (reviewCounts.awaiting_course > 0 && activeReviewTab !== "awaiting_course") {
    hints.push({
      id: "awaiting-course-reminder", severity: "action", icon: "⏳",
      title: `${reviewCounts.awaiting_course} material(s) waiting for a course to exist`,
      description: "If you have just added new courses, use Resurrect All to activate them instantly.",
      action: { label: "Resurrect all now →", onClick: handleResurrectAll },
    });
  }
  if (reviewCounts.awaiting_course > 0 && activeReviewTab === "awaiting_course") {
    hints.push({
      id: "resurrect-all-tip", severity: "tip", icon: "🔁",
      title: "Resurrect All is available",
      description: "If you have recently added new courses to Firestore, click Resurrect All to automatically match and approve all waiting materials in one pass.",
      action: { label: "Resurrect all →", onClick: handleResurrectAll },
    });
  }
  if (reviewCounts.quarantined > 0) {
    hints.push({
      id: "quarantined-reminder", severity: "warning", icon: "🔒",
      title: `${reviewCounts.quarantined} quarantined material(s) need manual assignment`,
      description: "The classifier found no course signal in these files. Open the Quarantined tab to assign them manually.",
    });
  }
  if (reviewCounts.ocr_pending > 0) {
    hints.push({
      id: "ocr-pending-info", severity: "info", icon: "🔍",
      title: `${reviewCounts.ocr_pending} scanned file(s) waiting for OCR`,
      description: "These are image-based files with no extractable text yet. They will unlock automatically once Google Cloud Vision is activated.",
    });
  }
  const quarantineEmails = activeReviewTab === "quarantined" ? reviewMaterials.map((m) => m.uploaderEmail).filter(Boolean) : [];
  const emailCounts = quarantineEmails.reduce<Record<string, number>>((acc, e) => { acc[e] = (acc[e] || 0) + 1; return acc; }, {});
  const suspiciousEmails = Object.entries(emailCounts).filter(([, count]) => count >= 3);
  if (suspiciousEmails.length > 0) {
    hints.push({
      id: "repeated-email-quarantine", severity: "warning", icon: "⚠️",
      title: "Repeated submissions from same email in quarantine",
      description: `${suspiciousEmails.map(([e]) => e).join(", ")} — ${suspiciousEmails.length > 1 ? "these emails have" : "this email has"} 3+ quarantined submissions. Review carefully.`,
    });
  }

  const filteredCourses = search.trim()
    ? courses.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase()) || c.code?.toLowerCase().includes(search.toLowerCase()))
    : null;

  if (authLoading || coursesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <p className="text-[var(--color-gold)] text-lg">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-[var(--color-gold)] mb-1" style={{ fontFamily: "Playfair Display, serif" }}>
          Admin Panel
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Bigard Memorial Institute — Course Materials Management
        </p>

        {/* Stats */}
        <StatsBar stats={stats} />

        <AdminHints hints={hints} />

        {/* ── Reports ───────────────────────────────────────────────────── */}
        <ReportsSection reports={reports} />

        {/* ── Materials Review ──────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-4" style={{ fontFamily: "Playfair Display, serif" }}>
            Materials Review
          </h2>
          <div className="flex gap-2 mb-6 flex-wrap">
            {([
              { key: "pending_review", label: "Pending Review", color: "yellow" },
              { key: "quarantined", label: "Quarantined", color: "red" },
              { key: "awaiting_course", label: "Awaiting Course", color: "purple" },
              { key: "ocr_pending", label: "OCR Pending", color: "blue" },
            ] as const).map(({ key, label, color }) => {
              const count = reviewCounts[key];
              const isActive = activeReviewTab === key;
              const colorMap = {
                yellow: isActive ? "border-yellow-400 text-yellow-400" : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-yellow-400/50",
                red: isActive ? "border-red-400 text-red-400" : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-red-400/50",
                purple: isActive ? "border-purple-400 text-purple-400" : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-purple-400/50",
                blue: isActive ? "border-blue-400 text-blue-400" : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-blue-400/50",
              };
              const badgeMap = {
                yellow: "bg-yellow-400/20 text-yellow-400",
                red: "bg-red-400/20 text-red-400",
                purple: "bg-purple-400/20 text-purple-400",
                blue: "bg-blue-400/20 text-blue-400",
              };
              return (
                <button key={key} onClick={() => setActiveReviewTab(key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors bg-[var(--color-bg-secondary)] ${colorMap[color]}`}>
                  {label}
                  {count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${badgeMap[color]}`}>{count}</span>}
                </button>
              );
            })}
          </div>

          {reviewLoading ? (
            <div className="flex items-center justify-center py-16 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-secondary)]">
              <p className="text-[var(--color-text-secondary)] text-sm">Loading materials...</p>
            </div>
          ) : reviewMaterials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-secondary)]">
              <p className="text-4xl mb-3">
                {activeReviewTab === "pending_review" ? "📭" : activeReviewTab === "quarantined" ? "🔒" : activeReviewTab === "awaiting_course" ? "⏳" : "🔍"}
              </p>
              <p className="text-[var(--color-text-secondary)] text-sm">
                {activeReviewTab === "pending_review" && "No materials awaiting review."}
                {activeReviewTab === "quarantined" && "No quarantined materials."}
                {activeReviewTab === "awaiting_course" && "No materials waiting for a course to be created."}
                {activeReviewTab === "ocr_pending" && "No scanned files waiting for OCR."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeReviewTab === "awaiting_course" && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm">
                  These materials have a detected course name but that course does not exist in Firestore yet. They will resurrect automatically when the matching course is created.
                </div>
              )}
              {activeReviewTab === "ocr_pending" && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">
                  These files are scanned images. Google Cloud OCR is not yet active. Once enabled, they will be re-processed automatically.
                </div>
              )}
              {reviewMaterials.map((material) => (
                <MaterialReviewCard key={material.id} material={material} courses={courses} tab={activeReviewTab} onDismiss={() => removeMaterialFromList(material.id)} />
              ))}
            </div>
          )}
        </section>

        {/* ── Course Browser ────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-4" style={{ fontFamily: "Playfair Display, serif" }}>
            Course Browser
          </h2>
          <div className="flex items-center gap-4 mb-4 text-xs text-[var(--color-text-secondary)]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Empty</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Partial</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Verified</span>
          </div>
          <input type="text" placeholder="Search courses by name or code..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-4 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-gold)] mb-6" />

          {filteredCourses ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--color-text-secondary)] mb-3">{filteredCourses.length} result(s) for &quot;{search}&quot;</p>
              {filteredCourses.map((course) => (
                <CourseRow key={course.id} course={course} onUpload={() => setSelectedCourse(course)} />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.keys(grouped).sort().map((dept) => (
                <div key={dept} className="border border-[var(--color-border)] rounded-xl overflow-hidden">
                  <button onClick={() => toggleKey(dept)}
                    className="w-full flex items-center justify-between px-5 py-4 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors">
                    <span className="text-lg font-semibold text-[var(--color-gold)] capitalize">{dept} Department</span>
                    <span className="text-[var(--color-text-secondary)]">{expandedKeys.has(dept) ? "▲" : "▼"}</span>
                  </button>
                  {expandedKeys.has(dept) && (
                    <div className="p-4 space-y-4">
                      {Object.keys(grouped[dept]).sort().map((year) => (
                        <div key={year}>
                          <button onClick={() => toggleKey(`${dept}-${year}`)}
                            className="w-full flex items-center justify-between px-4 py-2 bg-[var(--color-bg-tertiary)] rounded-lg mb-2">
                            <span className="font-medium text-[var(--color-text-primary)]">Year {year}</span>
                            <span className="text-[var(--color-text-secondary)] text-sm">{expandedKeys.has(`${dept}-${year}`) ? "▲" : "▼"}</span>
                          </button>
                          {expandedKeys.has(`${dept}-${year}`) && (
                            <div className="pl-4 space-y-3">
                              {Object.keys(grouped[dept][Number(year)]).sort().map((sem) => (
                                <div key={sem}>
                                  <button onClick={() => toggleKey(`${dept}-${year}-${sem}`)}
                                    className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-[var(--color-text-secondary)] border-b border-[var(--color-border)] mb-2">
                                    <span>Semester {sem}</span>
                                    <span>{expandedKeys.has(`${dept}-${year}-${sem}`) ? "▲" : "▼"}</span>
                                  </button>
                                  {expandedKeys.has(`${dept}-${year}-${sem}`) && (
                                    <div className="space-y-2 pl-2">
                                      {grouped[dept][Number(year)][Number(sem)].map((course) => (
                                        <CourseRow key={course.id} course={course} onUpload={() => setSelectedCourse(course)} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedCourse && (
        <UploadModal
          course={selectedCourse}
          uploadedBy={firebaseUser?.uid ?? "unknown"}
          uploadedByRole={userProfile?.role ?? "admin"}
          uploaderEmail={firebaseUser?.email ?? "unknown"}
          onClose={() => setSelectedCourse(null)}
          onReadinessChange={(readiness) => updateCourseReadiness(selectedCourse.id, readiness)}
        />
      )}
    </div>
  );
}

// ─── Material Review Card ─────────────────────────────────────────────────────
function MaterialReviewCard({ material, courses, tab, onDismiss }: {
  material: Material; courses: Course[]; tab: ReviewTab; onDismiss: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(material.suggestedCourseId ?? "");
  const [selectedCategory, setSelectedCategory] = useState<string>(material.category ?? "other");
  const [resurrectResult, setResurrectResult] = useState<{ resurrected: number; failed: number } | null>(null);

  const isReadOnly = tab === "ocr_pending";
  const isAwaitingCourse = tab === "awaiting_course";

  const handleApprove = async () => {
    const courseId = (isAwaitingCourse || tab === "quarantined") ? selectedCourseId : material.suggestedCourseId;
    const category = (isAwaitingCourse || tab === "quarantined") ? selectedCategory : material.category;
    const courseName = courses.find((c) => c.id === courseId)?.name ?? material.suggestedCourseName ?? "";
    if (!courseId) { setError("Please select a course before approving."); return; }
    setLoading(true); setError(null);
    try {
      await saveChunks(material.id, courseId, category as never, material.extractedText);
      await updateMaterialStatus(material.id, "approved", courseId, courseName);
      onDismiss();
    } catch (err) {
      console.error("Approve failed:", err);
      setError("Failed to approve. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true); setError(null);
    try {
      await updateMaterialStatus(material.id, "rejected");
      onDismiss();
    } catch (err) {
      console.error("Reject failed:", err);
      setError("Failed to reject. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResurrect = async () => {
    if (!selectedCourseId) { setError("Select a course to resurrect against."); return; }
    const courseName = courses.find((c) => c.id === selectedCourseId)?.name ?? "";
    setLoading(true); setError(null);
    try {
      const result = await resurrectMaterialsForCourse(selectedCourseId, courseName);
      setResurrectResult(result);
      if (result.resurrected > 0) onDismiss();
    } catch (err) {
      console.error("Resurrection failed:", err);
      setError("Resurrection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const previewText = material.extractedText?.slice(0, 300) ?? "No text extracted.";
  const fullText = material.extractedText ?? "No text extracted.";

  return (
    <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-secondary)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="font-semibold text-[var(--color-text-primary)] text-sm break-all">{material.fileName}</p>
          {material.uploaderEmail && (
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>📧 {material.uploaderEmail}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">{material.category}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${confidenceBadge(material.confidence)}`}>{material.confidence} confidence</span>
            {material.wordCount > 0 && <span className="text-xs text-[var(--color-text-secondary)]">{material.wordCount.toLocaleString()} words</span>}
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">{material.uploadedByRole}</span>
          </div>
        </div>
        {!isReadOnly && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleReject} disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
              Reject
            </button>
            {!isAwaitingCourse && (
              <button onClick={handleApprove} disabled={loading}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-gold)] text-[var(--color-bg-primary)] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                {loading ? "Working..." : "Approve →"}
              </button>
            )}
          </div>
        )}
      </div>

      {tab === "pending_review" && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--color-text-secondary)]">Suggested course:</span>
          <span className="text-[var(--color-text-primary)] font-medium">{material.suggestedCourseName ?? "—"}</span>
        </div>
      )}

      {(tab === "quarantined" || tab === "awaiting_course") && (
        <div className="space-y-3 p-3 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
          {tab === "awaiting_course" && material.detectedCourseName && (
            <div className="flex items-center gap-2 text-xs mb-1">
              <span className="text-purple-400 font-medium">Detected course name:</span>
              <span className="text-[var(--color-text-primary)] font-semibold">{material.detectedCourseName}</span>
            </div>
          )}
          {tab === "quarantined" && <p className="text-xs text-red-400 font-medium">No course signal detected. Assign manually:</p>}
          {tab === "awaiting_course" && <p className="text-xs text-purple-400 font-medium">Assign to an existing course now, or wait for the course to be created:</p>}
          <div className="space-y-2">
            <label className="text-xs text-[var(--color-text-secondary)]">Course</label>
            <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-xs focus:outline-none focus:border-[var(--color-gold)]">
              <option value="">— Select a course —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-[var(--color-text-secondary)]">Category</label>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-xs focus:outline-none focus:border-[var(--color-gold)]">
              <option value="lecture_notes">Lecture Notes</option>
              <option value="past_questions">Past Questions</option>
              <option value="syllabus">Syllabus</option>
              <option value="aoc">Areas of Concentration</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleApprove} disabled={loading || !selectedCourseId}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-gold)] text-[var(--color-bg-primary)] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity">
              {loading ? "Working..." : "Approve this file →"}
            </button>
            {isAwaitingCourse && (
              <button onClick={handleResurrect} disabled={loading || !selectedCourseId}
                className="text-xs px-3 py-1.5 rounded-lg border border-purple-400/40 text-purple-400 hover:bg-purple-500/10 disabled:opacity-40 transition-colors">
                {loading ? "Working..." : "Resurrect all matching →"}
              </button>
            )}
          </div>
          {resurrectResult && (
            <p className="text-xs text-purple-300 mt-1">
              {resurrectResult.resurrected} material(s) resurrected.{resurrectResult.failed > 0 && ` ${resurrectResult.failed} failed.`}
            </p>
          )}
        </div>
      )}

      {material.classifierReason && (
        <p className="text-xs text-[var(--color-text-secondary)] italic">Classifier: {material.classifierReason}</p>
      )}

      <div className="rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] p-3">
        <p className="text-xs text-[var(--color-text-secondary)] mb-1 font-medium">Extracted text preview</p>
        <p className="text-xs text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap break-words">
          {expanded ? fullText : previewText}{!expanded && fullText.length > 300 && "..."}
        </p>
        {fullText.length > 300 && (
          <button onClick={() => setExpanded((p) => !p)} className="text-xs text-[var(--color-gold)] mt-2 hover:underline">
            {expanded ? "Show less" : "Show full text"}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Course Row ───────────────────────────────────────────────────────────────
function CourseRow({ course, onUpload }: { course: Course; onUpload: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-gold)] transition-colors">
      <div className="flex items-center gap-3">
        <ReadinessDot status={course.readiness} />
        <div>
          <p className="font-medium text-[var(--color-text-primary)]">{course.name}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">{course.code}</p>
        </div>
      </div>
      <button onClick={onUpload}
        className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-gold)] text-[var(--color-bg-primary)] font-semibold hover:opacity-90 transition-opacity">
        Manage
      </button>
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ course, uploadedBy, uploadedByRole, uploaderEmail, onClose, onReadinessChange }: {
  course: Course; uploadedBy: string; uploadedByRole: string; uploaderEmail: string;
  onClose: () => void; onReadinessChange: (readiness: "empty" | "partial" | "verified") => void;
}) {
  const [fileQueues, setFileQueues] = useState<Record<string, File[]>>({});
  const [fileStatuses, setFileStatuses] = useState<Record<string, Record<string, "idle" | "uploading" | "done" | "error">>>({});
  const [fileProgresses, setFileProgresses] = useState<Record<string, Record<string, number>>>({});
  const [existingFiles, setExistingFiles] = useState<Record<string, ExistingFile[]>>({});
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [readiness, setReadiness] = useState<"empty" | "partial" | "verified">(course.readiness || "empty");
  const [savingReadiness, setSavingReadiness] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<Record<string, string>>({});

  // Auto-detect state
  const [detectFiles, setDetectFiles] = useState<File[]>([]);
  const [detectStatuses, setDetectStatuses] = useState<Record<string, FileStatus>>({});
  const [detectUploading, setDetectUploading] = useState(false);

  useEffect(() => {
    const loadExisting = async () => {
      try {
        const result: Record<string, ExistingFile[]> = {};
        await Promise.all(CATEGORIES.map(async ({ key }) => {
          const path = `materials/${course.department}/year${course.year}/sem${course.semester}/${course.id}/${key}`;
          try {
            const listRef = ref(storage, path);
            const res = await listAll(listRef);
            const files: ExistingFile[] = await Promise.all(
              res.items.map(async (itemRef) => {
                const url = await getDownloadURL(itemRef);
                let size: number | undefined;
                let uploadedAt: string | undefined;
                try {
                  const meta = await getMetadata(itemRef);
                  size = meta.size;
                  uploadedAt = meta.timeCreated;
                } catch { /* metadata optional */ }
                return { name: itemRef.name, url, size, uploadedAt };
              })
            );
            result[key] = files;
          } catch {
            result[key] = [];
          }
        }));
        setExistingFiles(result);
        try {
          const courseDoc = await getDoc(doc(db, "courses", course.id));
          const data = courseDoc.data();
          if (data?.readiness) setReadiness(data.readiness);
        } catch { /* readiness optional */ }
      } catch (err) {
        console.error("Error loading existing files:", err);
      } finally {
        setLoadingExisting(false);
      }
    };
    loadExisting();
  }, [course]);

  const handleFileSelect = (files: FileList, category: UploadCategory) => {
    const arr = Array.from(files);
    setFileQueues((p) => ({ ...p, [category]: [...(p[category] || []), ...arr] }));
  };

  const handleDeselect = (category: UploadCategory, fileName: string) => {
    setFileQueues((p) => ({ ...p, [category]: (p[category] || []).filter((f) => f.name !== fileName) }));
  };

  const uploadFile = async (file: File, category: UploadCategory) => {
    const path = `materials/${course.department}/year${course.year}/sem${course.semester}/${course.id}/${category}/${file.name}`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);
    setFileStatuses((p) => ({ ...p, [category]: { ...(p[category] || {}), [file.name]: "uploading" } }));

    return new Promise<void>((resolve) => {
      task.on("state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setFileProgresses((p) => ({ ...p, [category]: { ...(p[category] || {}), [file.name]: pct } }));
        },
        () => {
          setFileStatuses((p) => ({ ...p, [category]: { ...(p[category] || {}), [file.name]: "error" } }));
          resolve();
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          await updateDoc(doc(db, "courses", course.id), { [`materials.${category}.${file.name}`]: url });
          if (readiness === "empty") {
            await updateDoc(doc(db, "courses", course.id), { readiness: "partial" });
            setReadiness("partial");
            onReadinessChange("partial");
          }
          setFileStatuses((p) => ({ ...p, [category]: { ...(p[category] || {}), [file.name]: "done" } }));
          setExistingFiles((p) => ({ ...p, [category]: [...(p[category] || []), { name: file.name, url }] }));
          try {
            setProcessingStatus((p) => ({ ...p, [file.name]: "processing" }));
            const formData = new FormData();
            formData.append("file", file);
            formData.append("fileUrl", url);
            formData.append("uploadedBy", uploadedBy);
            formData.append("uploadedByRole", uploadedByRole);
            formData.append("uploaderEmail", uploaderEmail);
            formData.append("suggestedCourseId", course.id);
            formData.append("suggestedCourseName", course.name);
            const res = await fetch("/api/process-upload", { method: "POST", body: formData });
            if (res.ok) {
              const result = await res.json();
              setProcessingStatus((p) => ({ ...p, [file.name]: result.status }));
            } else {
              setProcessingStatus((p) => ({ ...p, [file.name]: "processing_error" }));
            }
          } catch (err) {
            console.error("[admin] process-upload failed:", err);
            setProcessingStatus((p) => ({ ...p, [file.name]: "processing_error" }));
          }
          resolve();
        }
      );
    });
  };

  const handleUploadCategory = async (category: UploadCategory) => {
    const files = fileQueues[category] || [];
    for (const file of files) {
      const status = fileStatuses[category]?.[file.name];
      if (status !== "done" && status !== "uploading") await uploadFile(file, category);
    }
  };

  const handleBatchUploadAll = () => {
    (Object.keys(fileQueues) as UploadCategory[]).forEach((cat) => handleUploadCategory(cat));
  };

  // Auto-detect upload
  const handleDetectSubmit = async () => {
    if (detectFiles.length === 0 || detectUploading) return;
    setDetectUploading(true);

    const initialStatuses: Record<string, FileStatus> = {};
    detectFiles.forEach((f) => { initialStatuses[f.name] = { status: "idle", progress: 0 }; });
    setDetectStatuses(initialStatuses);

    for (const file of detectFiles) {
      try {
        setDetectStatuses((p) => ({ ...p, [file.name]: { status: "uploading", progress: 0 } }));
        const storageRef = ref(storage, `auto-detect/admin/${uploadedBy}/${Date.now()}_${file.name}`);
        const task = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve) => {
          task.on("state_changed",
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setDetectStatuses((p) => ({ ...p, [file.name]: { status: "uploading", progress: pct } }));
            },
            () => {
              setDetectStatuses((p) => ({ ...p, [file.name]: { status: "error", progress: 0, error: `Upload failed for ${file.name}. Check connection or file size.` } }));
              resolve();
            },
            async () => {
              try {
                const url = await getDownloadURL(task.snapshot.ref);
                setDetectStatuses((p) => ({ ...p, [file.name]: { status: "extracting", progress: 100 } }));
                const formData = new FormData();
                formData.append("file", file);
                formData.append("fileUrl", url);
                formData.append("uploadedBy", uploadedBy);
                formData.append("uploadedByRole", uploadedByRole);
                formData.append("uploaderEmail", uploaderEmail);
                setDetectStatuses((p) => ({ ...p, [file.name]: { status: "classifying", progress: 100 } }));
                const res = await fetch("/api/process-upload", { method: "POST", body: formData });
                if (!res.ok) {
                  setDetectStatuses((p) => ({ ...p, [file.name]: { status: "error", progress: 100, error: `Processing failed for ${file.name}. Check the review queue.` } }));
                } else {
                  const result = await res.json();
                  setDetectStatuses((p) => ({
                    ...p, [file.name]: {
                      status: "done", progress: 100,
                      result: {
                        materialId: result.materialId,
                        detectedStatus: result.status,
                        category: result.category,
                        suggestedCourseName: result.suggestedCourseName,
                        detectedCourseName: result.detectedCourseName,
                        confidence: result.confidence,
                        wordCount: result.wordCount,
                      }
                    }
                  }));
                }
                resolve();
              } catch {
                setDetectStatuses((p) => ({ ...p, [file.name]: { status: "error", progress: 100, error: `Processing failed for ${file.name}. It may still appear in the review queue.` } }));
                resolve();
              }
            }
          );
        });
      } catch {
        setDetectStatuses((p) => ({ ...p, [file.name]: { status: "error", progress: 0, error: `Failed to process ${file.name}.` } }));
      }
    }
    setDetectUploading(false);
  };

  const getDetectStatusLabel = (status: FileStatus["status"]) => {
    switch (status) {
      case "uploading": return "Uploading...";
      case "extracting": return "Extracting text...";
      case "classifying": return "Classifying...";
      case "done": return "Done ✓";
      case "error": return "Failed";
      default: return "Waiting";
    }
  };

  const getAdminDetectResultMessage = (result: FileStatus["result"]) => {
    if (!result) return null;
    const course = result.suggestedCourseName ?? result.detectedCourseName;
    if (result.detectedStatus === "quarantined" || result.confidence === "low") {
      return { type: "weak", message: `Detection was weak. This file has been sent to the Quarantined tab for manual assignment.` };
    }
    return {
      type: "strong",
      message: `Detected as "${course ?? "unknown course"}" — ${result.category.replace("_", " ")}. Confidence: ${result.confidence}. ${result.wordCount} words extracted.`,
    };
  };

  const handleSetReadiness = async (newReadiness: "empty" | "partial" | "verified") => {
    setSavingReadiness(true);
    try {
      await updateDoc(doc(db, "courses", course.id), { readiness: newReadiness });
      setReadiness(newReadiness);
      onReadinessChange(newReadiness);
    } catch (err) {
      console.error("Error updating readiness:", err);
    } finally {
      setSavingReadiness(false);
    }
  };

  const totalPending = Object.entries(fileQueues).reduce((acc, [cat, files]) => {
    return acc + files.filter((f) => { const s = fileStatuses[cat]?.[f.name]; return s !== "done" && s !== "uploading"; }).length;
  }, 0);

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getProcessingLabel = (status: string) => {
    switch (status) {
      case "processing": return "⏳ Processing...";
      case "pending_review": return "🟡 Pending review";
      case "quarantined": return "🔒 Needs manual assign";
      case "awaiting_course": return "⏳ Awaiting course creation";
      case "ocr_pending": return "🔍 OCR pending";
      case "processing_error": return "❌ Processing failed";
      default: return "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-gold)]" style={{ fontFamily: "Playfair Display, serif" }}>{course.name}</h2>
            <p className="text-xs text-[var(--color-text-secondary)]">{course.code} · Year {course.year} · Sem {course.semester}</p>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-secondary)] hover:text-white text-xl font-bold">✕</button>
        </div>

        {/* Readiness */}
        <div className="flex items-center gap-2 mb-5 p-3 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
          <span className="text-xs text-[var(--color-text-secondary)] mr-1">Status:</span>
          {(["empty", "partial", "verified"] as const).map((r) => (
            <button key={r} onClick={() => handleSetReadiness(r)} disabled={savingReadiness}
              className={`text-xs px-3 py-1 rounded-lg font-semibold transition-all ${readiness === r
                ? r === "verified" ? "bg-green-500 text-white" : r === "partial" ? "bg-yellow-400 text-black" : "bg-red-500 text-white"
                : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold)] border border-[var(--color-border)]"}`}>
              {r === "empty" ? "🔴 Empty" : r === "partial" ? "🟡 Partial" : "🟢 Verified"}
            </button>
          ))}
        </div>

        {/* Batch upload all */}
        {totalPending > 1 && (
          <button onClick={handleBatchUploadAll}
            className="w-full mb-4 py-2 rounded-lg bg-[var(--color-gold)] text-[var(--color-bg-primary)] font-semibold text-sm hover:opacity-90 transition-opacity">
            Upload All {totalPending} Pending Files
          </button>
        )}

        {/* Category upload sections */}
        {loadingExisting ? (
          <p className="text-xs text-[var(--color-text-secondary)] text-center py-4">Loading existing files...</p>
        ) : (
          <div className="space-y-4">
            {CATEGORIES.map(({ key, label, icon }) => {
              const files = fileQueues[key] || [];
              const existing = existingFiles[key] || [];
              return (
                <div key={key} className="border border-[var(--color-border)] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-sm text-[var(--color-text-primary)]">
                      {icon} {label}
                      {existing.length > 0 && <span className="ml-2 text-xs text-green-400">({existing.length} uploaded)</span>}
                    </span>
                    {files.length > 0 && (
                      <button onClick={() => handleUploadCategory(key)}
                        className="text-xs px-3 py-1 rounded-lg bg-[var(--color-gold)] text-[var(--color-bg-primary)] font-semibold hover:opacity-90">
                        Upload {files.length > 1 ? `${files.length} files` : "file"}
                      </button>
                    )}
                  </div>

                  {existing.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {existing.map((f) => (
                        <div key={f.name} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 rounded-lg">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="truncate max-w-[200px] hover:text-[var(--color-gold)] transition-colors">{f.name}</a>
                          {f.size && <span className="ml-auto flex-shrink-0">{formatSize(f.size)}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {files.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {files.map((file) => {
                        const status = fileStatuses[key]?.[file.name] || "idle";
                        const progress = fileProgresses[key]?.[file.name] || 0;
                        const procStatus = processingStatus[file.name];
                        return (
                          <div key={file.name} className="flex items-center gap-2 flex-wrap">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status === "done" ? "bg-green-400" : status === "error" ? "bg-red-400" : status === "uploading" ? "bg-yellow-400" : "bg-[var(--color-border)]"}`} />
                            <span className="text-xs text-[var(--color-text-primary)] max-w-[180px] truncate">{file.name}</span>
                            {status === "uploading" && (
                              <div className="flex-1 bg-[var(--color-border)] rounded-full h-1.5 min-w-[60px]">
                                <div className="bg-[var(--color-gold)] h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                              </div>
                            )}
                            {status === "done" && !procStatus && <span className="text-green-400 text-xs">✓</span>}
                            {status === "done" && procStatus && <span className="text-xs text-[var(--color-text-secondary)]">{getProcessingLabel(procStatus)}</span>}
                            {status === "error" && <span className="text-red-400 text-xs">✗ retry</span>}
                            {status === "idle" && <button onClick={() => handleDeselect(key, file.name)} className="text-xs text-red-400 hover:text-red-300">✕</button>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" multiple className="hidden"
                      onChange={(e) => { if (e.target.files) handleFileSelect(e.target.files, key); }} />
                    <span className="text-xs px-3 py-1.5 border border-[var(--color-border)] rounded-lg hover:border-[var(--color-gold)] text-[var(--color-text-secondary)] hover:text-[var(--color-gold)] transition-colors">
                      + Add files
                    </span>
                    <span className="text-xs text-[var(--color-text-secondary)]">PDF, DOCX, DOC, JPG, PNG</span>
                  </label>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Auto-detect zone ─────────────────────────────────────────── */}
        <div className="mt-6 border border-[var(--color-border)] rounded-xl p-4 space-y-3">
          <div>
            <p className="font-medium text-sm text-[var(--color-text-primary)] mb-1">🔍 Drop files — let the system sort them</p>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Have files that don&apos;t fit a specific category right now? Drop them here. The system will read and classify them automatically. You&apos;ll see what was detected and can approve or send to the review queue.
            </p>
          </div>

          <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl cursor-pointer"
            style={{ border: "2px dashed var(--color-border)", color: "var(--color-text-secondary)" }}>
            <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
              onChange={(e) => {
                if (!e.target.files) return;
                const incoming = Array.from(e.target.files);
                setDetectFiles((prev) => {
                  const existing = new Set(prev.map((f) => f.name));
                  return [...prev, ...incoming.filter((f) => !existing.has(f.name))];
                });
              }} />
            <span className="text-xl">📎</span>
            <span className="text-xs">Click to add files · Multiple supported</span>
          </label>

          {detectFiles.length > 0 && (
            <div className="space-y-3">
              {detectFiles.map((file) => {
                const fs = detectStatuses[file.name];
                const resultMsg = fs?.result ? getAdminDetectResultMessage(fs.result) : null;
                return (
                  <div key={file.name} className="space-y-2">
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
                      style={{ background: "var(--color-bg-tertiary)", border: "1px solid var(--color-border)" }}>
                      <span className="text-xs flex-1 truncate text-[var(--color-text-primary)]">{file.name}</span>
                      {!fs || fs.status === "idle" ? (
                        <button onClick={() => setDetectFiles((p) => p.filter((f) => f.name !== file.name))}
                          className="text-xs text-[var(--color-text-secondary)]">✕</button>
                      ) : (
                        <span className={`text-xs flex-shrink-0 ${fs.status === "done" ? "text-green-400" : fs.status === "error" ? "text-red-400" : "text-[var(--color-text-secondary)]"}`}>
                          {getDetectStatusLabel(fs.status)}
                        </span>
                      )}
                    </div>

                    {fs?.status === "uploading" && (
                      <div className="px-3">
                        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
                          <div className="h-full rounded-full transition-all bg-[var(--color-gold)]" style={{ width: `${fs.progress}%` }} />
                        </div>
                      </div>
                    )}

                    {fs?.status === "done" && resultMsg && (
                      <div className="px-3 py-2 rounded-lg text-xs leading-relaxed space-y-2"
                        style={{
                          background: resultMsg.type === "strong" ? "rgba(34,197,94,0.08)" : "rgba(234,179,8,0.08)",
                          border: `1px solid ${resultMsg.type === "strong" ? "rgba(34,197,94,0.2)" : "rgba(234,179,8,0.2)"}`,
                          color: resultMsg.type === "strong" ? "#86efac" : "#fde68a",
                        }}>
                        <p>{resultMsg.message}</p>
                        {resultMsg.type === "weak" && (
                          <p className="text-[var(--color-text-secondary)]">
                            Head to the <span className="text-purple-400 font-medium">Quarantined tab</span> in Materials Review to assign it manually.
                          </p>
                        )}
                      </div>
                    )}

                    {fs?.status === "error" && fs.error && (
                      <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
                        {fs.error}
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                onClick={handleDetectSubmit}
                disabled={detectUploading || detectFiles.every((f) => detectStatuses[f.name]?.status === "done")}
                className="w-full py-2 rounded-lg font-semibold text-sm transition-opacity"
                style={{
                  background: "var(--color-gold)", color: "var(--color-bg-primary)",
                  opacity: detectUploading || detectFiles.every((f) => detectStatuses[f.name]?.status === "done") ? 0.5 : 1
                }}>
                {detectUploading
                  ? `Processing ${detectFiles.length} file${detectFiles.length > 1 ? "s" : ""}...`
                  : detectFiles.every((f) => detectStatuses[f.name]?.status === "done")
                    ? "✓ All processed"
                    : `Analyse ${detectFiles.length} file${detectFiles.length > 1 ? "s" : ""} →`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, getDocs, query, orderBy,
  doc, updateDoc, getDoc
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, listAll, getMetadata } from "firebase/storage";
import { db, storage } from "@/lib/firebase/config";
import { useAuth } from "@/components/auth/AuthProvider";

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

function ReadinessDot({ status }: { status?: string }) {
  if (status === "verified") return (
    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-green-500" title="Verified — ready for students" />
  );
  if (status === "partial") return (
    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-yellow-400" title="Partially filled — not yet verified" />
  );
  return (
    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-red-500" title="No materials uploaded" />
  );
}

export default function AdminPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [grouped, setGrouped] = useState<GroupedCourses>({});
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

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
            next[dept][Number(year)][Number(sem)] = next[dept][Number(year)][Number(sem)].map((c) =>
              c.id === courseId ? { ...c, readiness } : c
            );
          }
        }
      }
      return next;
    });
  };

  const filteredCourses = search.trim()
    ? courses.filter(
      (c) =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.code?.toLowerCase().includes(search.toLowerCase())
    )
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
        <p className="text-sm text-[var(--color-text-secondary)] mb-2">
          Bigard Memorial Institute — Course Materials Management
        </p>
        <div className="flex items-center gap-4 mb-6 text-xs text-[var(--color-text-secondary)]">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Empty</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Partial</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Verified</span>
        </div>

        <input
          type="text"
          placeholder="Search courses by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-gold)] mb-8"
        />

        {filteredCourses ? (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-text-secondary)] mb-3">
              {filteredCourses.length} result(s) for &quot;{search}&quot;
            </p>
            {filteredCourses.map((course) => (
              <CourseRow key={course.id} course={course} onUpload={() => setSelectedCourse(course)} />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.keys(grouped).sort().map((dept) => (
              <div key={dept} className="border border-[var(--color-border)] rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleKey(dept)}
                  className="w-full flex items-center justify-between px-5 py-4 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  <span className="text-lg font-semibold text-[var(--color-gold)] capitalize">{dept} Department</span>
                  <span className="text-[var(--color-text-secondary)]">{expandedKeys.has(dept) ? "▲" : "▼"}</span>
                </button>

                {expandedKeys.has(dept) && (
                  <div className="p-4 space-y-4">
                    {Object.keys(grouped[dept]).sort().map((year) => (
                      <div key={year}>
                        <button
                          onClick={() => toggleKey(`${dept}-${year}`)}
                          className="w-full flex items-center justify-between px-4 py-2 bg-[var(--color-bg-tertiary)] rounded-lg mb-2"
                        >
                          <span className="font-medium text-[var(--color-text-primary)]">Year {year}</span>
                          <span className="text-[var(--color-text-secondary)] text-sm">{expandedKeys.has(`${dept}-${year}`) ? "▲" : "▼"}</span>
                        </button>

                        {expandedKeys.has(`${dept}-${year}`) && (
                          <div className="pl-4 space-y-3">
                            {Object.keys(grouped[dept][Number(year)]).sort().map((sem) => (
                              <div key={sem}>
                                <button
                                  onClick={() => toggleKey(`${dept}-${year}-${sem}`)}
                                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-[var(--color-text-secondary)] border-b border-[var(--color-border)] mb-2"
                                >
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
      </div>

      {selectedCourse && (
        <UploadModal
          course={selectedCourse}
          onClose={() => setSelectedCourse(null)}
          onReadinessChange={(readiness) => updateCourseReadiness(selectedCourse.id, readiness)}
        />
      )}
    </div>
  );
}

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
      <button
        onClick={onUpload}
        className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-gold)] text-[var(--color-bg-primary)] font-semibold hover:opacity-90 transition-opacity"
      >
        Manage
      </button>
    </div>
  );
}

function UploadModal({ course, onClose, onReadinessChange }: {
  course: Course;
  onClose: () => void;
  onReadinessChange: (readiness: "empty" | "partial" | "verified") => void;
}) {
  const [fileQueues, setFileQueues] = useState<Record<string, File[]>>({});
  const [fileStatuses, setFileStatuses] = useState<Record<string, Record<string, "idle" | "uploading" | "done" | "error">>>({});
  const [fileProgresses, setFileProgresses] = useState<Record<string, Record<string, number>>>({});
  const [existingFiles, setExistingFiles] = useState<Record<string, ExistingFile[]>>({});
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [readiness, setReadiness] = useState<"empty" | "partial" | "verified">(course.readiness || "empty");
  const [savingReadiness, setSavingReadiness] = useState(false);

  // Load existing files from Firebase Storage
  useEffect(() => {
    const loadExisting = async () => {
      try {
        const result: Record<string, ExistingFile[]> = {};
        for (const { key } of CATEGORIES) {
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
                } catch { }
                return { name: itemRef.name, url, size, uploadedAt };
              })
            );
            result[key] = files;
          } catch {
            result[key] = [];
          }
        }
        setExistingFiles(result);

        // Auto-compute readiness from Firestore
        const courseDoc = await getDoc(doc(db, "courses", course.id));
        const data = courseDoc.data();
        if (data?.readiness) setReadiness(data.readiness);
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
    setFileQueues((p) => ({
      ...p,
      [category]: (p[category] || []).filter((f) => f.name !== fileName),
    }));
  };

  const uploadFile = async (file: File, category: UploadCategory) => {
    const path = `materials/${course.department}/year${course.year}/sem${course.semester}/${course.id}/${category}/${file.name}`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);

    setFileStatuses((p) => ({
      ...p,
      [category]: { ...(p[category] || {}), [file.name]: "uploading" },
    }));

    return new Promise<void>((resolve) => {
      task.on(
        "state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setFileProgresses((p) => ({
            ...p,
            [category]: { ...(p[category] || {}), [file.name]: pct },
          }));
        },
        () => {
          setFileStatuses((p) => ({
            ...p,
            [category]: { ...(p[category] || {}), [file.name]: "error" },
          }));
          resolve();
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          await updateDoc(doc(db, "courses", course.id), {
            [`materials.${category}.${file.name}`]: url,
          });
          // Auto-set to partial if was empty
          if (readiness === "empty") {
            await updateDoc(doc(db, "courses", course.id), { readiness: "partial" });
            setReadiness("partial");
            onReadinessChange("partial");
          }
          setFileStatuses((p) => ({
            ...p,
            [category]: { ...(p[category] || {}), [file.name]: "done" },
          }));
          setExistingFiles((p) => ({
            ...p,
            [category]: [...(p[category] || []), { name: file.name, url }],
          }));
          resolve();
        }
      );
    });
  };

  const handleUploadCategory = async (category: UploadCategory) => {
    const files = fileQueues[category] || [];
    for (const file of files) {
      const status = fileStatuses[category]?.[file.name];
      if (status !== "done" && status !== "uploading") {
        await uploadFile(file, category);
      }
    }
  };

  const handleBatchUploadAll = () => {
    (Object.keys(fileQueues) as UploadCategory[]).forEach((cat) => {
      handleUploadCategory(cat);
    });
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
    return acc + files.filter((f) => {
      const status = fileStatuses[cat]?.[f.name];
      return status !== "done" && status !== "uploading";
    }).length;
  }, 0);

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-gold)]" style={{ fontFamily: "Playfair Display, serif" }}>
              {course.name}
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {course.code} · Year {course.year} · Sem {course.semester}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-secondary)] hover:text-white text-xl font-bold">✕</button>
        </div>

        {/* Readiness control */}
        <div className="flex items-center gap-2 mb-5 p-3 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]">
          <span className="text-xs text-[var(--color-text-secondary)] mr-1">Status:</span>
          {(["empty", "partial", "verified"] as const).map((r) => (
            <button
              key={r}
              onClick={() => handleSetReadiness(r)}
              disabled={savingReadiness}
              className={`text-xs px-3 py-1 rounded-lg font-semibold transition-all ${readiness === r
                ? r === "verified" ? "bg-green-500 text-white" :
                  r === "partial" ? "bg-yellow-400 text-black" :
                    "bg-red-500 text-white"
                : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-gold)] border border-[var(--color-border)]"
                }`}
            >
              {r === "empty" ? "🔴 Empty" : r === "partial" ? "🟡 Partial" : "🟢 Verified"}
            </button>
          ))}
        </div>

        {/* Batch upload */}
        {totalPending > 1 && (
          <button
            onClick={handleBatchUploadAll}
            className="w-full mb-4 py-2 rounded-lg bg-[var(--color-gold)] text-[var(--color-bg-primary)] font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Upload All {totalPending} Pending Files
          </button>
        )}

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
                      {existing.length > 0 && (
                        <span className="ml-2 text-xs text-green-400">({existing.length} uploaded)</span>
                      )}
                    </span>
                    {files.length > 0 && (
                      <button
                        onClick={() => handleUploadCategory(key)}
                        className="text-xs px-3 py-1 rounded-lg bg-[var(--color-gold)] text-[var(--color-bg-primary)] font-semibold hover:opacity-90"
                      >
                        Upload {files.length > 1 ? `${files.length} files` : "file"}
                      </button>
                    )}
                  </div>

                  {/* Existing files */}
                  {existing.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {existing.map((f) => (
                        <div key={f.name} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 rounded-lg">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="truncate max-w-[200px] hover:text-[var(--color-gold)] transition-colors">
                            {f.name}
                          </a>
                          {f.size && <span className="ml-auto flex-shrink-0">{formatSize(f.size)}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* New files queued */}
                  {files.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {files.map((file) => {
                        const status = fileStatuses[key]?.[file.name] || "idle";
                        const progress = fileProgresses[key]?.[file.name] || 0;
                        return (
                          <div key={file.name} className="flex items-center gap-2 flex-wrap">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status === "done" ? "bg-green-400" :
                              status === "error" ? "bg-red-400" :
                                status === "uploading" ? "bg-yellow-400" : "bg-[var(--color-border)]"
                              }`} />
                            <span className="text-xs text-[var(--color-text-primary)] max-w-[180px] truncate">{file.name}</span>
                            {status === "uploading" && (
                              <div className="flex-1 bg-[var(--color-border)] rounded-full h-1.5 min-w-[60px]">
                                <div className="bg-[var(--color-gold)] h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                              </div>
                            )}
                            {status === "done" && <span className="text-green-400 text-xs">✓</span>}
                            {status === "error" && <span className="text-red-400 text-xs">✗ retry</span>}
                            {status === "idle" && (
                              <button onClick={() => handleDeselect(key, file.name)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add files */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      multiple
                      className="hidden"
                      onChange={(e) => { if (e.target.files) handleFileSelect(e.target.files, key); }}
                    />
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
      </div>
    </div>
  );
}
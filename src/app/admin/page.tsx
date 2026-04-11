"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, orderBy, doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/config";
import { useAuth } from "@/components/auth/AuthProvider";

interface Course {
  id: string;
  name: string;
  code: string;
  department: string;
  year: number;
  semester: number;
  hasMaterials?: boolean;
}

interface GroupedCourses {
  [department: string]: {
    [year: number]: {
      [semester: number]: Course[];
    };
  };
}

type UploadCategory = "syllabus" | "aoc" | "past_questions" | "lecture_notes";

const CATEGORIES: { key: UploadCategory; label: string; icon: string }[] = [
  { key: "syllabus", label: "Syllabus", icon: "📋" },
  { key: "aoc", label: "Areas of Concentration", icon: "🎯" },
  { key: "past_questions", label: "Past Questions", icon: "📝" },
  { key: "lecture_notes", label: "Lecture Notes", icon: "📖" },
];

const ACCEPTED = ".pdf,.doc,.docx,.jpg,.jpeg,.png";

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
    if (userProfile && userProfile.role !== "admin") router.push("/");
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

  const markCourseGreen = (courseId: string) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, hasMaterials: true } : c))
    );
    setGrouped((prev) => {
      const next = { ...prev };
      for (const dept of Object.keys(next)) {
        for (const year of Object.keys(next[dept])) {
          for (const sem of Object.keys(next[dept][Number(year)])) {
            next[dept][Number(year)][Number(sem)] = next[dept][Number(year)][Number(sem)].map((c) =>
              c.id === courseId ? { ...c, hasMaterials: true } : c
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
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Bigard Memorial Institute — Course Materials Management
        </p>

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
          onUploaded={() => markCourseGreen(selectedCourse.id)}
        />
      )}
    </div>
  );
}

function CourseRow({ course, onUpload }: { course: Course; onUpload: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-gold)] transition-colors">
      <div className="flex items-center gap-3">
        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${course.hasMaterials ? "bg-green-500" : "bg-red-500"}`}
          title={course.hasMaterials ? "Has materials" : "No materials yet"}
        />
        <div>
          <p className="font-medium text-[var(--color-text-primary)]">{course.name}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">{course.code}</p>
        </div>
      </div>
      <button
        onClick={onUpload}
        className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-gold)] text-[var(--color-bg-primary)] font-semibold hover:opacity-90 transition-opacity"
      >
        Upload
      </button>
    </div>
  );
}

function UploadModal({ course, onClose, onUploaded }: {
  course: Course;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [progresses, setProgresses] = useState<Record<string, number>>({});
  const [statuses, setStatuses] = useState<Record<string, "idle" | "uploading" | "done" | "error">>({});

  const handleFile = async (file: File, category: UploadCategory) => {
    const path = `materials/${course.department}/year${course.year}/sem${course.semester}/${course.id}/${category}/${file.name}`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);

    setStatuses((p) => ({ ...p, [category]: "uploading" }));

    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setProgresses((p) => ({ ...p, [category]: pct }));
      },
      () => setStatuses((p) => ({ ...p, [category]: "error" })),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await updateDoc(doc(db, "courses", course.id), {
          hasMaterials: true,
          [`materials.${category}`]: url,
        });
        setStatuses((p) => ({ ...p, [category]: "done" }));
        onUploaded();
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-gold)]" style={{ fontFamily: "Playfair Display, serif" }}>
              {course.name}
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)]">{course.code} · Year {course.year} · Sem {course.semester}</p>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-secondary)] hover:text-white text-xl font-bold">✕</button>
        </div>

        <div className="space-y-4">
          {CATEGORIES.map(({ key, label, icon }) => (
            <div key={key} className="border border-[var(--color-border)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm text-[var(--color-text-primary)]">{icon} {label}</span>
                {statuses[key] === "done" && <span className="text-green-400 text-xs font-bold">✓ Uploaded</span>}
                {statuses[key] === "error" && <span className="text-red-400 text-xs font-bold">✗ Failed</span>}
              </div>

              {statuses[key] === "uploading" ? (
                <div className="w-full bg-[var(--color-border)] rounded-full h-2">
                  <div
                    className="bg-[var(--color-gold)] h-2 rounded-full transition-all"
                    style={{ width: `${progresses[key] || 0}%` }}
                  />
                </div>
              ) : statuses[key] === "done" ? null : (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-gold)] transition-colors">
                  <input
                    type="file"
                    accept={ACCEPTED}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file, key);
                    }}
                  />
                  <span className="px-3 py-1.5 border border-[var(--color-border)] rounded-lg hover:border-[var(--color-gold)]">
                    Choose file
                  </span>
                  <span>PDF, DOCX, DOC, JPG, PNG</span>
                </label>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
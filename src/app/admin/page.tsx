"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
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

export default function AdminPage() {
  const { firebaseUser, userProfile } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [grouped, setGrouped] = useState<GroupedCourses>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Auth guard
  useEffect(() => {
    if (!firebaseUser) {
      router.push("/");
      return;
    }
    if (userProfile && userProfile.role !== "admin") {
      router.push("/");
    }
  }, [firebaseUser, userProfile, router]);

  // Fetch courses
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const q = query(collection(db, "courses"), orderBy("department"));
        const snapshot = await getDocs(q);
        const data: Course[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Course[];
        setCourses(data);
        groupCourses(data);
      } catch (err) {
        console.error("Error fetching courses:", err);
      } finally {
        setLoading(false);
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

  const filteredCourses = search.trim()
    ? courses.filter(
      (c) =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.code?.toLowerCase().includes(search.toLowerCase())
    )
    : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <p className="text-[var(--color-gold)] text-lg">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-[var(--color-gold)] mb-1" style={{ fontFamily: "Playfair Display, serif" }}>
          Admin Panel
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Bigard Memorial Institute — Course Materials Management
        </p>

        {/* Search */}
        <input
          type="text"
          placeholder="Search courses by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-gold)] mb-8"
        />

        {/* Search Results */}
        {filteredCourses ? (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-text-secondary)] mb-3">
              {filteredCourses.length} result(s) for &quot;{search}&quot;
            </p>
            {filteredCourses.map((course) => (
              <CourseRow key={course.id} course={course} />
            ))}
          </div>
        ) : (
          /* Grouped View */
          <div className="space-y-6">
            {Object.keys(grouped).sort().map((dept) => (
              <div key={dept} className="border border-[var(--color-border)] rounded-xl overflow-hidden">
                {/* Department Header */}
                <button
                  onClick={() => toggleKey(dept)}
                  className="w-full flex items-center justify-between px-5 py-4 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  <span className="text-lg font-semibold text-[var(--color-gold)] capitalize">
                    {dept} Department
                  </span>
                  <span className="text-[var(--color-text-secondary)]">
                    {expandedKeys.has(dept) ? "▲" : "▼"}
                  </span>
                </button>

                {expandedKeys.has(dept) && (
                  <div className="p-4 space-y-4">
                    {Object.keys(grouped[dept]).sort().map((year) => (
                      <div key={year}>
                        {/* Year Header */}
                        <button
                          onClick={() => toggleKey(`${dept}-${year}`)}
                          className="w-full flex items-center justify-between px-4 py-2 bg-[var(--color-bg-tertiary)] rounded-lg mb-2"
                        >
                          <span className="font-medium text-[var(--color-text-primary)]">
                            Year {year}
                          </span>
                          <span className="text-[var(--color-text-secondary)] text-sm">
                            {expandedKeys.has(`${dept}-${year}`) ? "▲" : "▼"}
                          </span>
                        </button>

                        {expandedKeys.has(`${dept}-${year}`) && (
                          <div className="pl-4 space-y-3">
                            {Object.keys(grouped[dept][Number(year)]).sort().map((sem) => (
                              <div key={sem}>
                                {/* Semester Header */}
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
                                      <CourseRow key={course.id} course={course} />
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
    </div>
  );
}

function CourseRow({ course }: { course: Course }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-gold)] transition-colors">
      <div className="flex items-center gap-3">
        {/* Green/Red indicator */}
        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${course.hasMaterials ? "bg-green-500" : "bg-red-500"
            }`}
          title={course.hasMaterials ? "Has materials" : "No materials yet"}
        />
        <div>
          <p className="font-medium text-[var(--color-text-primary)]">{course.name}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">{course.code}</p>
        </div>
      </div>
      <button className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-gold)] text-[var(--color-bg-primary)] font-semibold hover:opacity-90 transition-opacity">
        Upload
      </button>
    </div>
  );
}
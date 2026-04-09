// Dashboard Home — Course Grid
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { Course, STUDY_MODE_LABELS, STUDY_MODE_ICONS, StudyMode } from '@/lib/types';
import { getFilteredCourses } from '@/lib/firestore/courses';

// Sample courses for demo (before Firestore is seeded)
const DEMO_COURSES: Course[] = [
  // Theology Year 1 Sem 1
  { id: 'theo-101', name: 'Introduction to Sacred Scripture', code: 'THEO-101', department: 'theology', year: 1, semester: 1, description: 'Foundations of Biblical study including hermeneutics, the canon, inspiration, and major themes of the Old and New Testaments.', createdAt: new Date().toISOString() },
  { id: 'theo-102', name: 'Fundamental Theology', code: 'THEO-102', department: 'theology', year: 1, semester: 1, description: 'The nature of revelation, faith, and the credibility of the Christian message. Includes the relationship between faith and reason.', createdAt: new Date().toISOString() },
  { id: 'theo-103', name: 'Patristic Theology', code: 'THEO-103', department: 'theology', year: 1, semester: 1, description: 'Study of the Church Fathers and their contributions to the development of Christian doctrine in the early centuries.', createdAt: new Date().toISOString() },
  { id: 'theo-104', name: 'Liturgy & Sacraments I', code: 'THEO-104', department: 'theology', year: 1, semester: 1, description: 'Theological foundations of Christian worship, the sacramental system, and the Eucharist as source and summit of the Christian life.', createdAt: new Date().toISOString() },
  // Philosophy Year 1 Sem 1
  { id: 'phil-101', name: 'Introduction to Philosophy', code: 'PHIL-101', department: 'philosophy', year: 1, semester: 1, description: 'Fundamental questions of philosophy: What is knowledge? What is real? What is the good? Survey of major philosophical traditions.', createdAt: new Date().toISOString() },
  { id: 'phil-102', name: 'Logic & Critical Thinking', code: 'PHIL-102', department: 'philosophy', year: 1, semester: 1, description: 'Formal and informal logic, valid argument forms, fallacies, and methods of sound reasoning in academic discourse.', createdAt: new Date().toISOString() },
  { id: 'phil-103', name: 'Ancient Greek Philosophy', code: 'PHIL-103', department: 'philosophy', year: 1, semester: 1, description: 'From the Pre-Socratics through Plato and Aristotle. Major metaphysical, epistemological, and ethical theories of antiquity.', createdAt: new Date().toISOString() },
  { id: 'phil-104', name: 'Philosophy of Nature', code: 'PHIL-104', department: 'philosophy', year: 1, semester: 1, description: 'Philosophical analysis of the natural world: causality, teleology, substance, change, and the philosophy of science.', createdAt: new Date().toISOString() },
];

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadCourses() {
      if (!userProfile?.department || !userProfile?.year || !userProfile?.currentSemester) {
        setIsLoading(false);
        return;
      }

      try {
        const filtered = await getFilteredCourses(
          userProfile.department,
          userProfile.year,
          userProfile.currentSemester
        );

        if (filtered.length > 0) {
          setCourses(filtered);
        } else {
          // Fall back to demo courses filtered by user's dept/year/semester
          const demoCourses = DEMO_COURSES.filter(
            (c) =>
              c.department === userProfile.department &&
              c.year === userProfile.year &&
              c.semester === userProfile.currentSemester
          );
          setCourses(demoCourses);
        }
      } catch (error) {
        console.error('Error loading courses:', error);
        // Fall back to demo courses
        const demoCourses = DEMO_COURSES.filter(
          (c) =>
            c.department === userProfile.department &&
            c.year === userProfile.year &&
            c.semester === userProfile.currentSemester
        );
        setCourses(demoCourses);
      }

      setIsLoading(false);
    }

    loadCourses();
  }, [userProfile]);

  const handleCourseClick = (courseId: string) => {
    router.push(`/dashboard/course/${courseId}`);
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-display mb-1">
          Your Courses
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {userProfile?.department === 'theology' ? '✝️ Theology' : '🏛️ Philosophy'}{' '}
          · Year {userProfile?.year} · Semester {userProfile?.currentSemester}
        </p>
      </div>

      {/* Course Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-6 shimmer h-48" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-4">📚</div>
          <h3 className="text-lg font-semibold mb-2">No Courses Available</h3>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Courses for your department and year haven&apos;t been set up yet.
            <br />
            Contact your administrator.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {courses.map((course, index) => (
            <button
              key={course.id}
              onClick={() => handleCourseClick(course.id)}
              className="glass-card p-6 text-left transition-all duration-300 hover:scale-[1.01] hover:border-[var(--color-accent)] group animate-slide-up"
              style={{ animationDelay: `${index * 80}ms` }}
              id={`course-card-${course.id}`}
            >
              {/* Course code badge */}
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 rounded-lg text-xs font-mono font-medium"
                  style={{
                    background: course.department === 'theology'
                      ? 'rgba(201, 168, 76, 0.15)'
                      : 'rgba(124, 108, 240, 0.15)',
                    color: course.department === 'theology' ? 'var(--color-gold)' : 'var(--color-accent)',
                  }}>
                  {course.code}
                </span>
                {/* Readiness badge placeholder */}
                <div className="badge-blue">—%</div>
              </div>

              {/* Course name */}
              <h3 className="text-base font-semibold mb-2 group-hover:text-white transition-colors line-clamp-2"
                style={{ color: 'var(--color-text-primary)' }}>
                {course.name}
              </h3>

              {/* Description */}
              <p className="text-xs leading-relaxed line-clamp-3 mb-4"
                style={{ color: 'var(--color-text-muted)' }}>
                {course.description}
              </p>

              {/* Mode icons */}
              <div className="flex items-center gap-1.5 pt-3 border-t"
                style={{ borderColor: 'var(--color-border)' }}>
                {(Object.keys(STUDY_MODE_ICONS) as StudyMode[]).map((mode) => (
                  <span key={mode} className="text-sm opacity-50 group-hover:opacity-100 transition-opacity"
                    title={STUDY_MODE_LABELS[mode]}>
                    {STUDY_MODE_ICONS[mode]}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase/config";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Course {
    id: string;
    name: string;
    code: string;
    department: string;
    year: number;
    semester: number;
}

type UploadCategory = "lecture_notes" | "past_questions" | "aoc" | "syllabus";

const CATEGORIES: { key: UploadCategory; label: string; icon: string; description: string }[] = [
    { key: "lecture_notes", label: "Lecture Notes", icon: "📖", description: "Class notes, handouts, summaries" },
    { key: "past_questions", label: "Past Questions", icon: "📝", description: "Past exam papers and questions" },
    { key: "aoc", label: "Areas of Concentration", icon: "🎯", description: "Topics likely to appear in exams" },
    { key: "syllabus", label: "Syllabus", icon: "📋", description: "Course outline or reading list" },
];

const DEPARTMENTS = ["philosophy", "theology"];
const YEARS = [1, 2, 3, 4];
const SEMESTERS = [1, 2];

type Step = "auth" | "form" | "success";

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ContributePage() {
    const { firebaseUser, loading: authLoading } = useAuth();
    const router = useRouter();
    const [step, setStep] = useState<Step>("auth");
    const [signingIn, setSigningIn] = useState(false);

    // Form state
    const [department, setDepartment] = useState("");
    const [year, setYear] = useState<number | "">("");
    const [semester, setSemester] = useState<number | "">("");
    const [allCourses, setAllCourses] = useState<Course[]>([]);
    const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState("");
    const [courseNotListed, setCourseNotListed] = useState(false);
    const [manualCourseName, setManualCourseName] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<UploadCategory>("lecture_notes");
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [successCourse, setSuccessCourse] = useState("");

    // Auth check
    useEffect(() => {
        if (!authLoading) {
            setStep(firebaseUser ? "form" : "auth");
        }
    }, [firebaseUser, authLoading]);

    // Load all courses once
    useEffect(() => {
        const load = async () => {
            const q = query(collection(db, "courses"), orderBy("department"));
            const snap = await getDocs(q);
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Course));
            setAllCourses(data);
        };
        load();
    }, []);

    // Filter courses when dept/year/sem changes
    useEffect(() => {
        if (!department || !year || !semester) {
            setFilteredCourses([]);
            return;
        }
        const filtered = allCourses.filter(
            (c) =>
                c.department === department &&
                c.year === Number(year) &&
                c.semester === Number(semester)
        );
        setFilteredCourses(filtered);
        setSelectedCourseId("");
        setCourseNotListed(false);
    }, [department, year, semester, allCourses]);

    const handleGoogleSignIn = async () => {
        setSigningIn(true);
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (err) {
            console.error("Sign in failed:", err);
        } finally {
            setSigningIn(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const incoming = Array.from(e.target.files);
        setFiles((prev) => {
            const existing = new Set(prev.map((f) => f.name));
            return [...prev, ...incoming.filter((f) => !existing.has(f.name))];
        });
    };

    const removeFile = (name: string) => {
        setFiles((prev) => prev.filter((f) => f.name !== name));
    };

    const canSubmit =
        department &&
        year &&
        semester &&
        (courseNotListed ? manualCourseName.trim().length > 0 : selectedCourseId) &&
        files.length > 0 &&
        !uploading;

    const handleSubmit = async () => {
        if (!canSubmit || !firebaseUser) return;
        setUploading(true);
        setSubmitError(null);

        const uploaderEmail = firebaseUser.email ?? "unknown";
        const courseName = courseNotListed
            ? manualCourseName.trim()
            : allCourses.find((c) => c.id === selectedCourseId)?.name ?? "";
        const courseId = courseNotListed ? null : selectedCourseId;
        const storagePath = `contributions/${department}/year${year}/sem${semester}/${courseId ?? "unlisted"}/${selectedCategory}`;

        try {
            for (const file of files) {
                const storageRef = ref(storage, `${storagePath}/${file.name}`);
                const task = uploadBytesResumable(storageRef, file);

                await new Promise<void>((resolve, reject) => {
                    task.on(
                        "state_changed",
                        (snap) => {
                            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                            setUploadProgress((p) => ({ ...p, [file.name]: pct }));
                        },
                        reject,
                        async () => {
                            const url = await getDownloadURL(task.snapshot.ref);

                            const formData = new FormData();
                            formData.append("file", file);
                            formData.append("fileUrl", url);
                            formData.append("uploadedBy", firebaseUser.uid);
                            formData.append("uploadedByRole", "student");
                            formData.append("uploaderEmail", uploaderEmail);
                            formData.append("suggestedCourseName", courseName);
                            if (courseId) formData.append("suggestedCourseId", courseId);
                            formData.append("category", selectedCategory);

                            await fetch("/api/process-upload", { method: "POST", body: formData });
                            resolve();
                        }
                    );
                });
            }

            setSuccessCourse(courseName);
            setStep("success");
        } catch (err) {
            console.error("Upload failed:", err);
            setSubmitError("Something went wrong during upload. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    const handleUploadMore = () => {
        setFiles([]);
        setUploadProgress({});
        setSubmitError(null);
        setSelectedCourseId("");
        setCourseNotListed(false);
        setManualCourseName("");
        setStep("form");
    };

    // ── Auth screen ─────────────────────────────────────────────────────────────
    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--navy)" }}>
                <p style={{ color: "var(--gold)" }}>Loading...</p>
            </div>
        );
    }

    if (step === "auth") {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--navy)" }}>
                <div className="w-full max-w-sm text-center space-y-6">
                    <div>
                        <p className="text-4xl mb-4">📚</p>
                        <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--gold)", opacity: 0.6 }}>
                            OurStudy AI · Bigard Seminary
                        </p>
                        <h1
                            className="text-2xl font-bold mb-2"
                            style={{ color: "var(--gold)", fontFamily: "Playfair Display, serif" }}
                        >
                            Contribute Materials
                        </h1>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                            You&apos;re in the right place. Every note, past question, and handout you share
                            makes OurStudy stronger — and makes someone&apos;s semester a little less hard.
                            Sign in to get started. It takes 10 seconds.
                        </p>
                    </div>

                    <button
                        onClick={handleGoogleSignIn}
                        disabled={signingIn}
                        className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: "var(--gold)", color: "var(--navy)" }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        {signingIn ? "Signing in..." : "Continue with Google"}
                    </button>

                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        We use Google sign-in to verify your identity and credit your contributions.
                        No passwords, no accounts to create.
                    </p>

                    <button
                        onClick={() => router.push("/dashboard")}
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                    >
                        ← Back to dashboard
                    </button>
                </div>
            </div>
        );
    }

    // ── Success screen ──────────────────────────────────────────────────────────
    if (step === "success") {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--navy)" }}>
                <div className="w-full max-w-sm text-center space-y-5">
                    <p className="text-5xl">🙏</p>
                    <h1
                        className="text-2xl font-bold"
                        style={{ color: "var(--gold)", fontFamily: "Playfair Display, serif" }}
                    >
                        Thank you — genuinely.
                    </h1>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        Your materials for <span style={{ color: "var(--gold)", fontWeight: 600 }}>{successCourse}</span> have
                        been received. Our team will review and make them available to your fellow students soon.
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        This kind of contribution is what makes OurStudy work. You just made someone&apos;s semester easier —
                        maybe without even knowing it.
                    </p>
                    <p className="text-sm font-semibold" style={{ color: "var(--gold)" }}>
                        What else have you got? Every past question, every handout, every area of concentration helps.
                        Keep them coming. 🔥
                    </p>

                    <div className="flex flex-col gap-3 pt-2">
                        <button
                            onClick={handleUploadMore}
                            className="w-full py-3 rounded-xl font-semibold text-sm"
                            style={{ background: "var(--gold)", color: "var(--navy)" }}
                        >
                            Upload more materials →
                        </button>
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="w-full py-3 rounded-xl font-semibold text-sm"
                            style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                        >
                            Back to dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Contribute form ─────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen px-4 py-8" style={{ background: "var(--navy)", color: "var(--text-primary)" }}>
            <div className="max-w-lg mx-auto space-y-6">

                {/* Header */}
                <div>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="text-sm mb-4 block"
                        style={{ color: "var(--text-muted)" }}
                    >
                        ← Back to dashboard
                    </button>
                    <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--gold)", opacity: 0.5 }}>
                        OurStudy AI · Bigard Seminary
                    </p>
                    <h1
                        className="text-2xl font-bold mb-1"
                        style={{ color: "var(--gold)", fontFamily: "Playfair Display, serif" }}
                    >
                        Contribute Materials
                    </h1>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        Signed in as <span style={{ color: "var(--gold)" }}>{firebaseUser?.email}</span>
                    </p>
                </div>

                {/* Step 1 — Course selection */}
                <div
                    className="rounded-xl p-5 space-y-4"
                    style={{ background: "var(--navy-card)", border: "1px solid var(--border)" }}
                >
                    <h2 className="font-semibold text-sm" style={{ color: "var(--gold)" }}>
                        1. Which course is this for?
                    </h2>

                    {/* Department */}
                    <div className="space-y-1">
                        <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Department</label>
                        <select
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm"
                            style={{ background: "var(--navy)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                        >
                            <option value="">— Select department —</option>
                            {DEPARTMENTS.map((d) => (
                                <option key={d} value={d}>
                                    {d.charAt(0).toUpperCase() + d.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Year */}
                    {department && (
                        <div className="space-y-1">
                            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Year</label>
                            <select
                                value={year}
                                onChange={(e) => setYear(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg text-sm"
                                style={{ background: "var(--navy)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                            >
                                <option value="">— Select year —</option>
                                {YEARS.map((y) => (
                                    <option key={y} value={y}>Year {y}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Semester */}
                    {department && year && (
                        <div className="space-y-1">
                            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Semester</label>
                            <select
                                value={semester}
                                onChange={(e) => setSemester(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg text-sm"
                                style={{ background: "var(--navy)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                            >
                                <option value="">— Select semester —</option>
                                {SEMESTERS.map((s) => (
                                    <option key={s} value={s}>Semester {s}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Course */}
                    {department && year && semester && (
                        <div className="space-y-2">
                            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Course</label>
                            {!courseNotListed ? (
                                <>
                                    <select
                                        value={selectedCourseId}
                                        onChange={(e) => setSelectedCourseId(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg text-sm"
                                        style={{ background: "var(--navy)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                                    >
                                        <option value="">— Select course —</option>
                                        {filteredCourses.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.code} — {c.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => { setCourseNotListed(true); setSelectedCourseId(""); }}
                                        className="text-xs"
                                        style={{ color: "var(--text-muted)" }}
                                    >
                                        My course isn&apos;t listed →
                                    </button>
                                </>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        value={manualCourseName}
                                        onChange={(e) => setManualCourseName(e.target.value)}
                                        placeholder="Type the full course name..."
                                        className="w-full px-3 py-2 rounded-lg text-sm"
                                        style={{ background: "var(--navy)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                                    />
                                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                        No problem — your material will still be received and linked to this course once it&apos;s added to the system.
                                    </p>
                                    <button
                                        onClick={() => { setCourseNotListed(false); setManualCourseName(""); }}
                                        className="text-xs"
                                        style={{ color: "var(--text-muted)" }}
                                    >
                                        ← Back to course list
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Step 2 — Category */}
                {(selectedCourseId || (courseNotListed && manualCourseName.trim())) && (
                    <div
                        className="rounded-xl p-5 space-y-3"
                        style={{ background: "var(--navy-card)", border: "1px solid var(--border)" }}
                    >
                        <h2 className="font-semibold text-sm" style={{ color: "var(--gold)" }}>
                            2. What type of material is this?
                        </h2>
                        <div className="grid grid-cols-2 gap-2">
                            {CATEGORIES.map(({ key, label, icon, description }) => (
                                <button
                                    key={key}
                                    onClick={() => setSelectedCategory(key)}
                                    className="text-left p-3 rounded-xl transition-colors"
                                    style={{
                                        background: selectedCategory === key ? "var(--gold)" : "var(--navy)",
                                        border: `1px solid ${selectedCategory === key ? "var(--gold)" : "var(--border)"}`,
                                        color: selectedCategory === key ? "var(--navy)" : "var(--text-primary)",
                                    }}
                                >
                                    <p className="text-base mb-1">{icon}</p>
                                    <p className="text-xs font-semibold">{label}</p>
                                    <p className="text-xs opacity-70 mt-0.5">{description}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 3 — Files */}
                {(selectedCourseId || (courseNotListed && manualCourseName.trim())) && (
                    <div
                        className="rounded-xl p-5 space-y-3"
                        style={{ background: "var(--navy-card)", border: "1px solid var(--border)" }}
                    >
                        <h2 className="font-semibold text-sm" style={{ color: "var(--gold)" }}>
                            3. Add your files
                        </h2>

                        <label
                            className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl cursor-pointer transition-colors"
                            style={{ border: "2px dashed var(--border)", color: "var(--text-muted)" }}
                        >
                            <input
                                type="file"
                                multiple
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                            <span className="text-2xl">📎</span>
                            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                                Click to add files
                            </span>
                            <span className="text-xs">PDF, DOCX, DOC, JPG, PNG</span>
                        </label>

                        {files.length > 0 && (
                            <div className="space-y-2">
                                {files.map((file) => {
                                    const progress = uploadProgress[file.name];
                                    return (
                                        <div
                                            key={file.name}
                                            className="flex items-center gap-3 px-3 py-2 rounded-lg"
                                            style={{ background: "var(--navy)", border: "1px solid var(--border)" }}
                                        >
                                            <span className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                                                {file.name}
                                            </span>
                                            {uploading && progress !== undefined ? (
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <div
                                                        className="w-16 h-1.5 rounded-full overflow-hidden"
                                                        style={{ background: "var(--border)" }}
                                                    >
                                                        <div
                                                            className="h-full rounded-full transition-all"
                                                            style={{ width: `${progress}%`, background: "var(--gold)" }}
                                                        />
                                                    </div>
                                                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{progress}%</span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => removeFile(file.name)}
                                                    className="text-xs flex-shrink-0"
                                                    style={{ color: "var(--text-muted)" }}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Submit */}
                {files.length > 0 && (
                    <div className="space-y-3">
                        {submitError && (
                            <p className="text-xs text-center" style={{ color: "#ef4444" }}>{submitError}</p>
                        )}
                        <button
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
                            style={{
                                background: "var(--gold)",
                                color: "var(--navy)",
                                opacity: canSubmit ? 1 : 0.5,
                            }}
                        >
                            {uploading
                                ? `Uploading ${files.length} file${files.length > 1 ? "s" : ""}...`
                                : `Submit ${files.length} file${files.length > 1 ? "s" : ""} →`}
                        </button>
                        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                            Submitted as {firebaseUser?.email}. All contributions are reviewed before going live.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
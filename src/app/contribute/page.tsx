"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase/config";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { saveReport } from "@/lib/firestore/materials";

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

type FileStatus = {
    status: "idle" | "uploading" | "extracting" | "classifying" | "done" | "error";
    progress: number;
    error?: string;
    reported?: boolean;
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

export default function ContributePage() {
    const { firebaseUser, loading: authLoading } = useAuth();
    const router = useRouter();
    const [step, setStep] = useState<Step>("auth");
    const [signingIn, setSigningIn] = useState(false);

    // Careful upload state
    const [department, setDepartment] = useState("");
    const [year, setYear] = useState<number | "">("");
    const [semester, setSemester] = useState<number | "">("");
    const [allCourses, setAllCourses] = useState<Course[]>([]);
    const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState("");
    const [courseNotListed, setCourseNotListed] = useState(false);
    const [manualCourseName, setManualCourseName] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<UploadCategory>("lecture_notes");
    const [carefulFiles, setCarefulFiles] = useState<File[]>([]);
    const [carefulUploading, setCarefulUploading] = useState(false);
    const [carefulStatuses, setCarefulStatuses] = useState<Record<string, FileStatus>>({});
    const [carefulDone, setCarefulDone] = useState(false);

    // Auto-detect state
    const [detectFiles, setDetectFiles] = useState<File[]>([]);
    const [detectStatuses, setDetectStatuses] = useState<Record<string, FileStatus>>({});
    const [detectUploading, setDetectUploading] = useState(false);

    useEffect(() => {
        if (!authLoading) setStep(firebaseUser ? "form" : "auth");
    }, [firebaseUser, authLoading]);

    useEffect(() => {
        const load = async () => {
            const q = query(collection(db, "courses"), orderBy("department"));
            const snap = await getDocs(q);
            setAllCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Course)));
        };
        load();
    }, []);

    useEffect(() => {
        if (!department || !year || !semester) { setFilteredCourses([]); return; }
        setFilteredCourses(allCourses.filter(
            (c) => c.department === department && c.year === Number(year) && c.semester === Number(semester)
        ));
        setSelectedCourseId("");
        setCourseNotListed(false);
    }, [department, year, semester, allCourses]);

    const handleGoogleSignIn = async () => {
        setSigningIn(true);
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (err) {
            console.error("Sign in failed:", err);
        } finally {
            setSigningIn(false);
        }
    };

    // ── Careful upload ────────────────────────────────────────────────────────

    const carefulCanSubmit =
        department && year && semester &&
        (courseNotListed ? manualCourseName.trim().length > 0 : selectedCourseId) &&
        carefulFiles.length > 0 && !carefulUploading;

    const handleCarefulSubmit = async () => {
        if (!carefulCanSubmit || !firebaseUser) return;
        setCarefulUploading(true);
        setCarefulDone(false);

        const uploaderEmail = firebaseUser.email ?? "unknown";
        const courseName = courseNotListed
            ? manualCourseName.trim()
            : allCourses.find((c) => c.id === selectedCourseId)?.name ?? "";
        const courseId = courseNotListed ? null : selectedCourseId;
        const storagePath = `contributions/${department}/year${year}/sem${semester}/${courseId ?? "unlisted"}/${selectedCategory}`;

        const initialStatuses: Record<string, FileStatus> = {};
        carefulFiles.forEach((f) => { initialStatuses[f.name] = { status: "idle", progress: 0 }; });
        setCarefulStatuses(initialStatuses);

        let anyFailed = false;

        for (const file of carefulFiles) {
            try {
                setCarefulStatuses((p) => ({ ...p, [file.name]: { status: "uploading", progress: 0 } }));
                const storageRef = ref(storage, `${storagePath}/${file.name}`);
                const task = uploadBytesResumable(storageRef, file);

                await new Promise<void>((resolve, reject) => {
                    task.on("state_changed",
                        (snap) => {
                            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                            setCarefulStatuses((p) => ({ ...p, [file.name]: { status: "uploading", progress: pct } }));
                        },
                        (err) => {
                            setCarefulStatuses((p) => ({
                                ...p, [file.name]: {
                                    status: "error", progress: 0,
                                    error: `Upload failed for ${file.name}. This is usually a connection issue or a file that is too large. Check your internet and try again. If it keeps happening, note the file name and report it.`,
                                }
                            }));
                            anyFailed = true;
                            reject(err);
                        },
                        async () => {
                            try {
                                const url = await getDownloadURL(task.snapshot.ref);
                                setCarefulStatuses((p) => ({ ...p, [file.name]: { status: "extracting", progress: 100 } }));

                                const formData = new FormData();
                                formData.append("file", file);
                                formData.append("fileUrl", url);
                                formData.append("uploadedBy", firebaseUser.uid);
                                formData.append("uploadedByRole", "student");
                                formData.append("uploaderEmail", uploaderEmail);
                                formData.append("suggestedCourseName", courseName);
                                if (courseId) formData.append("suggestedCourseId", courseId);
                                formData.append("category", selectedCategory);

                                setCarefulStatuses((p) => ({ ...p, [file.name]: { status: "classifying", progress: 100 } }));
                                const res = await fetch("/api/process-upload", { method: "POST", body: formData });

                                if (!res.ok) {
                                    setCarefulStatuses((p) => ({
                                        ...p, [file.name]: {
                                            status: "error", progress: 100,
                                            error: `Your file uploaded successfully but something went wrong during processing. It may still appear in the admin review queue. If not, report this with the file name: ${file.name} and the time of upload.`,
                                        }
                                    }));
                                    anyFailed = true;
                                } else {
                                    setCarefulStatuses((p) => ({ ...p, [file.name]: { status: "done", progress: 100 } }));
                                }
                                resolve();
                            } catch {
                                setCarefulStatuses((p) => ({
                                    ...p, [file.name]: {
                                        status: "error", progress: 100,
                                        error: `Your file uploaded successfully but something went wrong during processing. It may still appear in the admin review queue. If not, report this with the file name: ${file.name} and the time of upload.`,
                                    }
                                }));
                                anyFailed = true;
                                resolve();
                            }
                        }
                    );
                });
            } catch {
                anyFailed = true;
            }
        }

        setCarefulUploading(false);
        if (!anyFailed) setCarefulDone(true);
    };

    const handleReportCareful = async (fileName: string, errorMsg: string) => {
        if (!firebaseUser) return;
        try {
            await saveReport({
                uploaderEmail: firebaseUser.email ?? "unknown",
                uploadedBy: firebaseUser.uid,
                fileName,
                errorType: "upload_failed",
                description: errorMsg,
            });
            setCarefulStatuses((p) => ({ ...p, [fileName]: { ...p[fileName], reported: true } }));
        } catch (err) {
            console.error("Failed to save report:", err);
        }
    };

    // ── Auto-detect upload ────────────────────────────────────────────────────

    const handleDetectSubmit = async () => {
        if (detectFiles.length === 0 || !firebaseUser || detectUploading) return;
        setDetectUploading(true);

        const uploaderEmail = firebaseUser.email ?? "unknown";
        const initialStatuses: Record<string, FileStatus> = {};
        detectFiles.forEach((f) => { initialStatuses[f.name] = { status: "idle", progress: 0 }; });
        setDetectStatuses(initialStatuses);

        for (const file of detectFiles) {
            try {
                setDetectStatuses((p) => ({ ...p, [file.name]: { status: "uploading", progress: 0 } }));
                const storageRef = ref(storage, `auto-detect/${firebaseUser.uid}/${Date.now()}_${file.name}`);
                const task = uploadBytesResumable(storageRef, file);

                await new Promise<void>((resolve) => {
                    task.on("state_changed",
                        (snap) => {
                            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                            setDetectStatuses((p) => ({ ...p, [file.name]: { status: "uploading", progress: pct } }));
                        },
                        () => {
                            setDetectStatuses((p) => ({
                                ...p, [file.name]: {
                                    status: "error", progress: 0,
                                    error: `Upload failed for ${file.name}. Likely a connection issue or file size problem. Try again or use the course selector above.`,
                                }
                            }));
                            resolve();
                        },
                        async () => {
                            try {
                                const url = await getDownloadURL(task.snapshot.ref);
                                setDetectStatuses((p) => ({ ...p, [file.name]: { status: "extracting", progress: 100 } }));

                                const formData = new FormData();
                                formData.append("file", file);
                                formData.append("fileUrl", url);
                                formData.append("uploadedBy", firebaseUser.uid);
                                formData.append("uploadedByRole", "student");
                                formData.append("uploaderEmail", uploaderEmail);

                                setDetectStatuses((p) => ({ ...p, [file.name]: { status: "classifying", progress: 100 } }));
                                const res = await fetch("/api/process-upload", { method: "POST", body: formData });

                                if (!res.ok) {
                                    setDetectStatuses((p) => ({
                                        ...p, [file.name]: {
                                            status: "error", progress: 100,
                                            error: `Your file reached us but processing failed. It may appear in the admin queue as unprocessed. Report this with ${file.name} if it doesn&apos;t show up within a few minutes.`,
                                        }
                                    }));
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
                                setDetectStatuses((p) => ({
                                    ...p, [file.name]: {
                                        status: "error", progress: 100,
                                        error: `Your file reached us but processing failed. Report this with file name: ${file.name} if it doesn&apos;t show up in the review queue within a few minutes.`,
                                    }
                                }));
                                resolve();
                            }
                        }
                    );
                });
            } catch {
                setDetectStatuses((p) => ({
                    ...p, [file.name]: {
                        status: "error", progress: 0,
                        error: `Something went wrong with ${file.name}. Please try again.`,
                    }
                }));
            }
        }
        setDetectUploading(false);
    };

    const handleReportDetect = async (fileName: string, errorMsg: string) => {
        if (!firebaseUser) return;
        try {
            await saveReport({
                uploaderEmail: firebaseUser.email ?? "unknown",
                uploadedBy: firebaseUser.uid,
                fileName,
                errorType: "processing_failed",
                description: errorMsg,
            });
            setDetectStatuses((p) => ({ ...p, [fileName]: { ...p[fileName], reported: true } }));
        } catch (err) {
            console.error("Failed to save report:", err);
        }
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

    const getDetectResultMessage = (result: FileStatus["result"]) => {
        if (!result) return null;
        const course = result.suggestedCourseName ?? result.detectedCourseName;
        if (result.detectedStatus === "quarantined" || result.confidence === "low") {
            return {
                type: "weak",
                message: `We received your file but couldn't place it confidently. An admin will sort it manually. For faster placement, try uploading it using the course selector above.`,
            };
        }
        return {
            type: "strong",
            message: `Got it. We detected this as ${course ? `"${course}"` : "an unknown course"} — ${result.category.replace("_", " ")}. Confidence: ${result.confidence}. Admins will confirm before it goes live.`,
        };
    };

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
                        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--gold)", fontFamily: "Playfair Display, serif" }}>
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
                    <button onClick={() => router.push("/dashboard")} className="text-xs" style={{ color: "var(--text-muted)" }}>
                        ← Back to dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (step === "success") {
        return (
            <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--navy)" }}>
                <div className="w-full max-w-sm text-center space-y-5">
                    <p className="text-5xl">🙏</p>
                    <h1 className="text-2xl font-bold" style={{ color: "var(--gold)", fontFamily: "Playfair Display, serif" }}>
                        Thank you — genuinely.
                    </h1>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        Your files have been received. Our team will review and make them available to your fellow students soon.
                    </p>
                    <p className="text-sm font-semibold" style={{ color: "var(--gold)" }}>
                        What else have you got? Every past question, every handout, every area of concentration helps. Keep them coming. 🔥
                    </p>
                    <div className="flex flex-col gap-3 pt-2">
                        <button
                            onClick={() => {
                                setCarefulFiles([]);
                                setCarefulStatuses({});
                                setCarefulDone(false);
                                setSelectedCourseId("");
                                setCourseNotListed(false);
                                setManualCourseName("");
                                setStep("form");
                            }}
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

    return (
        <div className="min-h-screen px-4 py-8" style={{ background: "var(--navy)", color: "var(--text-primary)" }}>
            <div className="max-w-lg mx-auto space-y-6">

                {/* Header */}
                <div>
                    <button onClick={() => router.push("/dashboard")} className="text-sm mb-4 block" style={{ color: "var(--text-muted)" }}>
                        ← Back to dashboard
                    </button>
                    <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--gold)", opacity: 0.5 }}>
                        OurStudy AI · Bigard Seminary
                    </p>
                    <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--gold)", fontFamily: "Playfair Display, serif" }}>
                        Contribute Materials
                    </h1>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        Signed in as <span style={{ color: "var(--gold)" }}>{firebaseUser?.email}</span>
                    </p>
                </div>

                {/* ── Section A: Careful upload ─────────────────────────────── */}
                <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--navy-card)", border: "1px solid var(--border)" }}>
                    <div>
                        <h2 className="font-semibold text-sm mb-1" style={{ color: "var(--gold)" }}>Upload by course</h2>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                            Select the course, pick a category, and upload your files. This gives your materials the best chance of going live quickly.
                        </p>
                    </div>

                    {/* Department */}
                    <div className="space-y-1">
                        <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Department</label>
                        <select value={department} onChange={(e) => setDepartment(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm"
                            style={{ background: "var(--navy)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                            <option value="">— Select department —</option>
                            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                        </select>
                    </div>

                    {department && (
                        <div className="space-y-1">
                            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Year</label>
                            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg text-sm"
                                style={{ background: "var(--navy)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                                <option value="">— Select year —</option>
                                {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
                            </select>
                        </div>
                    )}

                    {department && year && (
                        <div className="space-y-1">
                            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Semester</label>
                            <select value={semester} onChange={(e) => setSemester(Number(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg text-sm"
                                style={{ background: "var(--navy)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                                <option value="">— Select semester —</option>
                                {SEMESTERS.map((s) => <option key={s} value={s}>Semester {s}</option>)}
                            </select>
                        </div>
                    )}

                    {department && year && semester && (
                        <div className="space-y-2">
                            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Course</label>
                            {!courseNotListed ? (
                                <>
                                    <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg text-sm"
                                        style={{ background: "var(--navy)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                                        <option value="">— Select course —</option>
                                        {filteredCourses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                                    </select>
                                    <button onClick={() => { setCourseNotListed(true); setSelectedCourseId(""); }}
                                        className="text-xs" style={{ color: "var(--text-muted)" }}>
                                        My course isn&apos;t listed →
                                    </button>
                                </>
                            ) : (
                                <>
                                    <input type="text" value={manualCourseName} onChange={(e) => setManualCourseName(e.target.value)}
                                        placeholder="Type the full course name..."
                                        className="w-full px-3 py-2 rounded-lg text-sm"
                                        style={{ background: "var(--navy)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                        No problem — your material will still be received and linked to this course once it&apos;s added to the system.
                                    </p>
                                    <button onClick={() => { setCourseNotListed(false); setManualCourseName(""); }}
                                        className="text-xs" style={{ color: "var(--text-muted)" }}>
                                        ← Back to course list
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {(selectedCourseId || (courseNotListed && manualCourseName.trim())) && (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Category</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {CATEGORIES.map(({ key, label, icon, description }) => (
                                        <button key={key} onClick={() => setSelectedCategory(key)}
                                            className="text-left p-3 rounded-xl transition-colors"
                                            style={{
                                                background: selectedCategory === key ? "var(--gold)" : "var(--navy)",
                                                border: `1px solid ${selectedCategory === key ? "var(--gold)" : "var(--border)"}`,
                                                color: selectedCategory === key ? "var(--navy)" : "var(--text-primary)",
                                            }}>
                                            <p className="text-base mb-1">{icon}</p>
                                            <p className="text-xs font-semibold">{label}</p>
                                            <p className="text-xs opacity-70 mt-0.5">{description}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl cursor-pointer"
                                    style={{ border: "2px dashed var(--border)", color: "var(--text-muted)" }}>
                                    <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
                                        onChange={(e) => {
                                            if (!e.target.files) return;
                                            const incoming = Array.from(e.target.files);
                                            setCarefulFiles((prev) => {
                                                const existing = new Set(prev.map((f) => f.name));
                                                return [...prev, ...incoming.filter((f) => !existing.has(f.name))];
                                            });
                                        }} />
                                    <span className="text-2xl">📎</span>
                                    <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Click to add files</span>
                                    <span className="text-xs">PDF, DOCX, DOC, JPG, PNG · Multiple files supported</span>
                                </label>
                            </div>

                            {carefulFiles.length > 0 && (
                                <div className="space-y-2">
                                    {carefulFiles.map((file) => {
                                        const fs = carefulStatuses[file.name];
                                        return (
                                            <div key={file.name} className="space-y-1">
                                                <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
                                                    style={{ background: "var(--navy)", border: "1px solid var(--border)" }}>
                                                    <span className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>{file.name}</span>
                                                    {!fs || fs.status === "idle" ? (
                                                        <button onClick={() => setCarefulFiles((p) => p.filter((f) => f.name !== file.name))}
                                                            className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>✕</button>
                                                    ) : fs.status === "uploading" ? (
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                                                <div className="h-full rounded-full transition-all" style={{ width: `${fs.progress}%`, background: "var(--gold)" }} />
                                                            </div>
                                                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{fs.progress}%</span>
                                                        </div>
                                                    ) : fs.status === "extracting" ? (
                                                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Extracting text...</span>
                                                    ) : fs.status === "classifying" ? (
                                                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Classifying...</span>
                                                    ) : fs.status === "done" ? (
                                                        <span className="text-xs" style={{ color: "#22c55e" }}>✓ Done</span>
                                                    ) : (
                                                        <span className="text-xs" style={{ color: "#ef4444" }}>✗ Failed</span>
                                                    )}
                                                </div>
                                                {fs?.status === "error" && fs.error && (
                                                    <div className="px-3 py-2 rounded-lg text-xs space-y-1" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
                                                        <p>{fs.error}</p>
                                                        <button
                                                            onClick={() => handleReportCareful(file.name, fs.error!)}
                                                            disabled={fs.reported}
                                                            className="text-xs font-semibold underline"
                                                            style={{ color: fs.reported ? "#6b7280" : "#f87171" }}
                                                        >
                                                            {fs.reported ? "Reported ✓ — Thank you, this helps us improve." : "Report this issue →"}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {carefulFiles.length > 0 && (
                                <button onClick={handleCarefulSubmit} disabled={!carefulCanSubmit}
                                    className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
                                    style={{ background: "var(--gold)", color: "var(--navy)", opacity: carefulCanSubmit ? 1 : 0.5 }}>
                                    {carefulUploading
                                        ? `Uploading ${carefulFiles.length} file${carefulFiles.length > 1 ? "s" : ""}...`
                                        : carefulDone
                                            ? "✓ All files submitted"
                                            : `Submit ${carefulFiles.length} file${carefulFiles.length > 1 ? "s" : ""} →`}
                                </button>
                            )}

                            {carefulDone && (
                                <p className="text-xs text-center" style={{ color: "#22c55e" }}>
                                    Your files are in. Admins will review and make them live soon. Thank you.
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* ── Section B: Auto-detect ────────────────────────────────── */}
                <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--navy-card)", border: "1px solid var(--border)" }}>
                    <div>
                        <h2 className="font-semibold text-sm mb-1" style={{ color: "var(--gold)" }}>Drop files — let the system sort them</h2>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                            Have files that don&apos;t fit neatly into a course right now? Drop them here. Our system will read them and do its best to sort them automatically. Admins will confirm placement before anything goes live.
                        </p>
                    </div>

                    <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl cursor-pointer"
                        style={{ border: "2px dashed var(--border)", color: "var(--text-muted)" }}>
                        <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
                            onChange={(e) => {
                                if (!e.target.files) return;
                                const incoming = Array.from(e.target.files);
                                setDetectFiles((prev) => {
                                    const existing = new Set(prev.map((f) => f.name));
                                    return [...prev, ...incoming.filter((f) => !existing.has(f.name))];
                                });
                            }} />
                        <span className="text-2xl">🔍</span>
                        <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Click to add files</span>
                        <span className="text-xs">PDF, DOCX, DOC, JPG, PNG · Multiple files supported</span>
                    </label>

                    {detectFiles.length > 0 && (
                        <div className="space-y-3">
                            {detectFiles.map((file) => {
                                const fs = detectStatuses[file.name];
                                const resultMsg = fs?.result ? getDetectResultMessage(fs.result) : null;
                                return (
                                    <div key={file.name} className="space-y-2">
                                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
                                            style={{ background: "var(--navy)", border: "1px solid var(--border)" }}>
                                            <span className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>{file.name}</span>
                                            {!fs || fs.status === "idle" ? (
                                                <button onClick={() => setDetectFiles((p) => p.filter((f) => f.name !== file.name))}
                                                    className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>✕</button>
                                            ) : (
                                                <span className="text-xs flex-shrink-0" style={{ color: fs.status === "done" ? "#22c55e" : fs.status === "error" ? "#ef4444" : "var(--text-muted)" }}>
                                                    {getDetectStatusLabel(fs.status)}
                                                </span>
                                            )}
                                        </div>

                                        {fs?.status === "uploading" && (
                                            <div className="px-3">
                                                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                                    <div className="h-full rounded-full transition-all" style={{ width: `${fs.progress}%`, background: "var(--gold)" }} />
                                                </div>
                                            </div>
                                        )}

                                        {fs?.status === "done" && resultMsg && (
                                            <div className="px-3 py-2 rounded-lg text-xs leading-relaxed"
                                                style={{
                                                    background: resultMsg.type === "strong" ? "rgba(34,197,94,0.08)" : "rgba(234,179,8,0.08)",
                                                    border: `1px solid ${resultMsg.type === "strong" ? "rgba(34,197,94,0.2)" : "rgba(234,179,8,0.2)"}`,
                                                    color: resultMsg.type === "strong" ? "#86efac" : "#fde68a",
                                                }}>
                                                {resultMsg.message}
                                            </div>
                                        )}

                                        {fs?.status === "error" && fs.error && (
                                            <div className="px-3 py-2 rounded-lg text-xs space-y-1"
                                                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
                                                <p>{fs.error}</p>
                                                <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                                                    For faster placement, try uploading using the course selector above.
                                                </p>
                                                <button
                                                    onClick={() => handleReportDetect(file.name, fs.error!)}
                                                    disabled={fs.reported}
                                                    className="text-xs font-semibold underline"
                                                    style={{ color: fs.reported ? "#6b7280" : "#f87171" }}
                                                >
                                                    {fs.reported ? "Reported ✓ — Thank you, this helps us improve." : "Report this issue →"}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            <button
                                onClick={handleDetectSubmit}
                                disabled={detectUploading || detectFiles.every((f) => detectStatuses[f.name]?.status === "done")}
                                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
                                style={{
                                    background: "var(--gold)", color: "var(--navy)",
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

                <p className="text-xs text-center pb-4" style={{ color: "var(--text-muted)" }}>
                    Submitted as {firebaseUser?.email}. All contributions are reviewed before going live.
                </p>
            </div>
        </div>
    );
}
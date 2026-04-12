// src/lib/processing/classifier.ts
// Analyses extracted text and suggests: category, courseId, confidence level
// Used by /api/process-upload to auto-classify uploaded materials

import { db } from "@/lib/firebase/config";
import { collection, getDocs } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MaterialCategory =
    | "notes"
    | "past_questions"
    | "textbook"
    | "aoc"
    | "other";

export type ClassificationResult = {
    category: MaterialCategory;
    suggestedCourseId: string | null;
    suggestedCourseName: string | null;
    detectedCourseName: string | null;  // best guess even if no Firestore match
    confidence: "high" | "medium" | "low";
    reason: string;
};

type CourseRecord = {
    id: string;
    name: string;
    code?: string;
    department?: string;
    year?: number;
    semester?: number;
};

// ─── Category Keywords ────────────────────────────────────────────────────────

const CATEGORY_SIGNALS: Record<MaterialCategory, string[]> = {
    past_questions: [
        "past question", "past exam", "examination questions",
        "answer all questions", "section a", "section b",
        "attempt any", "time allowed", "instructions to candidates",
        "question paper", "end of semester exam", "examination paper",
    ],
    aoc: [
        "area of concentration", "areas of concentration",
        "aoc", "topics to cover", "focus areas", "likely topics",
        "expected topics", "concentration areas",
    ],
    textbook: [
        "chapter", "introduction", "bibliography", "references",
        "table of contents", "foreword", "preface", "index",
        "published by", "edition", "copyright", "isbn",
    ],
    notes: [
        "lecture notes", "class notes", "note on", "topic:",
        "definition:", "summary", "outline", "week ", "lecture ",
    ],
    other: [],
};

// ─── Theology / Philosophy course name signals ────────────────────────────────
// Used to detect a likely course name even when no Firestore course matches yet.
// Add more patterns here as new departments/years are added.

const COURSE_NAME_PATTERNS: RegExp[] = [
    // e.g. "Fundamental Moral Theology", "Introduction to Philosophy"
    /\b(fundamental|introduction to|history of|theology of|philosophy of|principles of|ethics of|study of|elements of|survey of)\s+[a-z\s]{3,40}/gi,
    // e.g. "Moral Theology", "Sacred Scripture", "Canon Law"
    /\b(moral theology|sacred scripture|canon law|church history|dogmatic theology|pastoral theology|systematic theology|biblical theology|spiritual theology|christology|ecclesiology|eschatology|soteriology|pneumatology|trinitarian theology|patristics|homiletics|liturgy|sacraments|metaphysics|epistemology|logic|ethics|cosmology|anthropology|political philosophy|philosophy of mind|philosophy of religion|aesthetics|ontology)\b/gi,
];

// ─── Main Classifier ──────────────────────────────────────────────────────────

export async function classifyMaterial(
    text: string,
    fileName: string
): Promise<ClassificationResult> {

    const lowerText = (text + " " + fileName).toLowerCase();

    // 1. Detect category
    const category = detectCategory(lowerText);

    // 2. Try to match a course from Firestore
    const { courseId, courseName, detectedCourseName, confidence, reason } =
        await matchCourse(text, lowerText, fileName);

    return {
        category,
        suggestedCourseId: courseId,
        suggestedCourseName: courseName,
        detectedCourseName,
        confidence,
        reason,
    };
}

// ─── Category Detection ───────────────────────────────────────────────────────

function detectCategory(lowerText: string): MaterialCategory {
    const scores: Record<MaterialCategory, number> = {
        past_questions: 0,
        aoc: 0,
        textbook: 0,
        notes: 0,
        other: 0,
    };

    for (const [cat, signals] of Object.entries(CATEGORY_SIGNALS)) {
        for (const signal of signals) {
            if (lowerText.includes(signal)) {
                scores[cat as MaterialCategory] += 1;
            }
        }
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    if (top[1] === 0) return "other";
    return top[0] as MaterialCategory;
}

// ─── Ghost Course Name Detection ──────────────────────────────────────────────
// Tries to extract a likely course name from text even with no Firestore match.
// Used to populate detectedCourseName for awaiting_course materials.

function extractGhostCourseName(text: string, fileName: string): string | null {
    const combined = text.slice(0, 2000) + " " + fileName; // check early text + filename

    for (const pattern of COURSE_NAME_PATTERNS) {
        pattern.lastIndex = 0; // reset regex state
        const match = pattern.exec(combined);
        if (match) {
            // Capitalize and trim the match
            return match[0].trim().replace(/\b\w/g, (c) => c.toUpperCase());
        }
    }
    return null;
}

// ─── Course Matching ──────────────────────────────────────────────────────────

async function matchCourse(
    originalText: string,
    lowerText: string,
    fileName: string
): Promise<{
    courseId: string | null;
    courseName: string | null;
    detectedCourseName: string | null;
    confidence: "high" | "medium" | "low";
    reason: string;
}> {
    try {
        const snapshot = await getDocs(collection(db, "courses"));
        const courses: CourseRecord[] = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<CourseRecord, "id">),
        }));

        let bestMatch: CourseRecord | null = null;
        let bestScore = 0;

        for (const course of courses) {
            let score = 0;
            const courseName = (course.name ?? "").toLowerCase();
            const courseCode = (course.code ?? "").toLowerCase();

            if (courseCode && lowerText.includes(courseCode)) score += 10;
            if (courseName && lowerText.includes(courseName)) score += 8;

            const words = courseName.split(/\s+/).filter((w) => w.length > 3);
            for (const word of words) {
                if (lowerText.includes(word)) score += 1;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = course;
            }
        }

        // Always attempt ghost detection regardless of Firestore match
        const detectedCourseName = extractGhostCourseName(originalText, fileName);

        if (!bestMatch || bestScore === 0) {
            return {
                courseId: null,
                courseName: null,
                detectedCourseName,
                confidence: "low",
                reason: detectedCourseName
                    ? `No Firestore course matched. Detected possible course name: "${detectedCourseName}".`
                    : "No matching course found in text or filename.",
            };
        }

        const confidence =
            bestScore >= 10 ? "high" : bestScore >= 4 ? "medium" : "low";

        return {
            courseId: bestMatch.id,
            courseName: bestMatch.name,
            detectedCourseName: detectedCourseName ?? bestMatch.name,
            confidence,
            reason: `Matched "${bestMatch.name}" with score ${bestScore}.`,
        };

    } catch (err) {
        console.error("[classifier] Course matching failed:", err);
        return {
            courseId: null,
            courseName: null,
            detectedCourseName: null,
            confidence: "low",
            reason: "Error loading courses from Firestore.",
        };
    }
}
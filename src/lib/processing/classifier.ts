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

// ─── Main Classifier ──────────────────────────────────────────────────────────

export async function classifyMaterial(
    text: string,
    fileName: string
): Promise<ClassificationResult> {

    const lowerText = (text + " " + fileName).toLowerCase();

    // 1. Detect category
    const category = detectCategory(lowerText);

    // 2. Try to match a course from Firestore
    const { courseId, courseName, confidence, reason } =
        await matchCourse(lowerText);

    return {
        category,
        suggestedCourseId: courseId,
        suggestedCourseName: courseName,
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

    // Return the highest scoring category
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];

    // If no signals matched at all, return "other"
    if (top[1] === 0) return "other";
    return top[0] as MaterialCategory;
}

// ─── Course Matching ──────────────────────────────────────────────────────────

async function matchCourse(lowerText: string): Promise<{
    courseId: string | null;
    courseName: string | null;
    confidence: "high" | "medium" | "low";
    reason: string;
}> {
    try {
        // Load all courses from Firestore
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

            // Exact course code match is strongest signal
            if (courseCode && lowerText.includes(courseCode)) {
                score += 10;
            }

            // Full course name match
            if (courseName && lowerText.includes(courseName)) {
                score += 8;
            }

            // Partial word matches (each word in course name found in text)
            const words = courseName.split(/\s+/).filter((w) => w.length > 3);
            for (const word of words) {
                if (lowerText.includes(word)) score += 1;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = course;
            }
        }

        if (!bestMatch || bestScore === 0) {
            return {
                courseId: null,
                courseName: null,
                confidence: "low",
                reason: "No matching course found in text or filename.",
            };
        }

        const confidence =
            bestScore >= 10 ? "high" : bestScore >= 4 ? "medium" : "low";

        return {
            courseId: bestMatch.id,
            courseName: bestMatch.name,
            confidence,
            reason: `Matched "${bestMatch.name}" with score ${bestScore}.`,
        };

    } catch (err) {
        console.error("[classifier] Course matching failed:", err);
        return {
            courseId: null,
            courseName: null,
            confidence: "low",
            reason: "Error loading courses from Firestore.",
        };
    }
}
// ============================================
// Our Study AI — Core TypeScript Interfaces
// ============================================

// --- User & Auth ---
export type Department = 'philosophy' | 'theology';
export type UserRole = 'student' | 'admin' | 'chief_admin' | 'class_rep';
export type ReadinessStatus = 'strong' | 'developing' | 'needs_work' | 'area_for_growth';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  department?: Department;
  year?: number;
  currentSemester?: number;
  expiryDate?: string;
  isActive: boolean;
  role: UserRole;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Courses ---
export interface Course {
  id: string;
  name: string;
  code: string;
  department: Department;
  year: number;
  semester: number;
  description: string;
  readiness?: 'empty' | 'partial' | 'verified';
  materials?: Record<string, Record<string, string>>;
  cornerstoneLibraryId?: string;
  courseLibraryId?: string;
  readinessPercentage?: number;
  createdAt: string;
}

// --- Study Modes ---
export type StudyMode =
  | 'plain_explainer'
  | 'practice_questions'
  | 'exam_preparation'
  | 'progress_check'
  | 'research'
  | 'readiness_assessment';

export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  plain_explainer: 'Plain Explainer',
  practice_questions: 'Practice Questions',
  exam_preparation: 'Exam Preparation',
  progress_check: 'Progress Check',
  research: 'Research Mode',
  readiness_assessment: 'Exam Readiness',
};

export const STUDY_MODE_ICONS: Record<StudyMode, string> = {
  plain_explainer: '💡',
  practice_questions: '❓',
  exam_preparation: '📝',
  progress_check: '📊',
  research: '🔬',
  readiness_assessment: '🎯',
};

// --- Chat ---
export type MessageStatus = 'sending' | 'streaming' | 'complete' | 'error';
export type FeedbackType = 'helpful' | 'not_helpful' | null;

export interface ChatSession {
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  mode: StudyMode;
  title: string;
  startedAt: string;
  lastMessageAt: string;
  sessionSummary?: string;
  messageCount: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  status: MessageStatus;
  flagged: boolean;
  feedback: FeedbackType;
}

// --- Semester Context ---
export interface SemesterContext {
  id: string;
  userId: string;
  courseId: string;
  semester: number;
  globalSummary: string;
  learningGaps: string[];
  conceptsCovered: string[];
  lastUpdated: string;
  archived: boolean;
}

// --- Mastery Tracking ---
export interface MasteryRecord {
  id: string;
  userId: string;
  courseId: string;
  conceptId: string;
  topicName: string;
  attempts: number;
  successCount: number;
  consecutiveCorrect: number;
  currentStatus: ReadinessStatus;
  previouslyCorrect: boolean;
  lastAttemptAt: string;
  lastSessionId: string;
}

// --- Flags ---
export type FlagStatus = 'open' | 'resolved';

export interface Flag {
  id: string;
  userId: string;
  userEmail: string;
  courseId: string;
  courseName: string;
  mode: StudyMode;
  question: string;
  aiResponse: string;
  studentDescription: string;
  status: FlagStatus;
  adminNote?: string;
  goldenCorrection?: string;
  createdAt: string;
  resolvedAt?: string;
}

// --- AOCs (Areas of Concentration) ---
export interface AOC {
  id: string;
  courseId: string;
  year: number;
  semester: number;
  topics: string[];
  isCurrentYear: boolean;
  uploadedAt: string;
}

// --- Past Questions ---
export interface PastQuestion {
  id: string;
  courseId: string;
  examYear: number;
  semester: number;
  questionText: string;
  topic: string;
  reoccurrenceCount: number;
  uploadedAt: string;
}

export interface TopicFrequency {
  id: string;
  topicText: string;
  courseId: string;
  yearsAppeared: number[];
  totalAppearances: number;
  lastAppearedYear: number;
}

// --- Document Libraries ---
export type LibraryType = 'cornerstone' | 'course';
export type DocumentStatus = 'processing' | 'flagged' | 'ready' | 'quarantine';

export interface DocumentLibrary {
  id: string;
  name: string;
  department: Department;
  type: LibraryType;
  courseId?: string;
  semester?: number;
}

export interface StudyDocument {
  id: string;
  libraryId: string;
  filename: string;
  storagePath: string;
  status: DocumentStatus;
  flags: string[];
  uploadedAt: string;
  uploadedBy?: string;
  approvedBy?: string;
  aiQualityScore?: number;
  aiConfidence?: number;
  aiSummary?: string;
}

// --- Contributions (crowdsourced uploads) ---
export type ContributionStatus = 'pending' | 'approved' | 'rejected' | 'quarantine';

export interface Contribution {
  id: string;
  uploadedBy: string;
  uploaderEmail: string;
  uploaderRole: UserRole;
  courseId: string;
  courseName: string;
  category: string;
  filename: string;
  storagePath: string;
  status: ContributionStatus;
  aiDetectedCourse?: string;
  aiDetectedCategory?: string;
  aiQualityScore?: number;
  aiConfidence?: number;
  aiSummary?: string;
  adminNote?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

// --- Bookmarks ---
export interface Bookmark {
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  mode: StudyMode;
  responseContent: string;
  savedAt: string;
}

// --- Notifications ---
export type NotificationType = 'welcome' | 'expiry_warning' | 'broadcast';

export interface Notification {
  id: string;
  targetUserId?: string;
  type: NotificationType;
  message: string;
  read: boolean;
  createdAt: string;
}

// --- Material Flags (student requests) ---
export interface MaterialFlag {
  id: string;
  userId: string;
  userEmail: string;
  courseId: string;
  courseName: string;
  description: string;
  status: 'open' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
}

// --- API Types ---
export interface ChatRequest {
  sessionId?: string;
  courseId: string;
  mode: StudyMode;
  message: string;
  courseName: string;
  courseDescription: string;
}

export interface ChatStreamChunk {
  type: 'text' | 'done' | 'error';
  content: string;
}

export interface FlagRequest {
  courseId: string;
  courseName: string;
  mode: StudyMode;
  question: string;
  aiResponse: string;
  studentDescription: string;
}
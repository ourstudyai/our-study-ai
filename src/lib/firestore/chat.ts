// Firestore Chat Service — Sessions & Messages
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { ChatSession, ChatMessage, StudyMode, MessageStatus, FeedbackType } from '@/lib/types';

const SESSIONS_COLLECTION = 'chat_sessions';
const MESSAGES_COLLECTION = 'chat_messages';

// --- Sessions ---

export async function createSession(
  userId: string,
  courseId: string,
  courseName: string,
  mode: StudyMode,
  title: string
): Promise<ChatSession> {
  const sessionData = {
    userId,
    courseId,
    courseName,
    mode,
    title,
    startedAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
    messageCount: 0,
  };

  const docRef = await addDoc(collection(db, SESSIONS_COLLECTION), sessionData);
  return { id: docRef.id, ...sessionData };
}

export async function getSession(sessionId: string): Promise<ChatSession | null> {
  const docRef = doc(db, SESSIONS_COLLECTION, sessionId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as ChatSession;
}

export async function getUserSessions(
  userId: string,
  courseId: string,
  limitCount: number = 20
): Promise<ChatSession[]> {
  const q = query(
    collection(db, SESSIONS_COLLECTION),
    where('userId', '==', userId),
    where('courseId', '==', courseId),
    orderBy('lastMessageAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatSession));
}

export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<void> {
  const docRef = doc(db, SESSIONS_COLLECTION, sessionId);
  await updateDoc(docRef, { title });
}

export async function updateSessionSummary(
  sessionId: string,
  summary: string
): Promise<void> {
  const docRef = doc(db, SESSIONS_COLLECTION, sessionId);
  await updateDoc(docRef, {
    sessionSummary: summary,
    lastMessageAt: new Date().toISOString(),
  });
}

// --- Messages ---

export async function addMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  status: MessageStatus = 'complete'
): Promise<ChatMessage> {
  const messageData = {
    sessionId,
    role,
    content,
    timestamp: new Date().toISOString(),
    status,
    flagged: false,
    feedback: null,
  };

  const docRef = await addDoc(collection(db, MESSAGES_COLLECTION), messageData);

  // Update session message count and last message time
  const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (sessionSnap.exists()) {
    const sessionData = sessionSnap.data();
    await updateDoc(sessionRef, {
      messageCount: (sessionData.messageCount || 0) + 1,
      lastMessageAt: new Date().toISOString(),
    });
  }

  return { id: docRef.id, ...messageData };
}

export async function getSessionMessages(
  sessionId: string
): Promise<ChatMessage[]> {
  const q = query(
    collection(db, MESSAGES_COLLECTION),
    where('sessionId', '==', sessionId),
    orderBy('timestamp', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
}

export async function updateMessageStatus(
  messageId: string,
  status: MessageStatus
): Promise<void> {
  const docRef = doc(db, MESSAGES_COLLECTION, messageId);
  await updateDoc(docRef, { status });
}

export async function updateMessageContent(
  messageId: string,
  content: string
): Promise<void> {
  const docRef = doc(db, MESSAGES_COLLECTION, messageId);
  await updateDoc(docRef, { content, status: 'complete' as MessageStatus });
}

export async function updateMessageFeedback(
  messageId: string,
  feedback: FeedbackType
): Promise<void> {
  const docRef = doc(db, MESSAGES_COLLECTION, messageId);
  await updateDoc(docRef, { feedback });
}

export async function flagMessage(messageId: string): Promise<void> {
  const docRef = doc(db, MESSAGES_COLLECTION, messageId);
  await updateDoc(docRef, { flagged: true });
}

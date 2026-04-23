// src/lib/firebase/messaging.ts
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import app from './config';

export async function requestNotificationPermission(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: await navigator.serviceWorker.register('/firebase-messaging-sw.js'),
    });
    return token;
  } catch (err) {
    console.error('[messaging] Failed to get FCM token:', err);
    return null;
  }
}

export function onForegroundMessage(callback: (payload: any) => void) {
  const messaging = getMessaging(app);
  return onMessage(messaging, callback);
}

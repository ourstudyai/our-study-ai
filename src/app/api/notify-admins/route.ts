export const dynamic = "force-dynamic";

// src/app/api/notify-admins/route.ts
// Sends FCM push notifications to admins based on notification type

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getMessaging } from 'firebase-admin/messaging';

export type NotificationType =
  | 'new_upload'        // → all admins
  | 'admin_action'      // → supreme only
  | 'role_change';      // → supreme only, special

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret');
    if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { type, title, body, data } = await req.json();

    // Get target FCM tokens from Firestore
    let tokens: string[] = [];

    if (type === 'new_upload') {
      // All admins and chief admins
      const snap = await adminDb.collection('users')
        .where('role', 'in', ['admin', 'chief_admin'])
        .get();
      tokens = snap.docs
        .map(d => d.data().fcmToken)
        .filter(Boolean);

      // Also always include supreme
      const supremeSnap = await adminDb.collection('users')
        .where('email', '==', 'ourstudyai@gmail.com')
        .get();
      supremeSnap.docs.forEach(d => {
        const t = d.data().fcmToken;
        if (t && !tokens.includes(t)) tokens.push(t);
      });

    } else {
      // admin_action and role_change → supreme only
      const snap = await adminDb.collection('users')
        .where('email', '==', 'ourstudyai@gmail.com')
        .get();
      tokens = snap.docs.map(d => d.data().fcmToken).filter(Boolean);
    }

    // Always save to admin_notifications for in-app bell panel
    await adminDb.collection('admin_notifications').add({
      type,
      title,
      body,
      data: data ?? {},
      read: false,
      attendedBy: [],
      createdAt: new Date(),
      targetRole: type === 'new_upload' ? 'all_admins' : 'supreme',
    });

    if (!tokens.length) {
      return NextResponse.json({ success: true, sent: 0, reason: 'No tokens registered' });
    }

    // Send FCM push to each token
    const messaging = getMessaging();
    const results = await Promise.allSettled(
      tokens.map(token =>
        messaging.send({
          token,
          notification: { title, body },
          data: data ?? {},
          webpush: {
            notification: {
              title,
              body,
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              requireInteraction: type === 'role_change',
            },
            fcmOptions: { link: type === 'new_upload' ? '/admin' : '/admin?tab=users' },
          },
        })
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return NextResponse.json({ success: true, sent, total: tokens.length });

  } catch (err) {
    console.error('[notify-admins] Error:', err);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}

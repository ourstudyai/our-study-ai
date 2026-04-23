// src/lib/notifications.ts
// Client + server helper to fire admin notifications

export async function notifyAdmins({
  type,
  title,
  body,
  data = {},
}: {
  type: 'new_upload' | 'admin_action' | 'role_change';
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  try {
    await fetch('/api/notify-admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, body, data }),
    });
  } catch (err) {
    console.error('[notifyAdmins] Failed:', err);
  }
}

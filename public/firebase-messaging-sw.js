importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDlGaMqMMtMH5cfQ28XVuF3fABKkws5-H4",
  authDomain: "ourstudyai-cd5ee.firebaseapp.com",
  projectId: "ourstudyai-cd5ee",
  storageBucket: "ourstudyai-cd5ee.firebasestorage.app",
  messagingSenderId: "325989009755",
  appId: "1:325989009755:web:145a1c36d501337057327e",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  self.registration.showNotification(title ?? 'OurStudyAI', {
    body: body ?? 'New item needs review.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data ?? {},
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/admin') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/admin');
    })
  );
});

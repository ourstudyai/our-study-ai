# Our Study AI

> AI-powered academic study platform for Catholic seminary students.

## Quick Start

### Prerequisites
- **Node.js 18+** — [Download here](https://nodejs.org/)
- **Firebase Project** — [Create at Firebase Console](https://console.firebase.google.com/)
- **Google Gemini API Key** — [Get from Google AI Studio](https://aistudio.google.com/apikey)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.local.example .env.local

# 3. Edit .env.local with your credentials
# (See "Environment Setup" below)

# 4. Start dev server
npm run dev

# 5. Open http://localhost:3000
```

## Environment Setup

### Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/) → Create Project
2. Enable **Authentication** → Sign-in providers → **Google**
3. Enable **Firestore Database** → Start in test mode
4. Go to Project Settings → General → Your Apps → **Web App** → Copy config values
5. Go to Project Settings → Service Accounts → **Generate new private key**

### Fill `.env.local`
```env
# Firebase Client (from step 4 above)
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin (from step 5 above)
FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=service@your_project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Gemini AI
GOOGLE_GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL_NAME=gemini-2.5-pro

# Admin
ADMIN_PASSWORD=your_secure_password
```

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── login/              # Google Sign-In
│   ├── onboarding/         # Department + Year selection
│   ├── dashboard/          # Course grid + chat interface
│   ├── admin/              # Flag review panel
│   └── api/                # Server API routes
├── components/
│   ├── auth/               # AuthProvider context
│   ├── chat/               # Chat interface, messages, toolbar
│   └── layout/             # Sidebar, Navbar, MobileMenu
├── hooks/                  # React hooks (useChat)
└── lib/
    ├── firebase/           # Client + Admin SDK
    ├── firestore/          # Firestore service functions
    ├── gemini/             # AI client, privacy wrapper, prompts
    └── types/              # TypeScript interfaces
```

## Features (Phase 1)

- ✅ Google Sign-In authentication
- ✅ Student onboarding (Department + Year)
- ✅ Course grid filtered by dept/year/semester
- ✅ 6 study modes with mode selector
- ✅ Gemini AI chat with **streaming responses** (token-by-token)
- ✅ **4-Section Response Protocol** (Plain Explanation → Precise Definition → How to Write → Watch Out For)
- ✅ Privacy wrapper (strips PII before AI sees it)
- ✅ Flag system (students flag wrong answers)
- ✅ Admin panel with Golden Corrections
- ✅ Auto-retry (3x with exponential backoff)
- ✅ Regenerate / Retry buttons
- ✅ Session history per course
- ✅ Mobile responsive (hamburger menu < 680px)
- ✅ Mastery tracking with regression/recovery rules
- ✅ Semester memory (cross-session AI context)

## Study Modes

| Mode | Purpose |
|------|---------|
| 💡 Plain Explainer | Break down concepts in everyday language |
| ❓ Practice Questions | MCQ quiz from course materials |
| 📝 Exam Preparation | Full formal exam answers + draft review |
| 📊 Progress Check | Student self-assessment with gap analysis |
| 🔬 Research Mode | Deep answers + external academic sources |
| 🎯 Exam Readiness | AI tests student across all topics |

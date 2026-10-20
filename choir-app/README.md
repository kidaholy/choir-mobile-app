# Choir Manager

A comprehensive mobile app for managing church choir teams - programs, members, gospel songs, contributions, and automated member assignments.

## Features

- **Authentication**: Secure login/signup with admin and member roles (Firebase Auth)
- **Program Planning**: Create and manage annual, monthly, weekly, and occasional programs
- **Random Member Assignment**: Fair algorithm that rotates duties to ensure equitable distribution
- **Member Management**: Track members with voice parts, roles, and participation
- **Gospel Songbook**: Organize and search gospel songs
- **Contribution Management**: Track financial contributions and generate reports
- **Program History**: View past assignments and participation statistics

## Setup

### Prerequisites

- Node.js and npm
- Expo CLI
- Firebase account

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Create a project** (or use existing)
3. Give your project a name and follow the prompts
4. Enable Google Analytics if desired (optional)

### 2. Set up Firebase Authentication

1. In Firebase Console, go to **Build → Authentication**
2. Click **Get started**
3. Enable **Email/Password** provider (under "Native providers")
4. Save the changes

### 3. Set up Firestore Database

1. Go to **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (we'll add security rules later)
4. Select a Cloud Firestore location close to you
5. Click **Done**

### 4. Get Firebase Config

1. Go to **Project Settings** (gear icon → Project Settings)
2. Scroll down to "Your apps" section
3. Click **Add app** → **Web** (or iOS/Android - web is easiest for config)
4. Register app with a nickname (e.g., "Choir App")
5. Copy the Firebase config values
6. These will go in your `.env` file

### 5. Configure Environment Variables

1. In the `choir-app` directory, copy `.env.example` to `.env` if not already done
2. Fill in the Firebase config values you just copied:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 6. Set up Firestore Security Rules

1. Go to **Firestore Database → Rules**
2. Replace the default rules with:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Members collection
    match /members/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && 
        (request.auth.uid == userId || 
         get(/databases/$(database)/documents/members/$(request.auth.uid)).data.is_admin == true);
      allow delete: if request.auth != null && 
        get(/databases/$(database)/documents/members/$(request.auth.uid)).data.is_admin == true;
    }
    
    // Programs collection
    match /programs/{programId} {
      allow read: if request.auth != null;
      allow write, delete: if request.auth != null && 
        get(/databases/$(database)/documents/members/$(request.auth.uid)).data.is_admin == true;
    }
    
    // Program assignments collection
    match /programAssignments/{assignmentId} {
      allow read: if request.auth != null;
      allow write, delete: if request.auth != null && 
        get(/databases/$(database)/documents/members/$(request.auth.uid)).data.is_admin == true;
    }
    
    // Roles collection
    match /roles/{roleId} {
      allow read: if request.auth != null;
      allow write, delete: if request.auth != null && 
        get(/databases/$(database)/documents/members/$(request.auth.uid)).data.is_admin == true;
    }
    
    // Songs collection
    match /songs/{songId} {
      allow read: if request.auth != null;
      allow write, delete: if request.auth != null;
    }
    
    // Contributions collection
    match /contributions/{contributionId} {
      allow read: if request.auth != null;
      allow write, delete: if request.auth != null && 
        get(/databases/$(database)/documents/members/$(request.auth.uid)).data.is_admin == true;
    }
  }
}
```

3. Click **Publish**

### 7. Install Dependencies & Run

```bash
cd choir-app
npm install
npx expo start
```

## Making yourself an Admin

When you first sign up, your account is created as a regular member (not admin). To make yourself an admin:

1. Sign up in the app
2. Go to Firebase Console → **Firestore Database → members** collection
3. Find your user document (matches your UID)
4. Click to edit it
5. Change `is_admin` from `false` to `true`
6. Save

## Running Tests

```bash
npx tsx --test tests/assignment.test.ts
```

## License

MIT

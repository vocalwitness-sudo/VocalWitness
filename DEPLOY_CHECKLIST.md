# VocalWitness Deployment Checklist

## Pre-Deploy Checks (Must Do Every Time)

### 1. Code & Syntax Check
- [ ] No JavaScript errors in console (`Ctrl + Shift + R` hard refresh)
- [ ] All buttons are clickable and working (Photo, Voice, Profile, Feed tabs)
- [ ] `js/main.js`, `js/feed.js`, `js/media.js`, `js/auth.js` are clean
- [ ] No duplicate imports or `Identifier already declared` errors

### 2. Firebase Rules Check (Security)
- [ ] Rules are updated in **Firebase Console** (not just GitHub file)
- [ ] Testimonies are publicly readable
- [ ] Only authenticated users can create posts
- [ ] Users can only edit their own data

**Current Secure Rules** (copy to Firebase Console):
```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isOwner(uid) { return isSignedIn() && request.auth.uid == uid; }

    match /users/{userId} {
      allow read, create, update: if isOwner(userId);
    }

    match /testimonies/{postId} {
      allow read: if true;
      allow create: if isSignedIn();
      allow update, delete: if isOwner(resource.data.authorId);
    }

    match /testimonies/{postId}/votes/{voteId} {
      allow read: if true;
      allow create: if isSignedIn();
    }
  }
}

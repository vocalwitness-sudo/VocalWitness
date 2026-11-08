# VocalWitness — Production Deployment Checklist
**Version:** 2.0 · Last updated: 2026-11-08  
**Goal:** Zero-surprise, auditable, production-safe deploys

> Never deploy from memory. Tick every box.

---

## 0. Pre-Flight (Do Once Per Session)

- [ ] You are on the `main` branch and it is clean (`git status`)
- [ ] Latest `main` pulled
- [ ] No `.env`, service account keys, or secrets in the working tree
- [ ] You understand the difference between **application-level sealing** and a public blockchain

---

## 1. Code Health

- [ ] Hard refresh test on https://vocalwitness.com and https://vocalwitness-3affa.web.app
- [ ] Browser console shows zero critical errors
- [ ] Core flows work: anonymous post, signed-in post, photo/voice upload, Evidence Pack download, verify page
- [ ] No duplicate module / identifier errors
- [ ] `js/media-pipeline.js` and `js/upload.js` produce consistent SHA-256 of the **final uploaded bytes**

---

## 2. Security Rules (Critical)

- [ ] `firestore.rules` and `storage.rules` in the repo are the **source of truth**
- [ ] Rules have been deployed to the live project (`vocalwitness-3affa`)
- [ ] Confirmed in Firebase Console that the live rules match the repo (do **not** paste the old weak sample rules)
- [ ] Key invariants verified:
  - Sealed core fields (hashes, media URLs, authorId, createdAt, evidencePack, etc.) cannot be changed by ordinary users
  - Authors may only soft-hide or edit text inside the 30-minute correction window
  - Hard delete of sealed evidence is forbidden for owners
  - User tier / phone / admin / reputation fields are server-controlled only

**Command (preferred):**
```bash
firebase deploy --only firestore:rules,storage --project vocalwitness-3affa

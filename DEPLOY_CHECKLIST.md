# VocalWitness — Production Deployment Checklist
**Version:** 2.0 · 2026-11-08  
**Project:** vocalwitness-3affa

> Tick every box. Never deploy from memory.

---

## 0. Pre-Flight

- [ ] On `main`, working tree clean
- [ ] Latest `main` pulled
- [ ] No `.env`, service-account keys, or secrets in the repo
- [ ] You understand this is application-level sealing + OpenTimestamps (not a public blockchain)

---

## 1. Code Health

- [ ] Hard refresh on https://vocalwitness.com and https://vocalwitness-3affa.web.app
- [ ] Zero critical console errors
- [ ] Core flows work: post (text/voice/photo), Evidence Pack download, verify page
- [ ] Media pipeline hashes the **final uploaded bytes** consistently

---

## 2. Security Rules (Critical)

- [ ] `firestore.rules` and `storage.rules` in the repo are the source of truth
- [ ] Rules deployed to live project
- [ ] Live rules in Firebase Console match the repo (do **not** use any old weak sample rules)
- [ ] Invariants confirmed:
  - Sealed core fields cannot be changed by ordinary users
  - Authors may only soft-hide or edit text inside the 30-minute window
  - Hard delete of sealed evidence is forbidden for owners
  - Tier / phone / admin / reputation fields are server-controlled
     
  - ## Batch 1 Integrity Gate
- [ ] All media hashes are of final uploaded bytes (media-pipeline is the only path)
- [ ] integrity-core + media-integrity tests pass in CI
- [ ] Rules unit tests pass on emulator
- [ ] App Check required on submitTestimonySecure, confirmPhoneVerification, getUploadUrl
- [ ] Daily anchor ran successfully in last 24 h (check ledger_roots)
- [ ] No client code can write tier / phoneVerified / zkVerified

## Batch 2 – Operational Notes

### Recommended Function settings (African mobile reality)
- submitTestimonySecure: memory 512MiB, timeout 60s, maxInstances 20–40
- getUploadUrl / media upload path: timeout 60–120s
- dailyIntegrityHealth + dailyAnchor: 512MiB, timeout 300s

### Chaos / resilience checks (manual or future automated)
- [ ] Upload with 2G/3G throttling (Chrome DevTools)
- [ ] Concurrent submissions (5–10 tabs)
- [ ] Phone verification spike simulation
- [ ] Confirm Evidence Pack still downloads after force-refresh
- [ ] Confirm pendingMedia does not grow unbounded

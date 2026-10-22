# VocalWitness

**Your Voice. Your Truth. Protected.**

Privacy-first public square for sealed citizen reports and evidence.

- Live: https://vocalwitness.com  
- Also: https://www.vocalwitness.com · https://vocalwitness-3affa.web.app  
- Africa-first (Nigeria → continent → world)

## What it does

- First-hand reports: text, live voice, photo, video  
- Client-side SHA-256 hashing + EXIF scrubbing before upload  
- Evidence Packs anyone can verify (online or offline)  
- Trust tiers: Citizen → Circle → Witness  
- Application-level sealing: ordinary users cannot hard-delete or rewrite sealed cores  
- Soft-hide only (author / moderator); record and hashes remain

## Tech stack

- Frontend: vanilla JS modules, Tailwind  
- Backend: Firebase (Auth, Firestore, Functions)  
- Media: Cloudflare R2  
- Crypto: Web Crypto; optional Circom / snarkjs (ZK evolving)  
- External time: OpenTimestamps (daily Merkle roots)

## Status

Public deployment in progress. Core report + verify flows are live.

## License

All rights reserved © 2026 VocalWitness.  
Source is visible for transparency and auditability.  
Commercial use, redistribution, and derivative works require explicit written permission.

## Important notes

- Integrity ≠ truth: hashes prove bits did not change after sealing; they do not prove real-world events.  
- Immutability is application-level (Firestore rules + client hashes + audit), not a public blockchain.

## Contact / support

[Add your email, X, or support form]

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

admin@vocalwitness.com

## Device & Browser Compatibility

VocalWitness is engineered to support both modern and legacy hardware (tested across modern smartphones, laptops, legacy Android devices, and older iOS WebKit engines):

- **Modern Browsers (Chrome, Firefox, Safari, Edge):** Full ES Modules, Web Crypto API, client-side SHA-256 hashing, ZK proofs, and live WebSocket/Firestore real-time streams.
- **Legacy Browsers & Older Phones:** Automatic fallback handling. If advanced crypto or modern module features fail, the app falls back to basic form submission, standard server-authenticated routes, and safe error-bound states instead of hitting a blank white screen.
- **Low-Bandwidth Optimization:** Compressed asset delivery, optional media re-attachment for offline drafts, and lightweight payload serialization.

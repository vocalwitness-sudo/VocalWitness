Markdown


# VocalWitness Integrity Invariants (Batch 1 – Canonical)

These rules must never be broken. Any PR that weakens them is rejected.

## Core Promise
- Once a report is sealed, ordinary users (including the author) cannot change media URLs, hashes, authorId, createdAt, evidencePack, or packCoreHash.
- Text may be edited only within a 30-minute correction window.
- Soft-hide (author_hidden) is allowed; hard delete of sealed evidence is forbidden for owners.
- Media is hashed **after** all client-side processing (scrub + normalize + compress). The hash that is stored is the hash of the **exact bytes that were uploaded**.

## Application-level vs Public Anchoring
- **Application-level seal**: Firestore rules + client SHA-256 + Evidence Pack. This is the primary protection.
- **Public anchoring**: Daily Merkle root of sealed hashes → OpenTimestamps calendar. This proves the set of hashes existed on that day without trusting Firebase.
- OpenTimestamps does **not** make the individual report a blockchain transaction. It timestamps the daily root.

## Phone / Claims
- Phone verification and tier elevation are **server-only** (custom claims + users/{uid} writes from Cloud Functions).
- Client code may never set `tier`, `isPhoneVerified`, `zkVerified`, `admin`, `moderator`, etc.

## Media
- Image: always scrub EXIF by default.
- Audio: normalize by default for anonymous / privacy mode.
- Video: structural validation only (no rewrite of bytes).
- Hash is always of the final File/Blob that is sent to R2.

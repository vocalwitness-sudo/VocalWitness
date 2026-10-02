# VocalWitness Verification Guide for Journalists & Investigators

How to independently verify a sealed report downloaded from VocalWitness:
1. **Extract Evidence Pack:** Unzip the downloaded `.vwpack` package. It contains `evidence.json`, original media hash, and metadata.
2. **Compute Independent SHA-256:** Run `sha256sum media.mp4` or your local cryptographic tool against the media file.
3. **Compare Hashes:** Ensure the resulting hash string precisely matches the `mediaHash` property inside `evidence.json`.
4. **Inspect Transparency Ledger:** Cross-reference the report's Merkle inclusion proof against the public anchor root published on our Transparency dashboard.

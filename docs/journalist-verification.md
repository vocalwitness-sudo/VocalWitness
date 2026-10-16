# VocalWitness — Independent Verification Guide for Journalists & Investigators

VocalWitness only proves **integrity** (the bits have not changed since sealing).  
It does **not** prove that the real-world event occurred.

Anyone can verify without an account.

---

## Quick verification (recommended)

1. Open the shared link or QR code → it goes to `/verify.html?id=…&h=…`
2. Or download the **Evidence Pack** (JSON) from the report.
3. Use the online verifier at [vocalwitness.com/verify](https://vocalwitness.com/verify):
   - **Ledger link** tab → paste ID + hash
   - **JSON proof** tab → paste the full Evidence Pack
   - **Media** tab → drop the original file (checks hash / C2PA if present)

---

## Offline / command-line verification

1. Download the Evidence Pack (JSON) and the original media file.
2. Open the JSON and note the `mediaHash` (or `hashAfterUpload`) and `bodyHash` values.
3. Compute the SHA-256 of the media file on your own machine:

   ```bash
   # Linux / macOS
   sha256sum your-media-file.mp4

   # Windows
   certutil -hashfile your-media-file.mp4 SHA256

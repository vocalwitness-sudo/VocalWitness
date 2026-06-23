# VocalWitness Deployment Checklist

### 1. Circuit & Logic Check (The Vault)
- [ ] Have I modified any files in the `js/` folder?
- [ ] If I changed `witness.circom`, have I re-compiled and verified the output locally?

### 2. Security Rule Check (The Firewall)
- [ ] Open `firestore.rules`. Are the rules still set to block unauthorized writes?
- [ ] Have I tested a "negative" case (e.g., trying to write to the database without being logged in) to make sure it fails?

### 3. Verification Check (The Core)
- [ ] Open the site in a browser window.
- [ ] Run a test witness generation. Does the ZK proof generate successfully?
- [ ] Does the `console` show any errors or warnings?

### 4. Final Deploy
- [ ] Save all files.
- [ ] Run `firebase deploy`.
- [ ] Verify the live site by performing one final test upload.

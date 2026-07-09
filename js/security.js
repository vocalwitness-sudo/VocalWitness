// 3. Lock the Private Key (Encrypt)
import { db, auth } from './firebase-config.js';   // Correct relative path

async function encryptKey(privateKey, masterLock) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Unique vector for every lock
    const encodedKey = new TextEncoder().encode(privateKey);
    
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        masterLock,
        encodedKey
    );

    // Return both the IV and the encrypted data (you need both to unlock it later!)
    return { iv, encrypted };
}

// 4. Unlock the Private Key (Decrypt)
async function decryptKey(encryptedData, iv, masterLock) {
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        masterLock,
        encryptedData
    );
    
    return new TextDecoder().decode(decrypted);
}

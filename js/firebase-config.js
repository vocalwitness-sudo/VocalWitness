import { initializeFirestore, memoryLocalCache } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// Replace `export const db = getFirestore(app);` with this:
export const db = initializeFirestore(app, {
    localCache: memoryLocalCache()
});

// Install/import idb if using a bundler, or use a CDN script
import { openDB } from 'https://unpkg.com/idb?module';

export const dbPromise = openDB('VocalWitnessDB', 1, {
  upgrade(db) {
    db.createObjectStore('offline-posts', { keyPath: 'id', autoIncrement: true });
  },
});

import { enableIndexedDbPersistence } from "firebase/firestore";
// Call this before your first read/write
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn("Multiple tabs open, persistence disabled.");
    } else if (err.code == 'unimplemented') {
        console.warn("Browser doesn't support persistence.");
    }
});

// js/db.js
import { db } from './firebase-init.js'; // or wherever you init Firestore

export const updateUserProfile = async (userId, updates) => {
  // 60-day name change logic here
};

export const getUserPosts = (userId) => { ... };
export const pinPost = async (...) => { ... };
export const deletePost = async (...) => { ... };

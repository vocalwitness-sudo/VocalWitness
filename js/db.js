// Install/import idb if using a bundler, or use a CDN script
import { openDB } from 'https://unpkg.com/idb?module';

export const dbPromise = openDB('VocalWitnessDB', 1, {
  upgrade(db) {
    db.createObjectStore('offline-posts', { keyPath: 'id', autoIncrement: true });
  },
});

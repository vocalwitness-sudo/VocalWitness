// js/main.js - Clean Starter
import { db, auth } from './firebase-config.js';

console.log("✅ VocalWitness App Started");

// Simple test post
document.getElementById('postButton').addEventListener('click', async () => {
    const input = document.getElementById('mainInput');
    const text = input.value.trim();
    
    if (!text) {
        alert("Please write something");
        return;
    }
    
    try {
        // TODO: Add real Firestore logic later
        console.log("Publishing:", text);
        alert("✅ Testimony published (test)");
        input.value = '';
    } catch (e) {
        console.error(e);
        alert("Error publishing");
    }
});

// Initialize Firebase when ready
document.addEventListener('DOMContentLoaded', () => {
    console.log("Firebase ready:", !!db);
});

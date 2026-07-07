// js/main.js
import { db, auth } from './firebase-config.js';

console.log("✅ VocalWitness - Main script loaded");

document.addEventListener('DOMContentLoaded', () => {
    const postBtn = document.getElementById('postButton');
    const input = document.getElementById('mainInput');
    
    postBtn.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) return alert("Write something first");
        
        alert("✅ Testimony published (basic test)");
        input.value = '';
    });
    
    console.log("Firebase DB:", db ? "Connected" : "Not connected");
});

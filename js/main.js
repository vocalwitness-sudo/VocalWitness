// js/main.js - DEBUG VERSION (Click Test)
console.log("✅ main.js loaded successfully");

document.addEventListener('DOMContentLoaded', () => {
    console.log("✅ DOM fully loaded");

    // Global click listener for debugging
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn) {
            console.log("🖱️ BUTTON CLICKED → ID:", btn.id, "| Text:", btn.textContent.trim());
            alert("Button clicked: " + (btn.id || btn.textContent.trim()));   // Visual confirmation
        }
    });

    console.log("✅ Global click listener attached");
});

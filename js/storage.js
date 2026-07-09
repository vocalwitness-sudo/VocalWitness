// js/storage.js - Advanced Reactive Global State
import { getTier, calculateTrustScore } from './utils.js';
import { db, auth } from './firebase-config.js';   // Correct relative path

export const state = {
    user: null,
    isWitnessVerified: false,
    tier: 'citizen',
    tierInfo: null,
    language: 'en',
    trustScore: 50,
    postCount: 0,
    isOnline: true
};

// Reactive Update Helper
export function updateState(newData) {
    Object.assign(state, newData);
    
    // Broadcast change to all modules
    window.dispatchEvent(new CustomEvent('state-changed', {
        detail: { state }
    }));
}

// Main User Update Function (called from auth.js)
export function updateUser(user) {
    if (!user) {
        updateState({
            user: null,
            isWitnessVerified: false,
            tier: 'citizen',
            tierInfo: null,
            trustScore: 50
        });
        return;
    }

    const trustScore = user.trustCircle || calculateTrustScore(user);
    const tierInfo = getTier(trustScore);

    updateState({
        user: user,
        isWitnessVerified: user.role === 'witness' || user.role === 'trusted_witness' || !!user.isPhoneVerified,
        tier: tierInfo.name.toLowerCase(),
        tierInfo: tierInfo,
        trustScore: trustScore,
        language: user.preferredLanguage || 'en'
    });

    console.log(`👤 User updated → ${tierInfo.name} Tier (${trustScore} trust)`);
}

// Increment post count after successful post
export function incrementPostCount() {
    state.postCount = (state.postCount || 0) + 1;
    updateState({ postCount: state.postCount });
}

// Update trust score (called after verification, votes, etc.)
export function updateTrustScore(newScore) {
    updateState({
        trustScore: Math.max(0, Math.min(100, newScore))
    });
}

// Persist state to localStorage (optional backup)
export function saveStateToLocal() {
    try {
        localStorage.setItem('vocalwitness_state', JSON.stringify({
            language: state.language,
            postCount: state.postCount
        }));
    } catch (e) {
        console.warn("Failed to save state locally");
    }
}

export function loadStateFromLocal() {
    try {
        const saved = localStorage.getItem('vocalwitness_state');
        if (saved) {
            const data = JSON.parse(saved);
            updateState({
                language: data.language || 'en',
                postCount: data.postCount || 0
            });
        }
    } catch (e) {
        console.warn("Failed to load saved state");
    }
}

// Listen for online/offline status
export function initNetworkListener() {
    window.addEventListener('online', () => updateState({ isOnline: true }));
    window.addEventListener('offline', () => updateState({ isOnline: false }));
}

// Initialize storage module
export function initStorage() {
    loadStateFromLocal();
    initNetworkListener();
    console.log("📦 Global State Initialized");
}

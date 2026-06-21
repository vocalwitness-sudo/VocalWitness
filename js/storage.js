// js/storage.js - Reactive Global State
export const state = {
    user: null,
    isWitnessVerified: false,
    tier: 'citizen',
    language: 'en',
    trustScore: 50,
    postCount: 0
};

// Reactive Update Helper
export function updateState(newData) {
    Object.assign(state, newData);
    
    // Broadcast change to all listeners (useful for profile, feed, etc.)
    window.dispatchEvent(new CustomEvent('state-changed', {
        detail: { state }
    }));
}

// Specific helper for user login/logout
export function updateUser(user) {
    updateState({
        user: user,
        isWitnessVerified: !!user?.emailVerified || false,
        tier: user ? (user.role || 'witness') : 'citizen',
        trustScore: user?.trustCircle || 50
    });
}

// Helper to increment post count
export function incrementPostCount() {
    state.postCount = (state.postCount || 0) + 1;
    updateState({ postCount: state.postCount });
}

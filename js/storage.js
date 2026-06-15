// js/storage.js - Reactive State
export const state = {
    user: null,
    isWitnessVerified: false,
    tier: 'citizen',
    language: 'en'
};

// Reactive Update Helper
export function updateState(newData) {
    Object.assign(state, newData);

    // Broadcast change to all listeners
    window.dispatchEvent(new CustomEvent('state-changed', { 
        detail: { state } 
    }));
}

// Specific helper for user
export function updateUser(user) {
    updateState({
        user: user,
        isWitnessVerified: !!user,
        tier: user ? 'witness' : 'citizen'
    });
}

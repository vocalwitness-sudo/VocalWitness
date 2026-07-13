// js/app-state.js - Central State Manager for Living Square
export let AppState = {
    currentTab: 'square',
    currentMode: 'citizen',     // 'citizen' or 'witness'
    userTier: 'NONE',           // NONE, CITIZEN, WITNESS
    isAuthenticated: false,
    currentUser: null
};

export function updateAppState(changes) {
    Object.assign(AppState, changes);
    
    // Persist to localStorage (optional but useful)
    try {
        localStorage.setItem('vw_app_state', JSON.stringify(AppState));
    } catch (e) {}

    // Notify all listeners
    window.dispatchEvent(new CustomEvent('appStateChanged', { 
        detail: { ...AppState } 
    }));
}

export function loadSavedState() {
    try {
        const saved = localStorage.getItem('vw_app_state');
        if (saved) {
            Object.assign(AppState, JSON.parse(saved));
        }
    } catch (e) {}
}

// Helper for quick checks
export function isWitnessMode() {
    return AppState.currentMode === 'witness' && AppState.userTier === 'WITNESS';
}

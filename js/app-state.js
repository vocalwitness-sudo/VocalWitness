// js/app-state.js - Central State Manager for Living Square

export let AppState = {
    currentTab: 'square',
    currentMode: 'citizen',     // 'citizen' or 'witness'
    userTier: 'NONE',           // 'NONE', 'CITIZEN', 'WITNESS'
    isAuthenticated: false,
    currentUser: null
};

/**
 * Updates application state, persists serializable data to localStorage,
 * and notifies all listeners across the application via CustomEvent.
 * @param {Object} changes - Key-value pairs to update in AppState
 */
export function updateAppState(changes) {
    Object.assign(AppState, changes);
    
    // Persist serializable subset (prevents circular JSON errors from Firebase Auth)
    try {
        const stateToSave = {
            currentTab: AppState.currentTab,
            currentMode: AppState.currentMode,
            userTier: AppState.userTier,
            isAuthenticated: AppState.isAuthenticated,
            currentUser: AppState.currentUser ? {
                uid: AppState.currentUser.uid,
                displayName: AppState.currentUser.displayName,
                email: AppState.currentUser.email,
                photoURL: AppState.currentUser.photoURL
            } : null
        };
        localStorage.setItem('vw_app_state', JSON.stringify(stateToSave));
    } catch (e) {
        console.warn('Could not persist AppState to localStorage:', e);
    }

    // Notify all UI components
    window.dispatchEvent(new CustomEvent('appStateChanged', { 
        detail: { ...AppState } 
    }));
}

/**
 * Rehydrates state from localStorage on application bootstrap
 * and triggers event dispatch to align visual UI.
 */
export function loadSavedState() {
    try {
        const saved = localStorage.getItem('vw_app_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            
            // Mutate in-place to preserve object reference bindings
            Object.assign(AppState, {
                currentTab: parsed.currentTab || 'square',
                currentMode: parsed.currentMode || 'citizen',
                userTier: parsed.userTier || 'NONE',
                isAuthenticated: !!parsed.isAuthenticated,
                currentUser: parsed.currentUser || null
            });

            // Dispatch event so UI components sync instantly on load
            window.dispatchEvent(new CustomEvent('appStateChanged', { 
                detail: { ...AppState } 
            }));
        }
    } catch (e) {
        console.warn('Could not load saved AppState:', e);
    }
}

// --- HELPER QUERY FUNCTIONS ---

export function isWitnessMode() {
    return AppState.currentMode === 'witness' && 
           (AppState.userTier === 'WITNESS' || AppState.userTier === 'CITIZEN');
}

export function isUserAuthenticated() {
    return AppState.isAuthenticated && AppState.currentUser !== null;
}

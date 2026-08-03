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
    
    // Safely persist serializable subset to localStorage
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

    // Dispatch event so UI components react instantly
    window.dispatchEvent(new CustomEvent('appStateChanged', { 
        detail: { ...AppState } 
    }));
}

export function loadSavedState() {
    try {
        const saved = localStorage.getItem('vw_app_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            
            // Mutate in-place to preserve object references
            Object.assign(AppState, {
                currentTab: parsed.currentTab || 'square',
                currentMode: parsed.currentMode || 'citizen',
                userTier: parsed.userTier || 'NONE',
                isAuthenticated: !!parsed.isAuthenticated,
                currentUser: parsed.currentUser || null
            });

            // Notify UI on initial state hydration
            window.dispatchEvent(new CustomEvent('appStateChanged', { 
                detail: { ...AppState } 
            }));
        }
    } catch (e) {
        console.warn('Could not load saved AppState:', e);
    }
}

// Helper query functions
export function isWitnessMode() {
    return AppState.currentMode === 'witness' && (AppState.userTier === 'WITNESS' || AppState.userTier === 'CITIZEN');
}

export function isUserAuthenticated() {
    return AppState.isAuthenticated && AppState.currentUser !== null;
}

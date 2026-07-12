// js/door-system.js
import { auth, db } from './firebase-config.js';
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getUserDoors } from './tier.js';

export async function canAccessDoor(door) {
    const doors = await getUserDoors();
    return doors.includes(door);
}

export async function getCurrentDoor() {
    if (!auth.currentUser) return 'public_square';
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    return snap.data()?.currentVisibilityDoor || 'public_square';
}

// Filter feed based on user's current door
export function filterPostsByDoor(posts, userDoor) {
    return posts.filter(post => {
        const postDoor = post.visibilityDoor || 'public_square';
        const doorLevels = {
            'public_square': 1,
            'citizen_circle': 2,
            'witness_circle': 3
        };
        return doorLevels[postDoor] <= doorLevels[userDoor];
    });
}

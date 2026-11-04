// js/search.js - VocalWitness Global Search Engine

import { db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  getDocs,
  limit
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

import { showToast } from './utils.js';

/**
 * Execute unified search across Testimonies, Groups, and Live Arena Rooms
 */
export async function executeGlobalSearch(searchTerm) {
  const term = (searchTerm || '').trim().toLowerCase();
  if (!term || term.length < 2) {
    showToast('Enter at least 2 characters to search', 'warning');
    return { testimonies: [], groups: [], liveRooms: [] };
  }

  try {
    // 1. Search Groups
    const groupsQuery = query(
      collection(db, 'groups'),
      limit(20)
    );
    const groupsSnap = await getDocs(groupsQuery);
    const groups = groupsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(g =>
        (g.name || '').toLowerCase().includes(term) ||
        (g.description || '').toLowerCase().includes(term)
      );

    // 2. Search Live Arena Rooms
    const arenaQuery = query(
      collection(db, 'liveRooms'),
      where('isLive', '==', true),
      limit(20)
    );
    const arenaSnap = await getDocs(arenaQuery);
    const liveRooms = arenaSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r =>
        (r.title || '').toLowerCase().includes(term) ||
        (r.category || '').toLowerCase().includes(term)
      );

    // 3. Search Public Testimonies
    const testimoniesQuery = query(
      collection(db, 'testimonies'),
      limit(30)
    );
    const testimoniesSnap = await getDocs(testimoniesQuery);
    const testimonies = testimoniesSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t =>
        (t.content || t.text || '').toLowerCase().includes(term) ||
        (t.title || '').toLowerCase().includes(term)
      );

    return { testimonies, groups, liveRooms };
  } catch (err) {
    console.error('Global search error:', err);
    showToast('Failed to complete search', 'error');
    return { testimonies: [], groups: [], liveRooms: [] };
  }
}

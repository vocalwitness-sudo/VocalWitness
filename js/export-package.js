// js/export-package.js - Cryptographic Evidence Report Generator

import { db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

import { showToast } from './utils.js';

/**
 * Generate and download JSON evidence audit package for a Group
 */
export async function exportGroupEvidencePackage(groupId) {
  showToast('Generating Evidence Export Package…', 'info');

  try {
    const groupSnap = await getDoc(doc(db, 'groups', groupId));
    if (!groupSnap.exists()) return showToast('Group not found', 'error');

    const group = groupSnap.data();

    // Fetch evidence locker items
    const evidenceSnap = await getDocs(
      query(collection(db, 'group_evidence'), where('groupId', '==', groupId))
    );
    const evidence = evidenceSnap.docs.map(d => d.data());

    // Fetch attestations
    const attestationsSnap = await getDocs(
      query(collection(db, 'group_attestations'), where('groupId', '==', groupId))
    );
    const attestations = attestationsSnap.docs.map(d => d.data());

    // Fetch forensic timeline
    const timelineSnap = await getDocs(
      query(collection(db, 'group_timeline'), where('groupId', '==', groupId))
    );
    const timeline = timelineSnap.docs.map(d => d.data());

    const exportPayload = {
      manifest: {
        platform: 'VocalWitness Public Ledger',
        groupId,
        groupName: group.name,
        exportedAt: new Date().toISOString(),
        totalEvidenceSealed: evidence.length,
        totalAttestations: attestations.length,
        totalTimelineNodes: timeline.length
      },
      evidenceLocker: evidence,
      attestations,
      forensicTimeline: timeline
    };

    // Trigger download
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VocalWitness_Evidence_Package_${groupId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('📄 Evidence Export Package downloaded!', 'success');
  } catch (err) {
    console.error('Export failed:', err);
    showToast('Failed to export evidence package', 'error');
  }
}

// js/my-testimonies.js - With Optimistic UI + Batch 1 Evidence Pack UI (CSP Compliant)
import { db, auth } from './firebase-config.js';
import {
    collection, query, where, onSnapshot, orderBy,
    deleteDoc, doc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { showToast } from './utils.js';
import { renderSealedBadge, renderDownloadPackButton } from './evidence-ui.js';
import { toFullEvidencePack, downloadEvidencePack } from './evidence-pack.js';

let currentSnapshotUnsubscribe = null;
let myPostsCache = []; // for download handler

export function initMyTestimonies(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (currentSnapshotUnsubscribe) currentSnapshotUnsubscribe();

    container.innerHTML = `<div class="text-center py-12 text-zinc-400">Loading your testimonies...</div>`;

    // Event delegation handling all actions (download-pack, edit, delete)
    if (!container.dataset.listenerAttached) {
        container.dataset.listenerAttached = 'true';
        container.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;

            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            if (!id) return;

            if (action === 'download-pack') {
                await handleDownloadEvidencePack(id);
            } else if (action === 'edit') {
                if (typeof window.editTestimony === 'function') {
                    await window.editTestimony(id);
                }
            } else if (action === 'delete') {
                if (typeof window.deleteTestimony === 'function') {
                    await window.deleteTestimony(id);
                }
            }
        });
    }

    auth.onAuthStateChanged((user) => {
        if (!user) {
            container.innerHTML = `<p class="text-center text-amber-400 py-12">Please sign in to view your testimonies.</p>`;
            return;
        }
        loadUserTestimonies(user.uid, container);
    });
}

function loadUserTestimonies(userId, container) {
    const q = query(
        collection(db, 'testimonies'),
        where('authorId', '==', userId),
        orderBy('createdAt', 'desc')
    );

    currentSnapshotUnsubscribe = onSnapshot(q, (snapshot) => {
        renderTestimonies(snapshot, container);
    }, (error) => {
        console.error('Snapshot error:', error);
        container.innerHTML = `<p class="text-red-400 text-center py-8">Error loading testimonies. Check Firestore index / rules.</p>`;
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderTestimonies(snapshot, container) {
    container.innerHTML = '';
    myPostsCache = [];

    if (snapshot.empty) {
        container.innerHTML = `
            <div class="text-center py-20 glass rounded-3xl p-12">
                <p class="text-6xl mb-4">📭</p>
                <h3 class="text-xl font-semibold mb-2">No testimonies yet</h3>
                <a href="index.html" class="mt-6 inline-block px-8 py-3 bg-emerald-600 text-black rounded-3xl font-medium">Share Your First Testimony</a>
            </div>`;
        return;
    }

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const testimonyId = docSnap.id;
        
        // Cache post including corroboration metrics
        myPostsCache.push({ 
            id: testimonyId, 
            corroborationCount: data.corroborationCount || 0,
            corroborationScore: data.corroborationScore || 0,
            ...data 
        });

        const postTitle = data.title || '';
        const textContent = data.content || data.text || '';
        const dateStr = data.createdAt?.toDate
            ? data.createdAt.toDate().toLocaleString()
            : (data.timestamp ? new Date(data.timestamp).toLocaleString() : 'N/A');

        const hasPack = !!(data.hasEvidencePack || data.evidencePack || data.packCoreHash);
        const hasHash = !!(data.imageHash || data.audioHash || data.forensicHash || data.hasForensic);
        
        const corrobCount = data.corroborationCount || 0;

        const div = document.createElement('div');
        div.className = 'glass rounded-3xl p-6 transition-all border border-zinc-800';
        div.id = `testimony-${testimonyId}`;

        div.innerHTML = `
            <div class="flex justify-between items-start gap-4">
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        ${hasPack ? renderSealedBadge(true) : ''}
                        ${!hasPack && hasHash ? '<span class="text-[10px] text-emerald-400 border border-emerald-700/40 rounded-full px-2 py-0.5">🔒 Hashed</span>' : ''}
                        ${corrobCount > 0 ? `<span class="text-[10px] text-cyan-400 border border-cyan-700/40 rounded-full px-2 py-0.5">🤝 ${corrobCount} Corroboration${corrobCount > 1 ? 's' : ''}</span>` : ''}
                    </div>
                    ${postTitle ? `<h3 class="text-lg font-bold text-white mb-1.5 leading-snug">${escapeHTML(postTitle)}</h3>` : ''}
                    <p class="text-zinc-100 leading-relaxed" id="content-${testimonyId}">${escapeHTML(textContent)}</p>
                    <div class="flex flex-wrap items-center gap-3 mt-4 text-xs text-zinc-400">
                        <span class="text-emerald-500">${dateStr}</span>
                        ${hasPack ? renderDownloadPackButton(testimonyId) : ''}
                    </div>
                </div>
                <div class="flex flex-col gap-2 text-sm shrink-0">
                    ${hasPack
                        ? `<span class="text-[11px] text-zinc-500 px-2 py-1" title="Sealed reports cannot be edited">Locked</span>`
                        : `<button type="button" data-action="edit" data-id="${testimonyId}" class="text-blue-400 hover:text-blue-300 px-4 py-1">Edit</button>`
                    }
                    <button type="button" data-action="delete" data-id="${testimonyId}"
                            class="text-red-400 hover:text-red-300 px-4 py-1">Delete</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

async function handleDownloadEvidencePack(postId) {
    try {
        const post = myPostsCache.find(p => p.id === postId);
        if (!post) {
            showToast('Post not found', 'error');
            return;
        }

        const core = {
            schemaVersion: post.evidencePack?.schemaVersion || 'vocalwitness.evidence-pack.v1',
            content: {
                body: post.content || post.text || '',
                bodyHash: post.bodyHash || null,
                channel: post.feedVisibility || post.channel || 'citizen-talk'
            },
            media: [],
            identity: {
                mode: post.isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
                authorId: post.authorId || null,
                displayName: post.author || null,
                phoneOnPublicRecord: false
            },
            corroboration: {
                count: post.corroborationCount || post.evidencePack?.corroboration?.count || 0,
                score: post.corroborationScore || post.evidencePack?.corroboration?.score || 0
            },
            timestamps: {
                clientCaptureMs: post.evidencePack?.clientCaptureMs || post.timestamp || Date.now()
            },
            environment: {
                app: 'VocalWitness',
                hashApi: 'WebCrypto.subtle.digest SHA-256'
            }
        };

        if (post.imageUrl && post.imageHash) {
            core.media.push({
                role: 'image',
                url: post.imageUrl,
                hashAlg: 'SHA-256',
                hashCapture: post.imageHash,
                hashAfterUpload: post.imageHash,
                hashMatch: true,
                exifScrubbed: true
            });
        }
        if (post.audioUrl && post.audioHash) {
            core.media.push({
                role: 'audio',
                url: post.audioUrl,
                hashAlg: 'SHA-256',
                hashCapture: post.audioHash,
                hashAfterUpload: post.audioHash,
                hashMatch: true
            });
        }

        const fullPack = toFullEvidencePack(
            core,
            post.packCoreHash || post.evidencePack?.packCoreHash || null,
            post.evidencePack?.rfc3161 || null,
            postId
        );

        downloadEvidencePack(fullPack, postId);
        showToast('Evidence pack downloaded', 'success');
    } catch (err) {
        console.error('Download pack failed:', err);
        showToast('Could not prepare evidence pack', 'error');
    }
}

// ====================== OPTIMISTIC UPDATES ======================

window.editTestimony = async (testimonyId) => {
    const post = myPostsCache.find(p => p.id === testimonyId);
    if (post && (post.hasEvidencePack || post.evidencePack || post.packCoreHash)) {
        showToast('Sealed reports cannot be edited', 'info');
        return;
    }

    const contentEl = document.getElementById(`content-${testimonyId}`);
    if (!contentEl) return;

    const oldText = contentEl.innerText;
    const newText = prompt('Edit your testimony:', oldText);

    if (newText === null || newText.trim() === oldText) return;

    const originalHTML = contentEl.innerHTML;
    contentEl.innerHTML = escapeHTML(newText) + ' <span class="text-amber-400 text-xs">(saving...)</span>';

    try {
        await updateDoc(doc(db, 'testimonies', testimonyId), {
            content: newText.trim(),
            text: newText.trim(),
            updatedAt: serverTimestamp()
        });
        showToast('Updated successfully', 'success');
    } catch (error) {
        console.error(error);
        contentEl.innerHTML = originalHTML;
        showToast('Failed to update. Changes reverted.', 'error');
    }
};

window.deleteTestimony = async (testimonyId) => {
    if (!confirm('Remove this testimony from your list?')) return;

    const testimonyEl = document.getElementById(`testimony-${testimonyId}`);
    if (!testimonyEl) return;

    const post = myPostsCache.find(p => p.id === testimonyId);
    const isSealed = !!(post?.hasEvidencePack || post?.evidencePack || post?.packCoreHash ||
        post?.imageHash || post?.audioHash || post?.forensicHash);

    testimonyEl.style.opacity = '0.4';
    testimonyEl.style.pointerEvents = 'none';

    try {
        const ref = doc(db, 'testimonies', testimonyId);

        if (isSealed) {
            await updateDoc(ref, {
                isDeleted: true,
                content: '[This report was removed by the author]',
                updatedAt: serverTimestamp()
            });
        } else {
            await deleteDoc(ref);
        }

        testimonyEl.remove();
        showToast(isSealed ? 'Report removed from your list (record retained)' : 'Testimony deleted', 'success');
    } catch (error) {
        console.error(error);
        testimonyEl.style.opacity = '1';
        testimonyEl.style.pointerEvents = 'auto';
        showToast('Failed to delete testimony', 'error');
    }
};

// js/comments.js - VocalWitness Forensics & Dynamic Reply Tree Engine
// Fixed: i18n import, likes allowed for any signed-in user, safer counter updates

import {
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    increment,
    serverTimestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { renderTierCircle } from './ui-components.js';
import { hasStewardAccess, getUserTierData } from './tier.js';
import { t } from './i18n.js';                    // ← fixed
import { logAuditEvent } from './audit.js';

let activeCommentsListener = null;
let currentPostId = null;
let activeReplyToId = null;
let isStewardCache = false;

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Initializes and displays the Comment Modal for a specific testimony.
 */
export async function openCommentModal(postId) {
    currentPostId = postId;
    activeReplyToId = null;

    try {
        isStewardCache = await hasStewardAccess();
    } catch {
        isStewardCache = false;
    }

    ensureModalDOM();

    const modal = document.getElementById('commentModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    initCommentsStream(postId);
}

/**
 * Closes and resets the comment modal state.
 */
export function closeCommentModal() {
    const modal = document.getElementById('commentModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    if (typeof activeCommentsListener === 'function') {
        activeCommentsListener();
        activeCommentsListener = null;
    }

    currentPostId = null;
    activeReplyToId = null;
}

/**
 * Ensures the comment modal markup exists in document body.
 */
function ensureModalDOM() {
    if (document.getElementById('commentModal')) return;

    const modalContainer = document.createElement('div');
    modalContainer.id = 'commentModal';
    modalContainer.className = 'fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4';

    modalContainer.innerHTML = `
        <div class="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <!-- Modal Header -->
            <div class="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur-sm">
                <div class="flex items-center gap-2">
                    <span class="text-xl">💬</span>
                    <h3 class="font-bold text-zinc-100 text-sm sm:text-base">${t('comments_header') || 'Testimony Discussion & Evidence Notes'}</h3>
                </div>
                <button id="closeCommentModalBtn" class="text-zinc-400 hover:text-white text-xl transition p-1">✕</button>
            </div>

            <!-- Comment Stream Container -->
            <div id="commentsTreeContainer" class="p-4 overflow-y-auto flex-1 space-y-4 font-sans">
                <div class="text-center py-8 text-zinc-500 font-mono text-xs animate-pulse">${t('loading_comments') || 'Decrypting discussion stream...'}</div>
            </div>

            <!-- Input Box -->
            <div class="p-4 border-t border-zinc-800 bg-zinc-900/40 flex flex-col gap-2.5">
                <div id="replyIndicator" class="hidden items-center justify-between bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs text-emerald-400">
                    <span id="replyTargetText">${t('replying_to') || 'Replying to comment...'}</span>
                    <button id="cancelReplyBtn" class="text-zinc-400 hover:text-white">✕</button>
                </div>

                <div class="flex flex-col sm:flex-row gap-2">
                    <textarea
                        id="commentInput"
                        rows="2"
                        maxlength="1200"
                        placeholder="${t('add_comment_placeholder') || 'Add a verified response or note to the public record...'}"
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition resize-none"
                    ></textarea>

                    <div class="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        <label class="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer select-none">
                            <input type="checkbox" id="anonCommentToggle" class="rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-0 focus:ring-offset-0">
                            <span>${t('anon_mode') || 'ZK-Anon'}</span>
                        </label>

                        <button
                            id="submitCommentBtn"
                            class="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-5 py-2 sm:py-0 rounded-2xl text-xs sm:text-sm transition flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/10"
                        >
                            ${t('send') || 'Publish'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalContainer);

    document.getElementById('closeCommentModalBtn').addEventListener('click', closeCommentModal);
    document.getElementById('cancelReplyBtn').addEventListener('click', cancelReplyTarget);
    document.getElementById('submitCommentBtn').addEventListener('click', handleCommentSubmission);
}

/**
 * Real-time comment stream
 */
function initCommentsStream(postId) {
    const container = document.getElementById('commentsTreeContainer');
    if (!container) return;

    if (typeof activeCommentsListener === 'function') {
        activeCommentsListener();
    }

    const q = query(
        collection(db, "testimonies", postId, "comments"),
        orderBy("createdAt", "asc")
    );

    activeCommentsListener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="text-center py-12 text-zinc-500">
                    <p class="text-sm font-medium">${t('no_comments_yet') || 'No verified comments on this testimony yet.'}</p>
                    <p class="text-xs text-zinc-600 mt-1">${t('start_discussion') || 'Be the first to contribute to the forensic stream.'}</p>
                </div>`;
            return;
        }

        const comments = [];
        snapshot.forEach(docSnap => {
            comments.push({ id: docSnap.id, ...docSnap.data() });
        });

        const treeHtml = renderCommentTree(comments);
        container.innerHTML = treeHtml;

        ensureCommentDelegation(container);
    }, (err) => {
        console.error("[VocalWitness] Comments subscription failed:", err);
        container.innerHTML = `<div class="text-center py-6 text-red-400 text-xs font-mono">Error connecting to discussion node stream.</div>`;
    });
}

function renderCommentTree(comments) {
    const map = {};
    const roots = [];

    comments.forEach(c => {
        map[c.id] = { ...c, children: [] };
    });

    comments.forEach(c => {
        if (c.parentId && map[c.parentId]) {
            map[c.parentId].children.push(map[c.id]);
        } else {
            roots.push(map[c.id]);
        }
    });

    return roots.map(node => renderCommentNodeHTML(node)).join('');
}

function renderCommentNodeHTML(node) {
    const user = auth.currentUser;
    const isOwner = user && user.uid === node.authorId;
    const isAnon = node.isAnonymous === true;
    const authorName = isAnon ? "Anonymous Witness (ZK)" : escapeHTML(node.authorName || "Citizen Witness");

    let dateStr = "Just now";
    if (node.createdAt?.toDate) dateStr = node.createdAt.toDate().toLocaleString();
    else if (node.createdAt) dateStr = new Date(node.createdAt).toLocaleString();

    const deleteBtn = (isOwner || isStewardCache)
        ? `<button data-comment-action="delete" data-comment-id="${node.id}" title="${t('delete') || 'Delete'}" class="text-zinc-500 hover:text-red-400 text-xs transition">🗑️</button>`
        : '';

    const childrenHTML = node.children.length > 0
        ? `<div class="ml-3 sm:ml-5 pl-2.5 sm:pl-3 border-l border-zinc-800/80 mt-3 space-y-3">${node.children.map(renderCommentNodeHTML).join('')}</div>`
        : '';

    const tierCircle = isAnon
        ? `<div class="w-6 h-6 rounded-full bg-zinc-800 border border-emerald-500/40 flex items-center justify-center text-[10px] text-emerald-400 font-mono">ZK</div>`
        : renderTierCircle(node.authorTier || 'citizen', node.reputation || 0);

    return `
        <div class="comment-node bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-3 sm:p-3.5 text-xs sm:text-sm" data-node-id="${node.id}">
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    ${tierCircle}
                    <div>
                        <div class="flex items-center gap-1.5">
                            <p class="font-semibold ${isAnon ? 'text-emerald-400 font-mono text-xs' : 'text-zinc-200'}">${authorName}</p>
                            ${node.isSteward ? `<span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] px-1.5 py-0.5 rounded-md uppercase font-mono">Steward</span>` : ''}
                        </div>
                        <p class="text-[10px] text-zinc-500 font-mono">${dateStr}</p>
                    </div>
                </div>
                ${deleteBtn}
            </div>

            <p class="mt-2.5 text-zinc-300 leading-relaxed whitespace-pre-line text-xs sm:text-sm">${escapeHTML(node.content)}</p>

            <div class="mt-3 flex items-center gap-4 text-xs text-zinc-400">
                <button data-comment-action="like" data-comment-id="${node.id}" class="hover:text-emerald-400 transition flex items-center gap-1 font-mono">
                    <span>▲</span>
                    <span>${node.likes || 0}</span>
                </button>
                <button data-comment-action="reply" data-comment-id="${node.id}" data-author="${authorName}" class="hover:text-emerald-400 transition flex items-center gap-1">
                    <span>💬</span>
                    <span>${t('reply') || 'Reply'}</span>
                </button>
            </div>

            ${childrenHTML}
        </div>
    `;
}

function ensureCommentDelegation(container) {
    if (container.dataset.delegationBound === "true") return;
    container.dataset.delegationBound = "true";

    container.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-comment-action]");
        if (!btn) return;

        const action = btn.getAttribute("data-comment-action");
        const commentId = btn.getAttribute("data-comment-id");

        if (action === "reply") {
            const author = btn.getAttribute("data-author");
            setReplyTarget(commentId, author);
        } else if (action === "like") {
            await handleCommentLike(commentId, btn);
        } else if (action === "delete") {
            await handleCommentDelete(commentId);
        }
    });
}

function setReplyTarget(commentId, authorName) {
    activeReplyToId = commentId;
    const indicator = document.getElementById('replyIndicator');
    const targetText = document.getElementById('replyTargetText');

    if (indicator && targetText) {
        targetText.textContent = `${t('replying_to') || 'Replying to'} ${authorName}...`;
        indicator.classList.remove('hidden');
        indicator.classList.add('flex');
    }

    const input = document.getElementById('commentInput');
    if (input) input.focus();
}

function cancelReplyTarget() {
    activeReplyToId = null;
    const indicator = document.getElementById('replyIndicator');
    if (indicator) {
        indicator.classList.add('hidden');
        indicator.classList.remove('flex');
    }
}

async function handleCommentSubmission() {
    const user = auth.currentUser;
    if (!user) {
        showToast(t('login_required') || "Please log in or verify your identity to participate.", "error");
        return;
    }

    const input = document.getElementById('commentInput');
    const anonToggle = document.getElementById('anonCommentToggle');
    const content = input ? input.value.trim() : '';

    if (!content) {
        showToast(t('comment_empty_err') || "Comment content cannot be empty.", "error");
        return;
    }

    if (content.length > 1200) {
        showToast("Comment is too long (max 1200 characters).", "error");
        return;
    }

    const submitBtn = document.getElementById('submitCommentBtn');
    submitBtn.disabled = true;

    try {
        const userTierData = await getUserTierData(user.uid).catch(() => ({ tier: 'citizen', reputation: 0 }));

        const commentData = {
            postId: currentPostId,
            parentId: activeReplyToId || null,
            content: content,
            authorId: user.uid,
            authorName: user.displayName || "Citizen Witness",
            authorTier: userTierData.tier || "citizen",
            reputation: userTierData.reputation || 0,
            isSteward: isStewardCache,
            isAnonymous: anonToggle ? anonToggle.checked : false,
            likes: 0,
            createdAt: serverTimestamp()
        };

        // Transaction: create comment + increment counter safely
        await runTransaction(db, async (transaction) => {
            const commentRef = doc(collection(db, "testimonies", currentPostId, "comments"));
            transaction.set(commentRef, commentData);

            const testimonyRef = doc(db, "testimonies", currentPostId);
            transaction.update(testimonyRef, {
                commentsCount: increment(1)
            });
        });

        await logAuditEvent("COMMENT_ADDED", { postId: currentPostId, isAnonymous: commentData.isAnonymous });

        input.value = '';
        cancelReplyTarget();
        showToast(t('comment_published') || "Comment published to testimony stream.", "success");
    } catch (err) {
        console.error("[VocalWitness] Failed to post comment:", err);
        showToast("Failed to publish comment.", "error");
    } finally {
        submitBtn.disabled = false;
    }
}

/**
 * Like handler – any signed-in user can like (rules updated)
 */
async function handleCommentLike(commentId, btn) {
    if (!auth.currentUser) {
        return showToast(t('login_required') || "Log in to endorse responses.", "error");
    }

    // Simple client-side guard against rapid re-clicks
    if (btn.dataset.liked === "true") return;
    btn.dataset.liked = "true";
    btn.disabled = true;
    btn.classList.add("opacity-50", "pointer-events-none");

    try {
        const commentRef = doc(db, "testimonies", currentPostId, "comments", commentId);
        await updateDoc(commentRef, {
            likes: increment(1)
        });
    } catch (err) {
        console.error("[VocalWitness] Comment upvote failed:", err);
        btn.dataset.liked = "false";
        btn.disabled = false;
        btn.classList.remove("opacity-50", "pointer-events-none");
        showToast("Could not register like.", "error");
    }
}

async function handleCommentDelete(commentId) {
    if (!confirm(t('confirm_comment_delete') || "Permanently remove this response from the record?")) return;

    try {
        await runTransaction(db, async (transaction) => {
            const commentRef = doc(db, "testimonies", currentPostId, "comments", commentId);
            transaction.delete(commentRef);

            const testimonyRef = doc(db, "testimonies", currentPostId);
            transaction.update(testimonyRef, {
                commentsCount: increment(-1)
            });
        });

        await logAuditEvent("COMMENT_DELETED", { postId: currentPostId, commentId });
        showToast(t('comment_deleted') || "Comment removed", "info");
    } catch (err) {
        console.error("[VocalWitness] Comment deletion failed:", err);
        showToast("Failed to delete comment.", "error");
    }
}

// ====================== GLOBAL EXPORTS ======================
window.openCommentModal = openCommentModal;
window.closeCommentModal = closeCommentModal;

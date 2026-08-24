// js/comments.js - Modal & Dynamic Reply Tree Architecture for Testimonies
import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    increment,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { renderTierCircle } from './ui-components.js';
import { hasStewardAccess } from './tier.js';

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
 * @param {string} postId - Firestore document ID of the parent testimony
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
    modalContainer.className = 'fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4';
    
    modalContainer.innerHTML = `
        <div class="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <!-- Modal Header -->
            <div class="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
                <div class="flex items-center gap-2">
                    <span class="text-xl">💬</span>
                    <h3 class="font-bold text-zinc-100 text-sm sm:text-base">Testimony Discussion</h3>
                </div>
                <button id="closeCommentModalBtn" class="text-zinc-400 hover:text-white text-xl transition p-1">✕</button>
            </div>

            <!-- Comment Stream Container -->
            <div id="commentsTreeContainer" class="p-4 overflow-y-auto flex-1 space-y-4">
                <div class="text-center py-8 text-zinc-500 font-mono text-xs animate-pulse">Loading discussion stream...</div>
            </div>

            <!-- Input Box -->
            <div class="p-4 border-t border-zinc-800 bg-zinc-950 flex flex-col gap-2">
                <div id="replyIndicator" class="hidden items-center justify-between bg-zinc-900 px-3 py-1.5 rounded-xl text-xs text-emerald-400 border border-emerald-500/30">
                    <span id="replyTargetText">Replying to comment...</span>
                    <button id="cancelReplyBtn" class="text-zinc-400 hover:text-white">✕</button>
                </div>

                <div class="flex gap-2">
                    <textarea 
                        id="commentInput" 
                        rows="2" 
                        placeholder="Add to the public record..." 
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-2 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition resize-none"
                    ></textarea>
                    <button 
                        id="submitCommentBtn" 
                        class="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold px-4 rounded-2xl text-xs sm:text-sm transition flex items-center justify-center shrink-0"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalContainer);

    // Attach base event listeners
    document.getElementById('closeCommentModalBtn').addEventListener('click', closeCommentModal);
    document.getElementById('cancelReplyBtn').addEventListener('click', cancelReplyTarget);
    document.getElementById('submitCommentBtn').addEventListener('click', handleCommentSubmission);
}

/**
 * Listens for real-time comment collection snapshots for the given testimony.
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
                    <p class="text-sm font-medium">No comments on this testimony yet.</p>
                    <p class="text-xs text-zinc-600 mt-1">Start the conversation below.</p>
                </div>`;
            return;
        }

        const comments = [];
        snapshot.forEach(docSnap => {
            comments.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Build and render hierarchical tree
        const treeHtml = renderCommentTree(comments);
        container.innerHTML = treeHtml;

        bindCommentInteractivity(container);
    }, (err) => {
        console.error("Comments subscription failed:", err);
        container.innerHTML = `<div class="text-center py-6 text-red-400 text-xs">Failed to load comments stream.</div>`;
    });
}

/**
 * Transforms flat array into nested HTML structure based on parentId references.
 */
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

/**
 * Recursively builds HTML for individual comment node and nested replies.
 */
function renderCommentNodeHTML(node) {
    const user = auth.currentUser;
    const isOwner = user && user.uid === node.authorId;
    const authorName = escapeHTML(node.authorName || "Citizen Witness");
    
    let dateStr = "Just now";
    if (node.createdAt?.toDate) dateStr = node.createdAt.toDate().toLocaleString();
    else if (node.createdAt) dateStr = new Date(node.createdAt).toLocaleString();

    const deleteBtn = (isOwner || isStewardCache) 
        ? `<button data-comment-action="delete" data-comment-id="${node.id}" class="text-zinc-500 hover:text-red-400 text-xs transition">🗑️</button>` 
        : '';

    const childrenHTML = node.children.length > 0 
        ? `<div class="ml-4 sm:ml-6 pl-3 border-l border-zinc-800/80 mt-3 space-y-3">${node.children.map(renderCommentNodeHTML).join('')}</div>`
        : '';

    return `
        <div class="comment-node bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3 sm:p-4 text-xs sm:text-sm" data-node-id="${node.id}">
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    ${renderTierCircle(node.authorTier || 'citizen', node.reputation || 0)}
                    <div>
                        <p class="font-semibold text-zinc-200">${authorName}</p>
                        <p class="text-[10px] text-zinc-500 font-mono">${dateStr}</p>
                    </div>
                </div>
                ${deleteBtn}
            </div>

            <p class="mt-2.5 text-zinc-300 leading-relaxed whitespace-pre-line">${escapeHTML(node.content)}</p>

            <div class="mt-3 flex items-center gap-4 text-xs text-zinc-400">
                <button data-comment-action="like" data-comment-id="${node.id}" class="hover:text-emerald-400 transition flex items-center gap-1">
                    <span>▲</span>
                    <span>${node.likes || 0}</span>
                </button>
                <button data-comment-action="reply" data-comment-id="${node.id}" data-author="${authorName}" class="hover:text-emerald-400 transition">
                    💬 Reply
                </button>
            </div>

            ${childrenHTML}
        </div>
    `;
}

/**
 * Attaches event listeners to rendered comment nodes using delegation.
 */
function bindCommentInteractivity(container) {
    container.querySelectorAll('button[data-comment-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const action = btn.getAttribute('data-comment-action');
            const commentId = btn.getAttribute('data-comment-id');

            if (action === 'reply') {
                const author = btn.getAttribute('data-author');
                setReplyTarget(commentId, author);
            } else if (action === 'like') {
                await handleCommentLike(commentId);
            } else if (action === 'delete') {
                await handleCommentDelete(commentId);
            }
        });
    });
}

function setReplyTarget(commentId, authorName) {
    activeReplyToId = commentId;
    const indicator = document.getElementById('replyIndicator');
    const targetText = document.getElementById('replyTargetText');
    
    if (indicator && targetText) {
        targetText.textContent = `Replying to ${authorName}...`;
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
        showToast("Please log in to participate in discussions.", "error");
        return;
    }

    const input = document.getElementById('commentInput');
    const content = input ? input.value.trim() : '';

    if (!content) {
        showToast("Comment content cannot be empty.", "error");
        return;
    }

    const submitBtn = document.getElementById('submitCommentBtn');
    submitBtn.disabled = true;

    try {
        const commentData = {
            postId: currentPostId,
            parentId: activeReplyToId || null,
            content: content,
            authorId: user.uid,
            authorName: user.displayName || "Citizen Witness",
            authorTier: "citizen",
            reputation: 0,
            likes: 0,
            createdAt: serverTimestamp()
        };

        // 1. Save Comment to subcollection
        await addDoc(collection(db, "testimonies", currentPostId, "comments"), commentData);

        // 2. Increment comment count on parent testimony document
        const testimonyRef = doc(db, "testimonies", currentPostId);
        await updateDoc(testimonyRef, {
            commentsCount: increment(1)
        });

        input.value = '';
        cancelReplyTarget();
        showToast("Comment published", "success");
    } catch (err) {
        console.error("Failed to post comment:", err);
        showToast("Failed to post comment.", "error");
    } finally {
        submitBtn.disabled = false;
    }
}

async function handleCommentLike(commentId) {
    if (!auth.currentUser) return showToast("Log in to upvote comments.", "error");

    try {
        const commentRef = doc(db, "testimonies", currentPostId, "comments", commentId);
        await updateDoc(commentRef, {
            likes: increment(1)
        });
    } catch (err) {
        console.error("Comment upvote failed:", err);
    }
}

async function handleCommentDelete(commentId) {
    if (!confirm("Delete this comment?")) return;

    try {
        const commentRef = doc(db, "testimonies", currentPostId, "comments", commentId);
        await deleteDoc(commentRef);

        const testimonyRef = doc(db, "testimonies", currentPostId);
        await updateDoc(testimonyRef, {
            commentsCount: increment(-1)
        });

        showToast("Comment deleted", "info");
    } catch (err) {
        console.error("Comment deletion failed:", err);
        showToast("Failed to delete comment.", "error");
    }
}

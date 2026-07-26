// js/resource-meter.js - Manages utility packages, bandwidth, storage, and export tokens
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';

/**
 * Default resource allowances for free accounts
 */
const DEFAULT_RESOURCES = {
    pdfExportsRemaining: 3,
    storageUsedMB: 0,
    storageLimitMB: 50, // 50MB free media vault storage
    bandwidthUsedMB: 0,
    bandwidthLimitMB: 500, // 500MB broadcast/streaming bandwidth
    zkQueuePriority: false
};

/**
 * Fetches the current user's resource allocations from Firestore
 */
export async function getUserResources(userId) {
    if (!userId) return DEFAULT_RESOURCES;
    try {
        const userRef = doc(db, "users", userId);
        const snapshot = await getDoc(userRef);
        if (snapshot.exists()) {
            const data = snapshot.data();
            return {
                pdfExportsRemaining: data.pdfExportsRemaining ?? DEFAULT_RESOURCES.pdfExportsRemaining,
                storageUsedMB: data.storageUsedMB ?? DEFAULT_RESOURCES.storageUsedMB,
                storageLimitMB: data.storageLimitMB ?? DEFAULT_RESOURCES.storageLimitMB,
                bandwidthUsedMB: data.bandwidthUsedMB ?? DEFAULT_RESOURCES.bandwidthUsedMB,
                bandwidthLimitMB: data.bandwidthLimitMB ?? DEFAULT_RESOURCES.bandwidthLimitMB,
                zkQueuePriority: data.zkQueuePriority ?? DEFAULT_RESOURCES.zkQueuePriority
            };
        }
    } catch (error) {
        console.error("Error fetching user resources:", error);
    }
    return DEFAULT_RESOURCES;
}

/**
 * Checks if a user has enough PDF export tokens remaining
 */
export async function consumePdfToken() {
    const user = auth.currentUser;
    if (!user) {
        showToast("You must be logged in to export PDFs.", "error");
        return false;
    }

    const resources = await getUserResources(user.uid);
    if (resources.pdfExportsRemaining <= 0) {
        showToast("PDF export limit reached. Support infrastructure to unlock more tokens.", "info");
        return false;
    }

    try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            pdfExportsRemaining: resources.pdfExportsRemaining - 1,
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error consuming PDF token:", error);
        return false;
    }
}

/**
 * Renders the Resource Meter UI inside the profile or support page
 */
export async function renderResourceMeterUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = auth.currentUser;
    if (!user) {
        container.innerHTML = `<p class="text-zinc-500 text-sm">Sign in to view your resource usage.</p>`;
        return;
    }

    const res = await getUserResources(user.uid);

    const storagePercent = Math.min(100, Math.round((res.storageUsedMB / res.storageLimitMB) * 100));
    const bandwidthPercent = Math.min(100, Math.round((res.bandwidthUsedMB / res.bandwidthLimitMB) * 100));

    container.innerHTML = `
        <div class="space-y-6 bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div class="flex justify-between items-center">
                <h4 class="font-semibold text-lg text-white flex items-center gap-2">
                    <span>⚡</span> Resource & Utility Allotments
                </h4>
                <span class="text-xs font-mono px-3 py-1 bg-zinc-800 text-emerald-400 rounded-full">
                    Infrastructure Supported
                </span>
            </div>
            <p class="text-xs text-zinc-400">
                Resource packages support decentralized storage and server maintenance. These do not affect your trust level or community standing.
            </p>

            <!-- PDF Exports Meter -->
            <div class="bg-zinc-950 rounded-2xl p-4 flex justify-between items-center">
                <div>
                    <div class="text-sm font-medium text-white">Permanent Ledger PDF Exports</div>
                    <div class="text-xs text-zinc-500">Available compilation tokens</div>
                </div>
                <div class="text-right">
                    <span class="text-lg font-bold text-amber-400">${res.pdfExportsRemaining}</span>
                    <span class="text-xs text-zinc-500">left</span>
                </div>
            </div>

            <!-- Storage Meter -->
            <div class="bg-zinc-950 rounded-2xl p-4 space-y-2">
                <div class="flex justify-between text-sm">
                    <span class="text-zinc-300">Forensic Media Vault Storage</span>
                    <span class="text-zinc-400">${res.storageUsedMB} MB / ${res.storageLimitMB} MB</span>
                </div>
                <div class="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                    <div class="bg-emerald-500 h-full rounded-full transition-all" style="width: ${storagePercent}%"></div>
                </div>
            </div>

            <!-- Bandwidth Meter -->
            <div class="bg-zinc-950 rounded-2xl p-4 space-y-2">
                <div class="flex justify-between text-sm">
                    <span class="text-zinc-300">Encrypted Broadcast Bandwidth</span>
                    <span class="text-zinc-400">${res.bandwidthUsedMB} MB / ${res.bandwidthLimitMB} MB</span>
                </div>
                <div class="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                    <div class="bg-amber-500 h-full rounded-full transition-all" style="width: ${bandwidthPercent}%"></div>
                </div>
            </div>

            <button onclick="window.openSupportPackagesModal()" 
                    class="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-2xl transition text-sm">
                📦 Acquire Additional Resource Packages
            </button>
        </div>
    `;
}

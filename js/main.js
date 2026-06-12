import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyATxYekXgjdLP2SfR42FG8rEdajq_pIEb0",
    authDomain: "vocalwitness-3affa.firebaseapp.com",
    projectId: "vocalwitness-3affa",
    storageBucket: "vocalwitness-3affa.firebasestorage.app",
    messagingSenderId: "108466981866",
    appId: "1:108466981866:web:b53360ad44012a576c8093"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 1. Updated Feed Loader with Filter
function initDynamicFeed(visibilityType = 'citizentalk') {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    // Query filtered by visibility type
    const q = query(
        collection(db, "testimonies"), 
        where("feedVisibility", "==", visibilityType),
        orderBy("timestamp", "desc")
    );
    
    onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = '';
        snapshot.forEach((doc) => {
            const data = doc.data();
            const post = document.createElement('div');
            post.className = "bg-[#111827] p-6 rounded-3xl border border-zinc-800 glass mb-4";
            post.innerHTML = `
                <p class="text-zinc-200 text-sm">${data.witnessText}</p>
                <div class="mt-4 text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
                    Verified Forensic Entry • ${visibilityType}
                </div>
            `;
            feedContainer.appendChild(post);
        });
    });
}

// 2. Main Initialization
export function init() {
    const btnWitness = document.getElementById('btn-witnessvoice');
    const btnCitizen = document.getElementById('btn-citizentalk');
    
    // Navigation Logic
    const switchFeed = (type, activeBtn) => {
        // Toggle visual style
        [btnWitness, btnCitizen].forEach(b => b.classList.replace('bg-emerald-500', 'bg-zinc-800'));
        activeBtn.classList.replace('bg-zinc-800', 'bg-emerald-500');
        
        initDynamicFeed(type);
    };

    btnWitness.addEventListener('click', () => switchFeed('witnessvoice', btnWitness));
    btnCitizen.addEventListener('click', () => switchFeed('citizentalk', btnCitizen));

    // Post Logic
    document.getElementById('postButton').addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        if (!input.value.trim()) return alert("Enter text.");
        
        await addDoc(collection(db, "testimonies"), {
            witnessText: input.value,
            feedVisibility: 'citizentalk', // Defaulting to this
            timestamp: new Date()
        });
        input.value = "";
    });

    // Initial Load
    initDynamicFeed('citizentalk');
}

// Initialize the worker
const zkWorker = new Worker('js/zk-worker.js');

function startWitnessUpgrade(userIdentity) {
    // Show UI loading state
    showToast("Generating ZK Proof... please wait.", "info");

    // Send data to worker
    zkWorker.postMessage({ 
        identityCommitment: userIdentity,
        witnessData: "current_session_token"
    });
}

// Receive the result
zkWorker.onmessage = (e) => {
    if (e.data.success) {
        console.log("Proof generated:", e.data.proof);
        // Now send this proof to Firebase Functions
        sendProofToVerificationServer(e.data.proof);
    } else {
        console.error("ZK Generation Failed:", e.data.error);
    }
};

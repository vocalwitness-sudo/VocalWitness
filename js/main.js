<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#10b981">
    <meta name="description" content="VocalWitness - Privacy First Public Square for Truth and Evidence">
    
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" href="/logo.png" type="image/png">

    <title data-i18n="pageTitle">VocalWitness • Truth • Evidence • Public Square</title>

    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', system-ui, sans-serif; background: #0a0f1c; color: #e2e8f0; }
        .glass { background: rgba(15, 23, 42, 0.92); backdrop-filter: blur(24px); border: 1px solid rgba(148, 163, 184, 0.12); }
        .nav-tab.active { background-color: #10b981; color: black; font-weight: 600; }
    </style>
</head>
<body class="min-h-screen pb-24 bg-[#0a0f1c]">

<!-- [Your full header, nav, composer, footer as before] -->

<!-- Profile Modal (Your improved version) -->
<div id="profileModal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-[10000] p-4">
    <div class="glass rounded-3xl p-8 max-w-lg w-full max-h-[90vh] overflow-auto">
        <div class="flex justify-between items-center mb-6 border-b border-zinc-700 pb-4">
            <h2 class="text-2xl font-bold text-white">My Profile</h2>
            <button onclick="closeProfile()" class="text-3xl text-zinc-400 hover:text-white">×</button>
        </div>
        <div id="profileContent"></div>
        
        <div class="mt-8 flex gap-3">
            <button onclick="logout()" class="flex-1 py-3 border border-red-500 text-red-400 hover:bg-red-500/10 rounded-2xl font-medium">
                Sign Out
            </button>
        </div>
    </div>
</div>

<!-- Support & Login Modals (keep as you had) -->

<script type="module" src="js/main.js"></script>

</body>
</html>

// js/load-libs.js
// Dynamically load heavy libraries only when needed

const loaded = {
  ethers: false,
  jspdf: false,
  snarkjs: false
};

export async function loadEthers() {
  if (loaded.ethers || window.ethers) {
    return window.ethers;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      loaded.ethers = true;
      resolve(window.ethers);
    };
    script.onerror = () => reject(new Error('Failed to load ethers'));
    document.head.appendChild(script);
  });
}

export async function loadJsPDF() {
  if (loaded.jspdf || window.jspdf) {
    return window.jspdf;
  }

  // Load jspdf first
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  // Then load the autoTable plugin
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      loaded.jspdf = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return window.jspdf;
}

export async function loadSnarkjs() {
  if (loaded.snarkjs || window.snarkjs) {
    return window.snarkjs;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/snarkjs@0.7.0/build/snarkjs.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      loaded.snarkjs = true;
      resolve(window.snarkjs);
    };
    script.onerror = () => reject(new Error('Failed to load snarkjs'));
    document.head.appendChild(script);
  });
}

/**
 * js/report-page.js
 * First-class crawlable sealed report page
 * URL: /report/{id}  or  /report.html?id=...
 */
import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  buildFullPackFromTestimony,
  downloadEvidencePack,
  resolveLedgerHash,
  buildShareUrl,
} from './evidence-pack.js';
import { showToast } from './utils.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getReportId() {
  // Prefer path: /report/ID
  const path = window.location.pathname.replace(/\/+$/, '');
  const m = path.match(/\/report\/([^/]+)$/i);
  if (m?.[1]) return decodeURIComponent(m[1]);

  // Fallback query
  const q = new URLSearchParams(window.location.search);
  return q.get('id') || q.get('t') || null;
}

function setMeta(elId, attr, value) {
  const el = document.getElementById(elId);
  if (!el || value == null) return;
  if (attr === 'text') el.textContent = value;
  else if (attr === 'content') el.setAttribute('content', value);
  else if (attr === 'href') el.setAttribute('href', value);
}

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

function isPubliclyVisible(data) {
  if (!data) return false;
  if (data.isDeleted === true) return false;
  if (data.visibility === 'moderator_hidden' || data.visibility === 'author_hidden') return false;
  if (data.feedVisibility === 'hidden') return false;
  return true;
}

async function loadReport() {
  const id = getReportId();
  const loading = document.getElementById('state-loading');
  const errorEl = document.getElementById('state-error');
  const root = document.getElementById('report-root');

  if (!id) {
    loading?.classList.add('hidden');
    errorEl?.classList.remove('hidden');
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'testimonies', id));
    if (!snap.exists()) {
      loading?.classList.add('hidden');
      errorEl?.classList.remove('hidden');
      return;
    }

    const data = { id: snap.id, ...snap.data() };

    if (!isPubliclyVisible(data)) {
      loading?.classList.add('hidden');
      errorEl?.classList.remove('hidden');
      return;
    }

    renderReport(data);
    loading?.classList.add('hidden');
    root?.classList.remove('hidden');
  } catch (err) {
    console.error('[report-page]', err);
    loading?.classList.add('hidden');
    errorEl?.classList.remove('hidden');
  }
}

function renderReport(data) {
  const content = (data.content || data.body || '').trim();
  const preview = content.slice(0, 160).replace(/\s+/g, ' ');
  const titleText =
    content.slice(0, 90).replace(/\s+/g, ' ') ||
    'Sealed report on VocalWitness';
  const pageTitle = `${titleText}${titleText.length >= 90 ? '…' : ''} • VocalWitness`;
  const desc =
    preview ||
    'Sealed citizen report. Cryptographic integrity protected on VocalWitness. Integrity ≠ truth.';
  const url = `https://vocalwitness.com/report/${data.id}`;
  const image =
    data.imageUrl ||
    'https://vocalwitness.com/logo.png';
  const hash = resolveLedgerHash(data);
  const channel = data.channel || data.targetFeed || 'citizen-talk';
  const authorLabel = data.isAnonymous
    ? 'Anonymous Witness'
    : (data.author || data.displayName || 'Citizen');
  const when = formatDate(data.createdAt);

  // Meta tags (helps JS-capable crawlers + social)
  document.title = pageTitle;
  setMeta('page-title', 'text', pageTitle);
  setMeta('page-desc', 'content', desc);
  setMeta('page-canonical', 'href', url);
  setMeta('og-title', 'content', pageTitle);
  setMeta('og-desc', 'content', desc);
  setMeta('og-url', 'content', url);
  setMeta('og-image', 'content', image);
  setMeta('tw-title', 'content', pageTitle);
  setMeta('tw-desc', 'content', desc);
  setMeta('tw-image', 'content', image);

  // JSON-LD
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: titleText,
    description: desc,
    url,
    datePublished: data.createdAt?.toDate?.()?.toISOString?.() || undefined,
    author: data.isAnonymous
      ? { '@type': 'Person', name: 'Anonymous' }
      : { '@type': 'Person', name: authorLabel },
    isAccessibleForFree: true,
    publisher: {
      '@type': 'Organization',
      name: 'VocalWitness',
      url: 'https://vocalwitness.com/',
    },
  };
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(ld);
  document.head.appendChild(script);

  // UI
  document.getElementById('badge-channel').textContent =
    channel.includes('witness') ? '🔐 Witness' : '👤 Citizen';

  const mediaBadge = document.getElementById('badge-media');
  if (data.imageUrl || data.videoUrl || data.audioUrl) {
    mediaBadge.textContent = data.imageUrl
      ? '📷 Photo'
      : data.videoUrl
        ? '🎥 Video'
        : '🎙️ Voice';
    mediaBadge.classList.remove('hidden');
  }

  document.getElementById('report-meta').textContent =
    `${authorLabel}${when ? ' · ' + when : ''}`;

  document.getElementById('report-title').textContent =
    content.slice(0, 120) || 'Sealed report';
  document.getElementById('report-body').textContent = content;

  const mediaEl = document.getElementById('report-media');
  mediaEl.innerHTML = '';
  if (data.imageUrl) {
    const img = document.createElement('img');
    img.src = data.imageUrl;
    img.alt = 'Sealed photo evidence';
    img.loading = 'lazy';
    mediaEl.appendChild(img);
  }
  if (data.videoUrl) {
    const v = document.createElement('video');
    v.src = data.videoUrl;
    v.controls = true;
    v.playsInline = true;
    mediaEl.appendChild(v);
  }
  if (data.audioUrl) {
    const a = document.createElement('audio');
    a.src = data.audioUrl;
    a.controls = true;
    mediaEl.appendChild(a);
  }

  const hashEl = document.getElementById('report-hash');
  hashEl.textContent = hash
    ? `Hash: ${hash}`
    : 'Hash: (not available on this record)';

  // Actions
  const verifyUrl = buildShareUrl(data); // still points to verify with id+h
  document.getElementById('btn-verify').href = verifyUrl;

  document.getElementById('btn-download-pack').onclick = async () => {
    try {
      showToast?.('Generating Evidence Pack…', 'info');
      const pack = await buildFullPackFromTestimony(data);
      downloadEvidencePack(pack, data.id);
      showToast?.('Evidence Pack downloaded', 'success');
    } catch (e) {
      console.error(e);
      showToast?.('Could not build Evidence Pack', 'error');
    }
  };

  document.getElementById('btn-share').onclick = async () => {
    const shareUrl = `https://vocalwitness.com/report/${data.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: pageTitle,
          text: desc,
          url: shareUrl,
        });
        return;
      }
    } catch (_) {}
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast?.('Link copied', 'success');
    } catch {
      showToast?.(shareUrl, 'info');
    }
  };
}

loadReport();

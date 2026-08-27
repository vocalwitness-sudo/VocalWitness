// js/evidence-pack.js — Evidence pack + Batch 6 share / newsroom export
import { generateSha256Hash } from './utils.js';

const SCHEMA = 'vocalwitness.evidence-pack.v1';
const DISCLAIMER =
  'Integrity package for documented bitstrings. Not legal advice. Does not prove real-world events occurred. Application-level ledger (not a public blockchain).';

const DEFAULT_ORIGIN =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://vocalwitness.com';

/** Stable stringify so the same object always hashes the same way */
export function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]))
      .join(',') +
    '}'
  );
}

/**
 * Build the core object that gets hashed (no TSA token yet).
 */
export async function buildPackCore({
  content,
  bodyHash,
  media = {},
  identity = {},
  channel = 'citizen-talk',
  clientCaptureMs = Date.now(),
}) {
  const mediaRows = [];

  if (media.imageUrl && media.imageHash) {
    mediaRows.push({
      role: 'image',
      url: media.imageUrl,
      hashAlg: 'SHA-256',
      hashCapture: media.imageHash,
      hashAfterUpload: media.imageHash,
      hashMatch: true,
      exifScrubbed: true,
    });
  }

  if (media.audioUrl && media.audioHash) {
    mediaRows.push({
      role: 'audio',
      url: media.audioUrl,
      hashAlg: 'SHA-256',
      hashCapture: media.audioHash,
      hashAfterUpload: media.audioHash,
      hashMatch: true,
    });
  }

  const core = {
    schemaVersion: SCHEMA,
    content: {
      body: content || '',
      bodyHash: bodyHash || null,
      channel,
    },
    media: mediaRows,
    identity: {
      mode: identity.mode || 'ANONYMOUS',
      authorId: identity.authorId || null,
      displayName: identity.displayName || null,
      phoneOnPublicRecord: false,
    },
    timestamps: {
      clientCaptureMs,
    },
    environment: {
      app: 'VocalWitness',
      hashApi: 'WebCrypto.subtle.digest SHA-256',
    },
  };

  const packCoreHash = await generateSha256Hash(canonicalStringify(core));
  return { core, packCoreHash };
}

/**
 * Compact object to store on the Firestore testimony doc.
 */
export function toFirestoreEvidencePack(packCoreHash, rfc3161, clientCaptureMs) {
  return {
    schemaVersion: SCHEMA,
    packCoreHash: packCoreHash || null,
    clientCaptureMs: clientCaptureMs || Date.now(),
    rfc3161: rfc3161 || null,
  };
}

/**
 * Full pack for download (includes disclaimer + verify steps).
 */
export function toFullEvidencePack(core, packCoreHash, rfc3161, testimonyId, extra = {}) {
  const verifyUrl =
    extra.verifyUrl ||
    (testimonyId
      ? buildShareUrl({
          id: testimonyId,
          forensicHash:
            extra.forensicHash ||
            packCoreHash ||
            core?.content?.bodyHash ||
            null,
        })
      : null);

  return {
    ...core,
    packId: testimonyId || null,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    packCoreHash: packCoreHash || null,
    forensicHash: extra.forensicHash || packCoreHash || null,
    verifyUrl,
    timestamps: {
      ...(core?.timestamps || {}),
      rfc3161: rfc3161 || null,
    },
    disputes: extra.disputes || [],
    auditSnippet: extra.auditSnippet || null,
    verify: {
      instructions: [
        'Open verifyUrl (includes testimony id + ledger hash)',
        'Re-download media from the listed URLs',
        'Compute SHA-256 of each file; compare to hashAfterUpload',
        'Compute SHA-256 of body UTF-8; compare to bodyHash',
        'If rfc3161.tokenBase64 is present, verify offline with your TSA tools',
      ],
    },
  };
}

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/* ============================================================
   Existing create / download helpers
   ============================================================ */

export async function createEvidencePack({
  content,
  bodyHash,
  media = {},
  identity = {},
  channel = 'citizen-talk',
  clientCaptureMs = Date.now(),
  testimonyId = null,
  rfc3161 = null,
  forensicHash = null,
  disputes = [],
  auditSnippet = null,
}) {
  const { core, packCoreHash } = await buildPackCore({
    content,
    bodyHash,
    media,
    identity,
    channel,
    clientCaptureMs,
  });

  const firestorePack = toFirestoreEvidencePack(
    packCoreHash,
    rfc3161,
    clientCaptureMs
  );

  const fullPack = toFullEvidencePack(core, packCoreHash, rfc3161, testimonyId, {
    forensicHash: forensicHash || packCoreHash,
    disputes,
    auditSnippet,
  });

  return {
    firestorePack,
    fullPack,
    packCoreHash,
    core,
  };
}

export function downloadEvidencePack(fullPack, testimonyId) {
  const id = testimonyId || fullPack?.packId || 'unknown';
  const filename = `vocalwitness-evidence-${id}.json`;
  downloadJson(filename, fullPack);
}

/* ============================================================
   Batch 6 — Share links (always include ledger / hash ref)
   ============================================================ */

/**
 * Resolve best integrity hash for links and packs.
 */
export function resolveLedgerHash(testimony = {}) {
  return (
    testimony.forensicHash ||
    testimony.packCoreHash ||
    testimony.evidencePack?.packCoreHash ||
    testimony.imageHash ||
    testimony.audioHash ||
    testimony.bodyHash ||
    null
  );
}

/**
 * Share / verify URL that always carries id + hash when sealed.
 * @param {{ id?: string, testimonyId?: string, forensicHash?: string, packCoreHash?: string }} testimony
 * @param {string} [origin]
 */
export function buildShareUrl(testimony = {}, origin = DEFAULT_ORIGIN) {
  const id = testimony.id || testimony.testimonyId || '';
  const h = resolveLedgerHash(testimony);

  const url = new URL('/verify.html', origin);
  if (id) url.searchParams.set('id', id);
  if (h) url.searchParams.set('h', h);

  // Optional short channel hint for UX only
  if (testimony.targetFeed || testimony.channel) {
    url.searchParams.set(
      'ch',
      testimony.targetFeed || testimony.channel
    );
  }

  return url.toString();
}

/**
 * Copy or native-share a sealed report link.
 */
export async function shareTestimony(testimony, options = {}) {
  const link = buildShareUrl(testimony, options.origin);
  const hash = resolveLedgerHash(testimony);
  const shortHash = hash ? `${hash.slice(0, 12)}…` : 'unsealed';
  const title = testimony.headline || 'VocalWitness sealed report';
  const text =
    options.text ||
    `VocalWitness evidence (${shortHash}). Verify: ${link}`;

  if (!hash && options.requireSealed !== false) {
    console.warn('[share] No ledger hash — link is not fully sealed');
  }

  try {
    if (navigator.share && options.preferNative !== false) {
      await navigator.share({ title, text, url: link });
      return { ok: true, method: 'native', link };
    }
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, method: 'cancelled', link };
  }

  try {
    await navigator.clipboard.writeText(link);
    return { ok: true, method: 'clipboard', link };
  } catch (_) {
    return { ok: false, method: 'none', link };
  }
}

/* ============================================================
   Batch 6 — Newsroom / NGO export
   ============================================================ */

/**
 * Build a newsroom-oriented pack from a Firestore testimony doc (+ optional extras).
 * Does not require rebuild of pack core if testimony already has hashes.
 */
export function buildNewsroomPack(testimony, extras = {}) {
  const id = testimony.id || extras.testimonyId || null;
  const forensicHash = resolveLedgerHash(testimony);
  const verifyUrl = buildShareUrl({ ...testimony, id });

  const media = [];
  if (testimony.imageUrl) {
    media.push({
      role: 'image',
      url: testimony.imageUrl,
      hashAlg: 'SHA-256',
      hashAfterUpload: testimony.imageHash || null,
      exifScrubbed: true,
    });
  }
  if (testimony.audioUrl) {
    media.push({
      role: 'audio',
      url: testimony.audioUrl,
      hashAlg: 'SHA-256',
      hashAfterUpload: testimony.audioHash || null,
    });
  }

  return {
    schemaVersion: SCHEMA,
    packRole: 'newsroom-ngo',
    packId: id,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    verifyUrl,
    testimony: {
      id,
      headline: testimony.headline || null,
      content: testimony.content || testimony.body || '',
      channel: testimony.targetFeed || testimony.channel || null,
      status: testimony.status || null,
      isAnonymous: Boolean(testimony.isAnonymous),
      authorPublic: testimony.isAnonymous
        ? 'Anonymous Witness'
        : testimony.author || testimony.displayName || null,
      region: testimony.region || testimony.city || null,
      createdAt:
        testimony.createdAt?.toDate?.()?.toISOString?.() ||
        testimony.createdAt ||
        null,
    },
    integrity: {
      forensicHash,
      packCoreHash:
        testimony.packCoreHash ||
        testimony.evidencePack?.packCoreHash ||
        null,
      imageHash: testimony.imageHash || null,
      audioHash: testimony.audioHash || null,
      publicNullifier: testimony.publicNullifier || null,
      bodyHash: testimony.bodyHash || null,
    },
    media,
    disputes: extras.disputes || testimony.disputes || [],
    auditSnippet: extras.auditSnippet || null,
    multiSig: extras.multiSig || null,
    verify: {
      instructions: [
        'Open verifyUrl and confirm id + h match the ledger',
        'Re-fetch media URLs and recompute SHA-256',
        'Compare dispute outcomes if present',
        'Treat pack as integrity aid, not proof of real-world events',
      ],
    },
  };
}

/**
 * Download newsroom JSON pack.
 */
export function exportForNewsroom(testimony, extras = {}) {
  const pack = buildNewsroomPack(testimony, extras);
  const id = pack.packId || 'unknown';
  downloadJson(`vocalwitness-newsroom-${id}.json`, pack);
  return pack;
}

/**
 * Optional partner webhook payload (client preview / Functions mirror).
 * Server should POST this; client may only build it for debugging.
 */
export function buildPartnerWebhookPayload(testimony, event = 'testimony.sealed') {
  const id = testimony.id || null;
  const forensicHash = resolveLedgerHash(testimony);
  return {
    event,
    id,
    forensicHash,
    verifyUrl: buildShareUrl({ ...testimony, id }),
    region: testimony.region || testimony.city || null,
    createdAt:
      testimony.createdAt?.toDate?.()?.toISOString?.() ||
      testimony.createdAt ||
      new Date().toISOString(),
    isAnonymous: Boolean(testimony.isAnonymous),
  };
}

if (typeof window !== 'undefined') {
  window.buildShareUrl = buildShareUrl;
  window.shareTestimony = shareTestimony;
  window.exportForNewsroom = exportForNewsroom;
  window.buildNewsroomPack = buildNewsroomPack;
}

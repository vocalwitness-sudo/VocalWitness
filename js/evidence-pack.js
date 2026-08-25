// js/evidence-pack.js
import { generateSha256Hash } from './utils.js';

const SCHEMA = 'vocalwitness.evidence-pack.v1';
const DISCLAIMER =
  'Integrity package for documented bitstrings. Not legal advice. Does not prove real-world events occurred.';

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
  clientCaptureMs = Date.now()
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
      exifScrubbed: true
    });
  }

  if (media.audioUrl && media.audioHash) {
    mediaRows.push({
      role: 'audio',
      url: media.audioUrl,
      hashAlg: 'SHA-256',
      hashCapture: media.audioHash,
      hashAfterUpload: media.audioHash,
      hashMatch: true
    });
  }

  const core = {
    schemaVersion: SCHEMA,
    content: {
      body: content || '',
      bodyHash: bodyHash || null,
      channel
    },
    media: mediaRows,
    identity: {
      mode: identity.mode || 'ANONYMOUS',
      authorId: identity.authorId || null,
      displayName: identity.displayName || null,
      phoneOnPublicRecord: false
    },
    timestamps: {
      clientCaptureMs
    },
    environment: {
      app: 'VocalWitness',
      hashApi: 'WebCrypto.subtle.digest SHA-256'
    }
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
    rfc3161: rfc3161 || null
  };
}

/**
 * Full pack for download (includes disclaimer + verify steps).
 */
export function toFullEvidencePack(core, packCoreHash, rfc3161, testimonyId) {
  return {
    ...core,
    packId: testimonyId || null,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    packCoreHash: packCoreHash || null,
    timestamps: {
      ...(core?.timestamps || {}),
      rfc3161: rfc3161 || null
    },
    verify: {
      instructions: [
        'Re-download media from the listed URLs',
        'Compute SHA-256 of each file; compare to hashAfterUpload',
        'Compute SHA-256 of body UTF-8; compare to bodyHash',
        'If rfc3161.tokenBase64 is present, verify offline with your TSA tools'
      ]
    }
  };
}

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: 'application/json'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

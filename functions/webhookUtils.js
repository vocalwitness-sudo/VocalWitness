// functions/webhookUtils.js
const crypto = require('crypto');

/**
 * Standardized payload structure for external partner webhooks.
 */
function buildPartnerWebhookPayload(testimony) {
  return {
    event: 'TESTIMONY_SEALED',
    timestamp: new Date().toISOString(),
    data: {
      id: testimony.id,
      title: testimony.title || null,
      content: testimony.content || '',
      category: testimony.category || 'uncategorized',
      mediaHash: testimony.mediaHash || null,
      multiSigVerified: testimony.multiSigVerified || false,
      verificationStatus: testimony.verificationStatus || 'UNVERIFIED',
      authorId: testimony.authorId || null,
      createdAt: testimony.createdAt || null,
    },
  };
}

/**
 * Generates an HMAC-SHA256 signature for payload integrity.
 */
function generateHmacSignature(payloadString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

module.exports = {
  buildPartnerWebhookPayload,
  generateHmacSignature,
};

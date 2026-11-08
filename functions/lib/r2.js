/**
 * functions/lib/r2.js
 * Cloudflare R2 (S3-compatible) client helpers
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_ENDPOINT =
  process.env.R2_ENDPOINT ||
  "https://b282f46ef0831c8af75bfe52120bbac6.r2.cloudflarestorage.com";

const DEFAULT_BUCKET = "vocalwitness-media";

let r2ClientInstance = null;

/**
 * Get a singleton R2/S3 client.
 * @param {string} accessKeyId
 * @param {string} secretAccessKey
 */
export function getR2Client(accessKeyId, secretAccessKey) {
  if (!r2ClientInstance) {
    r2ClientInstance = new S3Client({
      region: "auto",
      endpoint: DEFAULT_ENDPOINT,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return r2ClientInstance;
}

/**
 * Create a pre-signed PUT URL for a new object.
 */
export async function createUploadSignedUrl({
  accessKeyId,
  secretAccessKey,
  key,
  contentType,
  bucket = DEFAULT_BUCKET,
  expiresIn = 900,
}) {
  const client = getR2Client(accessKeyId, secretAccessKey);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  const publicUrl = `https://media.vocalwitness.com/${key}`;
  return { uploadUrl, publicUrl, key };
}

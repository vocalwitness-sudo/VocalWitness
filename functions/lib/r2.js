/**
 * functions/lib/r2.js
 * Cloudflare R2 (S3-compatible) client helpers
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_ENDPOINT =
  process.env.R2_ENDPOINT ||
  "https://b282f46ef0831c8af75bfe52120bbac6.r2.cloudflarestorage.com";

const DEFAULT_BUCKET = "vocalwitness-media";

let r2ClientInstance = null;

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

/**
 * Delete an object from R2. Used ONLY for expired pending (never-sealed) media.
 * Never call this for media that belongs to a sealed testimony.
 */
export async function deleteR2Object({
  accessKeyId,
  secretAccessKey,
  key,
  bucket = DEFAULT_BUCKET,
}) {
  if (!key || typeof key !== "string") return false;
  const client = getR2Client(accessKeyId, secretAccessKey);
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  return true;
}

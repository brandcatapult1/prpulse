import { v2 as cloudinary } from 'cloudinary';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

let configured = false;

export function isCloudinaryConfigured() {
  return Boolean(cloudName && apiKey && apiSecret);
}

function ensureConfigured() {
  if (!isCloudinaryConfigured()) {
    throw Object.assign(new Error('Cloudinary is not configured on the server'), { status: 503 });
  }
  if (!configured) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    configured = true;
  }
}

/** Upload a proof screenshot buffer to Cloudinary; returns the hosted HTTPS URL. */
export async function uploadProofScreenshot(buffer, { filename, mimeType } = {}) {
  ensureConfigured();
  if (!buffer?.length) {
    throw Object.assign(new Error('Empty file'), { status: 400 });
  }

  const publicIdBase = (filename ?? 'proof')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 80) || 'proof';

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'pr-pulse/proof-screenshots',
        resource_type: 'image',
        public_id: `${publicIdBase}-${Date.now()}`,
        overwrite: false,
      },
      (error, uploadResult) => {
        if (error) reject(error);
        else resolve(uploadResult);
      },
    );
    stream.end(buffer);
  });

  if (!result?.secure_url) {
    throw Object.assign(new Error('Cloudinary upload did not return a URL'), { status: 502 });
  }

  return {
    url: result.secure_url,
    public_id: result.public_id,
    bytes: result.bytes,
    format: result.format,
    mimeType: mimeType ?? null,
  };
}

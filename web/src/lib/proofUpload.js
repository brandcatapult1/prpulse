/** Upload a proof screenshot via the server to Cloudinary (never send base64 in JSON). */
export async function uploadProofScreenshot(engagementId, file) {
  if (!engagementId) {
    throw new Error('Engagement is required to upload proof');
  }
  if (!file) {
    throw new Error('No file selected');
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`/api/engagements/${engagementId}/proof-screenshots`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Could not upload screenshot');
  }

  return res.json();
}

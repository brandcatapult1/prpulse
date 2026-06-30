export const PROFILE_LINK_REQUIRED_ERROR =
  'Add at least one profile link — Instagram or YouTube';

export function hasProfileLink(instagramLink, youtubeLink) {
  return Boolean(String(instagramLink ?? '').trim()) || Boolean(String(youtubeLink ?? '').trim());
}

export function profileLinkError(instagramLink, youtubeLink) {
  return hasProfileLink(instagramLink, youtubeLink) ? null : PROFILE_LINK_REQUIRED_ERROR;
}

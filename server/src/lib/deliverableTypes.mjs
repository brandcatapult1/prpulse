/** Map UI deliverable type slugs ↔ Postgres deliverable_type enum. */

const UI_TO_DB = {
  reel: 'reel',
  story: 'story',
  post: 'other',
  carousel: 'static_carousel_post',
  static_carousel_post: 'static_carousel_post',
  other: 'other',
};

const DB_TO_UI = {
  reel: 'reel',
  story: 'story',
  static_carousel_post: 'carousel',
  other: 'post',
};

export function deliverableTypeToDb(uiType) {
  const key = String(uiType ?? '').toLowerCase();
  return UI_TO_DB[key] ?? 'other';
}

export function deliverableTypeFromDb(dbType) {
  return DB_TO_UI[dbType] ?? dbType;
}

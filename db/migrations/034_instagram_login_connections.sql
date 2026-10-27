-- Creator connections now use Instagram Login (Instagram-issued tokens) instead of Facebook Login.
-- Existing rows hold Facebook tokens that the new flow cannot use, so they are cleared; creators
-- re-approve through the new request link. Requests (history) are kept.
DELETE FROM creator_instagram_connections;

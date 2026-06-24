-- Remove premature contact_replied activity rows from the old Replied-click-before-commit flow.
-- Safe to re-run: only deletes rows followed by another activity on the same engagement within 2 hours.

DELETE FROM activity_events premature
WHERE premature.action = 'contact_replied'
  AND EXISTS (
    SELECT 1
    FROM activity_events followup
    WHERE followup.engagement_id = premature.engagement_id
      AND followup.id <> premature.id
      AND followup.occurred_at > premature.occurred_at
      AND followup.occurred_at <= premature.occurred_at + interval '2 hours'
  );

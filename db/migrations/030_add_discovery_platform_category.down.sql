-- Remove the "Discovery Platform" category. Contacts referencing it fall back
-- to NULL via the ON DELETE SET NULL foreign key on primary_category_id.
DELETE FROM categories WHERE name = 'Discovery Platform';

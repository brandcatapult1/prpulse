CREATE TABLE contact_secondary_categories (
  contact_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, category_id)
);

CREATE INDEX idx_contact_seccat_cat ON contact_secondary_categories (category_id);

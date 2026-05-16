-- Add contact person and email fields to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS contact_email text;

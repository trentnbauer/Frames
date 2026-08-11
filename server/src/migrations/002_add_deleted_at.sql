-- Soft-delete: Library's delete is a mistake-prone irreversible action
-- otherwise (removes the original file too). Trashed photos are hidden
-- from every normal listing/join until restored or permanently deleted.
ALTER TABLE photos ADD COLUMN deleted_at TEXT;

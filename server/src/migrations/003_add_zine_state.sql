-- Zine Creator: lets a user save in-progress layout/settings and resume later.
-- Stored as an opaque JSON blob (client-serialized) rather than normalized
-- columns, since the shape is editor state, not queryable domain data.
ALTER TABLE ideas ADD COLUMN zine_state TEXT;

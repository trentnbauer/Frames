-- Vision tagging failures were only ever logged server-side; a bad API key
-- looked identical in the UI to "the model found nothing to tag." Stores
-- the actual provider error so it can be shown to the user.
ALTER TABLE photos ADD COLUMN tagging_error TEXT;

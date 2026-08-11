-- The dominant-color-tag marker moved from the plain phrase 'dominant
-- color' to 'auto:dominant-color' — a user can freely edit a tag's note
-- (the correction-path UI), and a real note that happens to say "dominant
-- color" (plausible: describing what a photo shows) would otherwise
-- silently mark a genuine AI-suggested tag as auto-confirmed. Existing
-- rows already using the old marker need to move to the new one so they
-- don't lose their color-tag classification.
UPDATE photo_tags SET note = 'auto:dominant-color' WHERE note = 'dominant color';

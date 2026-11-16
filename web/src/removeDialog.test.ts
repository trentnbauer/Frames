import { describe, expect, it, vi } from 'vitest';
import { Logic as PhotoLogic } from './proto/ProtoPhoto.logic';
import { Logic as ReviewLogic } from './proto/ProtoReview.logic';

// Removing from Frames never touches the original, so no dialog may offer to trash or delete it.
describe('remove dialogs', () => {
  for (const [name, L] of [['photo', PhotoLogic], ['review', ReviewLogic]] as const) {
    it(`${name}: offers only removal from Frames, says the original is kept and not re-imported`, () => {
      const logic = new L();
      logic.props = { onDelete: vi.fn(), inComps: [], tags: [] };
      const v: any = logic.renderVals();
      const opts = v?.delOpts ?? [];
      expect(opts).toHaveLength(1);
      expect(opts[0].label).toBe('Remove from Frames');
      expect(opts[0].hint).toMatch(/isn’t touched.*won’t be imported again/);
      expect(JSON.stringify(opts)).not.toMatch(/trash/i);
    });
  }
});

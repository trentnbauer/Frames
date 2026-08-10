export type NudgeType = 'idle_idea' | 'stalled' | 'ready_to_finish';

export interface Nudge {
  type: NudgeType;
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const IDLE_IDEA_DAYS = 7;
const STALLED_DAYS = 14;
const READY_PHOTO_COUNT = 8;

export interface NudgeInput {
  status: string;
  photoCount: number;
  createdAt: string;
  lastActivity: string | null;
}

// Pure so it's cheap to unit test — only 'active' ideas ever get a nudge;
// done/archived ones are left alone. Checked in priority order: an idea
// ready to wrap up is worth surfacing even if it's technically also stalled.
export function deriveNudge(input: NudgeInput, now: Date = new Date()): Nudge | null {
  if (input.status !== 'active') return null;

  const daysSinceCreated = (now.getTime() - new Date(input.createdAt).getTime()) / DAY_MS;

  if (input.photoCount === 0) {
    if (daysSinceCreated < IDLE_IDEA_DAYS) return null;
    const days = Math.floor(daysSinceCreated);
    return { type: 'idle_idea', message: `Still just an idea after ${days} day${days === 1 ? '' : 's'} — add a frame, or archive it.` };
  }

  if (input.photoCount >= READY_PHOTO_COUNT) {
    return { type: 'ready_to_finish', message: `${input.photoCount} frames captured — ready to mark this finished?` };
  }

  const lastActivityMs = input.lastActivity ? new Date(input.lastActivity).getTime() : new Date(input.createdAt).getTime();
  const daysSinceActivity = (now.getTime() - lastActivityMs) / DAY_MS;
  if (daysSinceActivity >= STALLED_DAYS) {
    const days = Math.floor(daysSinceActivity);
    return { type: 'stalled', message: `No new frames in ${days} days — still chasing this one?` };
  }

  return null;
}

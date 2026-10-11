import type { NextRequest } from 'next/server';

import { ownerAction } from '@/lib/cells/action-route';
import { bangkokDate, CellError, resolveCell } from '@/lib/cells/core';
import { HabitsClient } from '@/lib/cells/habits';

export const dynamic = 'force-dynamic';

/** POST { habit_id, completed }: log (or unlog) today for one habit. The server picks the date (Asia/Bangkok). */
export function POST(request: NextRequest) {
  return ownerAction(request, async (body, env) => {
    const { habit_id: habitId, completed } = body;
    if (typeof habitId !== 'number' || !Number.isInteger(habitId) || habitId <= 0 || typeof completed !== 'boolean') {
      throw new CellError('invalid', 'habits');
    }
    const date = bangkokDate();
    await new HabitsClient(resolveCell('habits', env)).setLog(habitId, date, completed);
    return { habit_id: habitId, date, completed };
  });
}

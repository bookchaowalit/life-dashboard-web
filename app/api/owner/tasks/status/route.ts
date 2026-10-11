import type { NextRequest } from 'next/server';

import { ownerAction } from '@/lib/cells/action-route';
import { CellError, resolveCell } from '@/lib/cells/core';
import { TASK_STATUSES, TasksClient, type TaskStatus } from '@/lib/cells/tasks';

export const dynamic = 'force-dynamic';

/** POST { number, status }: change one task's status (done goes through the complete endpoint). */
export function POST(request: NextRequest) {
  return ownerAction(request, async (body, env) => {
    const { number, status } = body;
    if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0 || typeof status !== 'string'
      || !(TASK_STATUSES as readonly string[]).includes(status)) throw new CellError('invalid', 'tasks');
    await new TasksClient(resolveCell('tasks', env)).setStatus(number, status as TaskStatus);
    return { number, status };
  });
}

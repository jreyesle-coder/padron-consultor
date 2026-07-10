// Native stub — sync queue is web-only.
// Metro resolves lib/sync-queue.web.ts on web automatically.

export type MutationType = 'insert' | 'update' | 'delete';
export type MutationStatus = 'pending' | 'error' | 'conflict';

export type PendingMutation = {
  id: string;
  table: string;
  operation: MutationType;
  payload: Record<string, unknown>;
  /** Column→value pairs used in .eq() for update/delete */
  filter?: Record<string, unknown>;
  /** Human-readable label shown in sync UI */
  label: string;
  /** ISO timestamp of row's updated_at at capture time — for optimistic concurrency */
  capturedUpdatedAt?: string;
  status: MutationStatus;
  /** Current server state, populated when status === 'conflict' */
  serverState?: Record<string, unknown>;
  createdAt: number;
  retries: number;
  lastError?: string;
};

/** Build an IndexedDB namespace key for a given user+org combo. */
export function buildNamespace(userId: string, orgId: number | null): string {
  return `${userId}_${orgId ?? 0}`;
}

// All functions are no-ops on native
export async function getQueue(_ns: string): Promise<PendingMutation[]> { return []; }
export async function enqueue(
  _ns: string,
  _m: Omit<PendingMutation, 'id' | 'createdAt' | 'retries' | 'status'>
): Promise<void> {}
export async function dequeue(_ns: string, _id: string): Promise<void> {}
export async function markError(_ns: string, _id: string, _error: string): Promise<void> {}
export async function markConflict(
  _ns: string, _id: string, _serverState: Record<string, unknown>
): Promise<void> {}
export async function resolveConflict(
  _ns: string,
  _id: string,
  _action: 'apply' | 'discard' | 'edit',
  _editedPayload?: Record<string, unknown>
): Promise<void> {}
export async function getForeignQueues(
  _currentNs: string
): Promise<Array<{ ns: string; count: number }>> { return []; }
export function notifyQueueChanged(): void {}

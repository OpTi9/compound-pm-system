export const TASK_STATUSES = ["backlog", "in_progress", "done"] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ["low", "medium", "high"] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export function normalizeTaskStatus(input: unknown): TaskStatus | null {
  if (typeof input !== "string") return null
  const v = input.trim()
  return (TASK_STATUSES as readonly string[]).includes(v) ? (v as TaskStatus) : null
}

export function normalizeTaskPriority(input: unknown): TaskPriority | null {
  if (typeof input !== "string") return null
  const v = input.trim()
  return (TASK_PRIORITIES as readonly string[]).includes(v) ? (v as TaskPriority) : null
}

export const WORK_ITEM_STATUSES = ["QUEUED", "CLAIMED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number]

export function normalizeWorkItemStatus(input: unknown): WorkItemStatus | null {
  if (typeof input !== "string") return null
  const v = input.trim().toUpperCase()
  return (WORK_ITEM_STATUSES as readonly string[]).includes(v) ? (v as WorkItemStatus) : null
}

export const PRD_STATUSES = ["DRAFT", "DECOMPOSING", "ACTIVE", "COMPLETED"] as const
export type PrdStatus = (typeof PRD_STATUSES)[number]

export function normalizePrdStatus(input: unknown): PrdStatus | null {
  if (typeof input !== "string") return null
  const v = input.trim().toUpperCase()
  return (PRD_STATUSES as readonly string[]).includes(v) ? (v as PrdStatus) : null
}


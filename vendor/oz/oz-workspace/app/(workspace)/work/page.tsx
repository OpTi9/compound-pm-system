"use client"

import * as React from "react"
import Link from "next/link"
import { useRoomStore } from "@/lib/stores"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type PrdSummary = {
  id: string
  title: string
  status: string
  roomId: string
  createdAt: string
  updatedAt: string
}

type PrdDetail = PrdSummary & {
  content: string
  progress?: {
    tasks_total: number
    tasks_succeeded: number
    reviews_in_flight: number
  }
}

type WorkItem = {
  id: string
  type: string
  status: string
  chainId: string | null
  sourceItemId: string | null
  iteration: number
  maxIterations: number
  roomId: string | null
  agentId: string | null
  epicId?: string | null
  runId: string | null
  attempts: number
  maxAttempts: number
  lastError: string | null
  claimedAt: string | null
  leaseExpiresAt: string | null
  createdAt: string
  updatedAt: string
  room?: { id: string; name: string } | null
  agent?: { id: string; name: string; color: string; icon: string } | null
  epic?: { id: string; title: string; order: number; status: string; prdId: string } | null
}

type KnowledgeItem = {
  id: string
  roomId: string
  kind: string
  title: string
  content: string
  tags?: string[]
  sourcePrdId: string | null
  sourceWorkItemId: string | null
  createdAt: string
  updatedAt: string
  createdByAgent?: { id: string; name: string; color: string; icon: string } | null
}

type OrchestratorHealth = {
  now: string
  heartbeat: { last_tick_at: string | null; age_ms: number | null }
  queue: { by_status: Record<string, number>; oldest_queued_age_ms: number | null; stuck_running_count: number }
}

type WorkItemDetail = {
  id: string
  type: string
  status: string
  payload: string
  chainId: string | null
  sourceItemId: string | null
  iteration: number
  maxIterations: number
  roomId: string | null
  agentId: string | null
  epicId: string | null
  sourceTaskId: string | null
  claimedAt: string | null
  leaseExpiresAt: string | null
  runId: string | null
  attempts: number
  maxAttempts: number
  lastError: string | null
  createdAt: string
  updatedAt: string
  room?: { id: string; name: string } | null
  agent?: { id: string; name: string; color: string; icon: string } | null
  epic?: { id: string; title: string; order: number; status: string; prdId: string } | null
}

type WorkItemOutput = {
  runId: string | null
  message: { id: string; content: string; sessionUrl: string | null; timestamp: string; authorId: string | null; authorType: string } | null
  run: { id: string; state: string; errorMessage: string | null; queuedAt: string; startedAt: string | null; completedAt: string | null; updatedAt: string } | null
}

async function fetchJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    return { ok: false, status: res.status, error: body || res.statusText }
  }
  return { ok: true, data: await res.json() }
}

function badgeVariantForStatus(status: string): React.ComponentProps<typeof Badge>["variant"] {
  const s = (status || "").toUpperCase()
  if (s === "SUCCEEDED" || s === "COMPLETED" || s === "ACTIVE") return "secondary"
  if (s === "FAILED" || s === "CANCELLED") return "destructive"
  if (s === "RUNNING" || s === "CLAIMED" || s === "DECOMPOSING") return "outline"
  return "ghost"
}

function fmtShort(ts: string | null | undefined) {
  if (!ts) return ""
  try {
    const d = new Date(ts)
    return d.toLocaleString()
  } catch {
    return ts
  }
}

function firstLine(text: string | null | undefined) {
  const t = (text || "").trim()
  if (!t) return ""
  return t.split(/\r?\n/, 1)[0] || ""
}

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function fmtDurationMs(ms: number | null | undefined) {
  if (!ms || ms <= 0) return ""
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60 ? ` ${m % 60}m` : ""}`
}

export default function WorkPage() {
  const { rooms, fetchRooms } = useRoomStore()
  const [roomId, setRoomId] = React.useState<string>("")

  const [prds, setPrds] = React.useState<PrdSummary[]>([])
  const [selectedPrdId, setSelectedPrdId] = React.useState<string>("")
  const [prdDetail, setPrdDetail] = React.useState<PrdDetail | null>(null)
  const [workItems, setWorkItems] = React.useState<WorkItem[]>([])
  const [knowledge, setKnowledge] = React.useState<KnowledgeItem[]>([])
  const [orch, setOrch] = React.useState<OrchestratorHealth | null>(null)
  const [roomRunning, setRoomRunning] = React.useState<WorkItem[]>([])

  const [workItemOpen, setWorkItemOpen] = React.useState(false)
  const [workItemDetail, setWorkItemDetail] = React.useState<WorkItemDetail | null>(null)
  const [workItemOutput, setWorkItemOutput] = React.useState<WorkItemOutput | null>(null)

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [newPrdOpen, setNewPrdOpen] = React.useState(false)
  const [newPrdTitle, setNewPrdTitle] = React.useState("")
  const [newPrdContent, setNewPrdContent] = React.useState("")

  const [enqueueOpen, setEnqueueOpen] = React.useState(false)
  const [enqueueAgentId, setEnqueueAgentId] = React.useState("")
  const [enqueuePrompt, setEnqueuePrompt] = React.useState("")

  const [addKnowledgeOpen, setAddKnowledgeOpen] = React.useState(false)
  const [knowledgeKind, setKnowledgeKind] = React.useState("learning")
  const [knowledgeTitle, setKnowledgeTitle] = React.useState("")
  const [knowledgeContent, setKnowledgeContent] = React.useState("")
  const [knowledgeTags, setKnowledgeTags] = React.useState("")

  React.useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  React.useEffect(() => {
    if (roomId) return
    const first = rooms[0]?.id
    if (first) setRoomId(first)
  }, [rooms, roomId])

  const room = rooms.find((r) => r.id === roomId) || null
  const roomAgents = (room?.agents || [])
    .filter((a) => a && typeof a.id === "string")

  const defaultImplAgentId = React.useMemo(() => {
    const pick = roomAgents.find((a) => {
      const n = (a.name || "").toLowerCase()
      return n !== "rex" && n !== "avery"
    })
    return pick?.id || ""
  }, [roomAgents])

  const refreshPrds = React.useCallback(async () => {
    if (!roomId) return
    const res = await fetchJson<{ items: PrdSummary[] }>(`/api/prds?roomId=${encodeURIComponent(roomId)}`)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setPrds(res.data.items)
  }, [roomId])

  const refreshPrdDetail = React.useCallback(async (id: string) => {
    const res = await fetchJson<PrdDetail>(`/api/prds/${encodeURIComponent(id)}`)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setPrdDetail(res.data)
  }, [])

  const refreshWorkItems = React.useCallback(async (chainId: string) => {
    const res = await fetchJson<{ items: WorkItem[] }>(`/api/work-items?chainId=${encodeURIComponent(chainId)}&limit=500`)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setWorkItems(res.data.items)
  }, [])

  const refreshKnowledge = React.useCallback(async (opts: { roomId: string; prdId?: string }) => {
    const qs = new URLSearchParams({ roomId: opts.roomId, limit: "200" })
    if (opts.prdId) qs.set("sourcePrdId", opts.prdId)
    const res = await fetchJson<{ items: KnowledgeItem[] }>(`/api/knowledge?${qs.toString()}`)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setKnowledge(res.data.items)
  }, [])

  const refreshOrchestrator = React.useCallback(async () => {
    if (!roomId) return
    const res = await fetchJson<OrchestratorHealth>(`/api/orchestrator/health?roomId=${encodeURIComponent(roomId)}`)
    if (!res.ok) return
    setOrch(res.data)

    const running = await fetchJson<{ items: WorkItem[] }>(`/api/work-items?roomId=${encodeURIComponent(roomId)}&status=RUNNING&limit=200`)
    if (running.ok) setRoomRunning(running.data.items)
  }, [roomId])

  React.useEffect(() => {
    setPrds([])
    setSelectedPrdId("")
    setPrdDetail(null)
    setWorkItems([])
    setKnowledge([])
    setOrch(null)
    setRoomRunning([])
    setError(null)
    if (!roomId) return
    refreshPrds().catch(() => {})
    refreshOrchestrator().catch(() => {})
  }, [roomId, refreshPrds, refreshOrchestrator])

  React.useEffect(() => {
    setPrdDetail(null)
    setWorkItems([])
    setKnowledge([])
    setError(null)
    if (!selectedPrdId) return
    refreshPrdDetail(selectedPrdId).catch(() => {})
    refreshWorkItems(selectedPrdId).catch(() => {})
    refreshKnowledge({ roomId, prdId: selectedPrdId }).catch(() => {})
  }, [selectedPrdId, refreshPrdDetail, refreshWorkItems, refreshKnowledge, roomId])

  React.useEffect(() => {
    if (!roomId) return
    const id = window.setInterval(() => {
      refreshOrchestrator().catch(() => {})
    }, 10_000)
    return () => window.clearInterval(id)
  }, [roomId, refreshOrchestrator])

  const handleCreatePrd = async () => {
    if (!roomId || !newPrdTitle.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/prds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, title: newPrdTitle.trim(), content: newPrdContent }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      const created = await res.json() as PrdSummary
      setNewPrdOpen(false)
      setNewPrdTitle("")
      setNewPrdContent("")
      await refreshPrds()
      setSelectedPrdId(created.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create PRD")
    } finally {
      setBusy(false)
    }
  }

  const handleDecompose = async () => {
    if (!selectedPrdId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/prds/${encodeURIComponent(selectedPrdId)}/decompose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultAgentId: defaultImplAgentId || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      await refreshPrdDetail(selectedPrdId)
      await refreshWorkItems(selectedPrdId)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to decompose PRD")
    } finally {
      setBusy(false)
    }
  }

  const handleEnqueueTask = async () => {
    if (!roomId || !selectedPrdId) return
    if (!enqueueAgentId || !enqueuePrompt.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          agentId: enqueueAgentId,
          prompt: enqueuePrompt,
          type: "task",
          chainId: selectedPrdId,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      setEnqueueOpen(false)
      setEnqueuePrompt("")
      await refreshWorkItems(selectedPrdId)
      await refreshPrdDetail(selectedPrdId)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enqueue task")
    } finally {
      setBusy(false)
    }
  }

  const requeueItem = async (id: string) => {
    if (!selectedPrdId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/work-items/${encodeURIComponent(id)}/requeue`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      await refreshWorkItems(selectedPrdId)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to requeue")
    } finally {
      setBusy(false)
    }
  }

  const cancelItem = async (id: string) => {
    if (!selectedPrdId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/work-items/${encodeURIComponent(id)}/cancel`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      await refreshWorkItems(selectedPrdId)
      await refreshPrdDetail(selectedPrdId)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel")
    } finally {
      setBusy(false)
    }
  }

  const handleAddKnowledge = async () => {
    if (!roomId) return
    if (!knowledgeTitle.trim() || !knowledgeContent.trim()) return
    setBusy(true)
    setError(null)
    try {
      const tags = knowledgeTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)

      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          kind: knowledgeKind,
          title: knowledgeTitle.trim(),
          content: knowledgeContent,
          tags,
          sourcePrdId: selectedPrdId || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }))
        throw new Error(body.error || `Failed (${res.status})`)
      }

      setAddKnowledgeOpen(false)
      setKnowledgeKind("learning")
      setKnowledgeTitle("")
      setKnowledgeContent("")
      setKnowledgeTags("")
      await refreshKnowledge({ roomId, prdId: selectedPrdId || undefined })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add knowledge")
    } finally {
      setBusy(false)
    }
  }

  const deleteKnowledge = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/knowledge/${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      await refreshKnowledge({ roomId, prdId: selectedPrdId || undefined })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete knowledge")
    } finally {
      setBusy(false)
    }
  }

  const cancelItemNoChain = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/work-items/${encodeURIComponent(id)}/cancel`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      refreshOrchestrator().catch(() => {})
      if (selectedPrdId) refreshWorkItems(selectedPrdId).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel")
    } finally {
      setBusy(false)
    }
  }

  const requeueItemNoChain = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/work-items/${encodeURIComponent(id)}/requeue`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }))
        throw new Error(body.error || `Failed (${res.status})`)
      }
      refreshOrchestrator().catch(() => {})
      if (selectedPrdId) refreshWorkItems(selectedPrdId).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to requeue")
    } finally {
      setBusy(false)
    }
  }

  const openWorkItem = async (id: string) => {
    setWorkItemOpen(true)
    setWorkItemDetail(null)
    setWorkItemOutput(null)
    setError(null)
    try {
      const detail = await fetchJson<WorkItemDetail>(`/api/work-items/${encodeURIComponent(id)}`)
      if (!detail.ok) throw new Error(detail.error)
      setWorkItemDetail(detail.data)

      const out = await fetchJson<WorkItemOutput>(`/api/work-items/${encodeURIComponent(id)}/output`)
      if (out.ok) setWorkItemOutput(out.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load work item")
    }
  }

  const groupedWork = React.useMemo(() => {
    const groups = new Map<string, { key: string; title: string; order: number; items: WorkItem[] }>()
    for (const w of workItems) {
      const key = (w.epicId || "").trim() || "__ungrouped__"
      const epicTitle = (w.epic?.title || "").trim()
      const title = epicTitle || (key === "__ungrouped__" ? "Ungrouped" : "Epic")
      const order = key === "__ungrouped__" ? Number.MAX_SAFE_INTEGER : (typeof w.epic?.order === "number" ? w.epic.order : 0)

      const g = groups.get(key) || { key, title, order, items: [] }
      g.items.push(w)
      // If we first saw an item without epic populated but later have it, prefer the richer data.
      if (key !== "__ungrouped__" && epicTitle && g.title !== epicTitle) g.title = epicTitle
      if (key !== "__ungrouped__" && typeof w.epic?.order === "number") g.order = w.epic.order
      groups.set(key, g)
    }

    const out = Array.from(groups.values())
    out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title) || a.key.localeCompare(b.key))
    return out
  }, [workItems])

  const stuckItems = React.useMemo(() => {
    const nowMs = Date.now()
    const thresholdMs = 30 * 60_000
    const stuck = roomRunning
      .map((w) => {
        const claimedAtMs = w.claimedAt ? new Date(w.claimedAt).getTime() : 0
        const ageMs = claimedAtMs ? Math.max(0, nowMs - claimedAtMs) : 0
        return { w, ageMs }
      })
      .filter((x) => x.ageMs > thresholdMs)
    stuck.sort((a, b) => b.ageMs - a.ageMs)
    return stuck.slice(0, 12)
  }, [roomRunning])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 items-center justify-between gap-2 border-b px-4">
        <h1 className="text-sm font-semibold">Work</h1>
        <div className="flex items-center gap-2">
          <div className="w-[220px]">
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-7 text-xs" onClick={() => setNewPrdOpen(true)} disabled={!roomId || busy}>
            New PRD
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refreshPrds()} disabled={!roomId || busy}>
            Refresh
          </Button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[320px_1fr] overflow-hidden">
        <div className="border-r">
          <ScrollArea className="h-full">
            <div className="p-3">
              <div className="text-xs font-medium text-muted-foreground">PRDs</div>
              <div className="mt-2 space-y-2">
                {prds.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No PRDs yet.</div>
                ) : (
                  prds.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={[
                        "w-full rounded-md border px-3 py-2 text-left transition-colors",
                        selectedPrdId === p.id ? "bg-muted" : "hover:bg-muted/50",
                      ].join(" ")}
                      onClick={() => setSelectedPrdId(p.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-xs font-medium">{p.title}</div>
                        <Badge variant={badgeVariantForStatus(p.status)}>{p.status}</Badge>
                      </div>
                      <div className="mt-1 text-[0.625rem] text-muted-foreground">
                        Updated {fmtShort(p.updatedAt)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {orch && (
                <Card>
                  <CardHeader>
                    <CardTitle>Orchestrator</CardTitle>
                    <CardDescription className="text-xs">
                      {orch.heartbeat.last_tick_at
                        ? `Last tick ${Math.round((orch.heartbeat.age_ms || 0) / 1000)}s ago`
                        : "No heartbeat yet"}
                      {orch.queue.oldest_queued_age_ms != null ? ` · Oldest queued ${fmtDurationMs(orch.queue.oldest_queued_age_ms)}` : ""}
                      {orch.queue.stuck_running_count ? ` · Stuck running ${orch.queue.stuck_running_count}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(orch.queue.by_status || {}).map(([k, v]) => (
                        <Badge key={k} variant="outline">{k}:{v}</Badge>
                      ))}
                    </div>

                    {stuckItems.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium">Stuck Items (RUNNING &gt; 30m)</div>
                        <div className="space-y-2">
                          {stuckItems.map(({ w, ageMs }) => (
                            <div
                              key={w.id}
                              className="rounded-md border p-3 cursor-pointer hover:bg-muted/30"
                              role="button"
                              tabIndex={0}
                              onClick={() => openWorkItem(w.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") openWorkItem(w.id)
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium">{w.type}</span>
                                    <Badge variant={badgeVariantForStatus(w.status)}>{w.status}</Badge>
                                    <span className="text-[0.625rem] text-muted-foreground">{fmtDurationMs(ageMs)}</span>
                                  </div>
                                  <div className="mt-1 text-[0.625rem] text-muted-foreground">
                                    {w.agent?.name ? `Agent: ${w.agent.name}` : (w.agentId ? `Agent: ${w.agentId}` : "Agent: -")}
                                    {" · "}
                                    Claimed {fmtShort(w.claimedAt)}
                                    {w.runId ? ` · run ${w.runId}` : ""}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 text-xs"
                                    disabled={busy}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      cancelItemNoChain(w.id)
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {error && (
                <Card size="sm" className="border-destructive/30">
                  <CardHeader>
                    <CardTitle className="text-sm">Error</CardTitle>
                    <CardDescription className="text-xs">{error}</CardDescription>
                  </CardHeader>
                </Card>
              )}

              {!prdDetail ? (
                <div className="text-xs text-muted-foreground">Select a PRD to view its work chain.</div>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>{prdDetail.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant={badgeVariantForStatus(prdDetail.status)}>{prdDetail.status}</Badge>
                        {prdDetail.progress && (
                          <span className="text-xs text-muted-foreground">
                            Tasks {prdDetail.progress.tasks_succeeded}/{prdDetail.progress.tasks_total}
                            {prdDetail.progress.reviews_in_flight ? `, Reviews in flight: ${prdDetail.progress.reviews_in_flight}` : ""}
                          </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={busy || prdDetail.status !== "DRAFT"}
                          onClick={handleDecompose}
                        >
                          Decompose (Avery)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={busy}
                          onClick={() => {
                            setEnqueueAgentId(defaultImplAgentId || "")
                            setEnqueuePrompt("")
                            setEnqueueOpen(true)
                          }}
                        >
                          Enqueue Task
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={busy}
                          onClick={() => {
                            refreshPrdDetail(prdDetail.id)
                            refreshWorkItems(prdDetail.id)
                            refreshKnowledge({ roomId, prdId: prdDetail.id })
                            refreshOrchestrator()
                          }}
                        >
                          Refresh Chain
                        </Button>
                        {orch?.heartbeat?.last_tick_at && (
                          <Badge variant="outline" className="h-7 text-[0.625rem] leading-6">
                            Orch tick {Math.round((orch.heartbeat.age_ms || 0) / 1000)}s ago
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={busy}
                          onClick={() => {
                            setKnowledgeKind("learning")
                            setKnowledgeTitle("")
                            setKnowledgeContent("")
                            setKnowledgeTags("")
                            setAddKnowledgeOpen(true)
                          }}
                        >
                          Add Knowledge
                        </Button>
                        <div className="flex-1" />
                        {prdDetail.roomId && (
                          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                            <Link href={`/room/${prdDetail.roomId}`}>Open Room</Link>
                          </Button>
                        )}
                      </div>

                      <Separator />

                      <div>
                        <div className="text-xs font-medium">PRD Content</div>
                        <pre className="mt-2 max-h-[240px] overflow-auto rounded-md border bg-muted/30 p-3 text-[0.6875rem] leading-relaxed whitespace-pre-wrap">
                          {prdDetail.content || "(empty)"}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Work Chain</CardTitle>
                      <CardDescription>
                        {workItems.length} item(s)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {workItems.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No work items yet for this PRD.</div>
                      ) : (
                        <div className="space-y-4">
                          {groupedWork.map((g) => (
                            <div key={g.key}>
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="text-xs font-medium">{g.key === "__ungrouped__" ? "Ungrouped" : `Epic: ${g.title}`}</div>
                                <div className="text-[0.625rem] text-muted-foreground">{g.items.length} item(s)</div>
                              </div>
                              <div className="space-y-2">
                                {g.items.map((w) => (
                                  <div
                                    key={w.id}
                                    className="rounded-md border p-3 cursor-pointer hover:bg-muted/30"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openWorkItem(w.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") openWorkItem(w.id)
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium">{w.type}</span>
                                          <Badge variant={badgeVariantForStatus(w.status)}>{w.status}</Badge>
                                          {w.type === "task" || w.type === "review" ? (
                                            <span className="text-[0.625rem] text-muted-foreground">
                                              iter {w.iteration}/{w.maxIterations}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="mt-1 text-[0.625rem] text-muted-foreground">
                                          {w.agent?.name ? `Agent: ${w.agent.name}` : (w.agentId ? `Agent: ${w.agentId}` : "Agent: -")}
                                          {" · "}
                                          Created {fmtShort(w.createdAt)}
                                          {w.runId ? ` · run ${w.runId}` : ""}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {["FAILED", "CANCELLED"].includes(w.status) && (
                                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={(e) => { e.stopPropagation(); requeueItem(w.id) }}>
                                            Requeue
                                          </Button>
                                        )}
                                        {["QUEUED", "CLAIMED", "RUNNING"].includes(w.status) && (
                                          <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={busy} onClick={(e) => { e.stopPropagation(); cancelItem(w.id) }}>
                                            Cancel
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                              {w.lastError && (
                                      <div className="mt-2 rounded-md bg-destructive/5 p-2 text-[0.6875rem] text-destructive">
                                        {firstLine(w.lastError)}
                                      </div>
                                    )}
                                    {w.leaseExpiresAt && ["CLAIMED", "RUNNING"].includes(w.status) && (
                                      <div className="mt-2 text-[0.625rem] text-muted-foreground">
                                        Lease expires {fmtShort(w.leaseExpiresAt)}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Knowledge</CardTitle>
                      <CardDescription>
                        {knowledge.length} item(s) {selectedPrdId ? "(from this PRD)" : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {knowledge.length === 0 ? (
                        <div className="text-xs text-muted-foreground">
                          No knowledge items yet. When a PRD completes, Avery will auto-extract learnings. You can also add items manually.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {knowledge.map((k) => (
                            <div key={k.id} className="rounded-md border p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">{(k.kind || "learning").toUpperCase()}</Badge>
                                    <span className="truncate text-xs font-medium">{k.title}</span>
                                  </div>
                                  {k.createdByAgent?.name && (
                                    <div className="mt-1 text-[0.625rem] text-muted-foreground">
                                      By {k.createdByAgent.name} · Updated {fmtShort(k.updatedAt)}
                                    </div>
                                  )}
                                </div>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => deleteKnowledge(k.id)}>
                                  Delete
                                </Button>
                              </div>
                              <pre className="mt-2 max-h-[180px] overflow-auto rounded-md bg-muted/30 p-2 text-[0.6875rem] leading-relaxed whitespace-pre-wrap">
                                {k.content}
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <Dialog open={newPrdOpen} onOpenChange={setNewPrdOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>New PRD</DialogTitle>
            <DialogDescription>
              Create a PRD for the selected room. Then run Decompose to fan out tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium">Title</div>
              <Input value={newPrdTitle} onChange={(e) => setNewPrdTitle(e.target.value)} placeholder="PRD title" />
            </div>
            <div>
              <div className="text-xs font-medium">Content (Markdown)</div>
              <Textarea value={newPrdContent} onChange={(e) => setNewPrdContent(e.target.value)} rows={10} placeholder="Write the PRD..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPrdOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleCreatePrd} disabled={busy || !newPrdTitle.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={enqueueOpen} onOpenChange={setEnqueueOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Enqueue Task</DialogTitle>
            <DialogDescription>
              Adds a task WorkItem into this PRD chain.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium">Agent</div>
              <Select value={enqueueAgentId} onValueChange={setEnqueueAgentId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {roomAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs font-medium">Prompt</div>
              <Textarea value={enqueuePrompt} onChange={(e) => setEnqueuePrompt(e.target.value)} rows={8} placeholder="Task prompt..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnqueueOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleEnqueueTask} disabled={busy || !enqueueAgentId || !enqueuePrompt.trim()}>Enqueue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addKnowledgeOpen} onOpenChange={setAddKnowledgeOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Add Knowledge</DialogTitle>
            <DialogDescription>
              Persist a reusable pattern/gotcha/decision so agents can reference it in future runs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[180px_1fr] gap-3">
              <div>
                <div className="text-xs font-medium">Kind</div>
                <Select value={knowledgeKind} onValueChange={setKnowledgeKind}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Kind" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="learning">learning</SelectItem>
                    <SelectItem value="pattern">pattern</SelectItem>
                    <SelectItem value="gotcha">gotcha</SelectItem>
                    <SelectItem value="decision">decision</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs font-medium">Title</div>
                <Input value={knowledgeTitle} onChange={(e) => setKnowledgeTitle(e.target.value)} placeholder="Short, descriptive title" />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium">Tags (comma-separated)</div>
              <Input value={knowledgeTags} onChange={(e) => setKnowledgeTags(e.target.value)} placeholder="e.g. prisma, migrations, orchestrator" />
            </div>
            <div>
              <div className="text-xs font-medium">Content</div>
              <Textarea value={knowledgeContent} onChange={(e) => setKnowledgeContent(e.target.value)} rows={8} placeholder="Actionable note (include paths/commands/invariants)..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddKnowledgeOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleAddKnowledge} disabled={busy || !knowledgeTitle.trim() || !knowledgeContent.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={workItemOpen} onOpenChange={setWorkItemOpen}>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>Work Item</DialogTitle>
            <DialogDescription className="text-xs">
              {workItemDetail ? `${workItemDetail.type} · ${workItemDetail.status} · ${workItemDetail.id}` : "Loading..."}
            </DialogDescription>
          </DialogHeader>
          {!workItemDetail ? (
            <div className="text-xs text-muted-foreground">Loading details...</div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={badgeVariantForStatus(workItemDetail.status)}>{workItemDetail.status}</Badge>
                <Badge variant="outline">{workItemDetail.type}</Badge>
                {workItemDetail.epic?.title && <Badge variant="outline">Epic: {workItemDetail.epic.title}</Badge>}
                {workItemDetail.runId && <Badge variant="outline">run {workItemDetail.runId}</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-3 text-[0.6875rem] text-muted-foreground">
                <div>Agent: {workItemDetail.agent?.name || workItemDetail.agentId || "-"}</div>
                <div>Room: {workItemDetail.room?.name || workItemDetail.roomId || "-"}</div>
                <div>Created: {fmtShort(workItemDetail.createdAt)}</div>
                <div>Claimed: {fmtShort(workItemDetail.claimedAt)}</div>
                <div>Lease: {fmtShort(workItemDetail.leaseExpiresAt)}</div>
                <div>Attempts: {workItemDetail.attempts}/{workItemDetail.maxAttempts}</div>
              </div>

              {workItemDetail.lastError && (
                <pre className="max-h-[140px] overflow-auto rounded-md border bg-destructive/5 p-3 text-[0.6875rem] leading-relaxed whitespace-pre-wrap text-destructive">
                  {workItemDetail.lastError}
                </pre>
              )}

              {(() => {
                const payload = safeJsonParse<any>(workItemDetail.payload, {})
                const prompt = typeof payload?.prompt === "string" ? payload.prompt : ""
                const title = typeof payload?.title === "string" ? payload.title : ""
                return (
                  <div className="space-y-2">
                    <div className="text-xs font-medium">Payload</div>
                    {title ? (
                      <div className="text-[0.6875rem] text-muted-foreground">Title: {title}</div>
                    ) : null}
                    <pre className="max-h-[220px] overflow-auto rounded-md border bg-muted/30 p-3 text-[0.6875rem] leading-relaxed whitespace-pre-wrap">
                      {prompt || "(no prompt)"}
                    </pre>
                  </div>
                )
              })()}

              <div className="space-y-2">
                <div className="text-xs font-medium">Last Output</div>
                <pre className="max-h-[260px] overflow-auto rounded-md border bg-muted/30 p-3 text-[0.6875rem] leading-relaxed whitespace-pre-wrap">
                  {workItemOutput?.message?.content || "(no output persisted yet)"}
                </pre>
                {workItemOutput?.message?.sessionUrl && (
                  <div className="text-[0.6875rem]">
                    Session:{" "}
                    <Link className="underline" href={workItemOutput.message.sessionUrl} target="_blank" rel="noreferrer">
                      {workItemOutput.message.sessionUrl}
                    </Link>
                  </div>
                )}
                {workItemOutput?.run?.state && (
                  <div className="text-[0.6875rem] text-muted-foreground">
                    Run state: {workItemOutput.run.state}
                    {workItemOutput.run.errorMessage ? ` · ${firstLine(workItemOutput.run.errorMessage)}` : ""}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            {workItemDetail && ["FAILED", "CANCELLED"].includes(workItemDetail.status) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => requeueItemNoChain(workItemDetail.id)}
              >
                Requeue
              </Button>
            )}
            {workItemDetail && ["QUEUED", "CLAIMED", "RUNNING"].includes(workItemDetail.status) && (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => cancelItemNoChain(workItemDetail.id)}
              >
                Cancel
              </Button>
            )}
            <Button variant="outline" onClick={() => setWorkItemOpen(false)} disabled={busy}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

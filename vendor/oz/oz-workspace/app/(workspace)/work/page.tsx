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

export default function WorkPage() {
  const { rooms, fetchRooms } = useRoomStore()
  const [roomId, setRoomId] = React.useState<string>("")

  const [prds, setPrds] = React.useState<PrdSummary[]>([])
  const [selectedPrdId, setSelectedPrdId] = React.useState<string>("")
  const [prdDetail, setPrdDetail] = React.useState<PrdDetail | null>(null)
  const [workItems, setWorkItems] = React.useState<WorkItem[]>([])

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [newPrdOpen, setNewPrdOpen] = React.useState(false)
  const [newPrdTitle, setNewPrdTitle] = React.useState("")
  const [newPrdContent, setNewPrdContent] = React.useState("")

  const [enqueueOpen, setEnqueueOpen] = React.useState(false)
  const [enqueueAgentId, setEnqueueAgentId] = React.useState("")
  const [enqueuePrompt, setEnqueuePrompt] = React.useState("")

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

  React.useEffect(() => {
    setPrds([])
    setSelectedPrdId("")
    setPrdDetail(null)
    setWorkItems([])
    setError(null)
    if (!roomId) return
    refreshPrds().catch(() => {})
  }, [roomId, refreshPrds])

  React.useEffect(() => {
    setPrdDetail(null)
    setWorkItems([])
    setError(null)
    if (!selectedPrdId) return
    refreshPrdDetail(selectedPrdId).catch(() => {})
    refreshWorkItems(selectedPrdId).catch(() => {})
  }, [selectedPrdId, refreshPrdDetail, refreshWorkItems])

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
                          }}
                        >
                          Refresh Chain
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
                        <div className="space-y-2">
                          {workItems.map((w) => (
                            <div key={w.id} className="rounded-md border p-3">
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
                                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => requeueItem(w.id)}>
                                      Requeue
                                    </Button>
                                  )}
                                  {["QUEUED", "CLAIMED", "RUNNING"].includes(w.status) && (
                                    <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={busy} onClick={() => cancelItem(w.id)}>
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
    </div>
  )
}


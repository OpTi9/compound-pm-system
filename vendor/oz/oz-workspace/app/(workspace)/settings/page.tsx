"use client"

import * as React from "react"
import { EyeIcon, EyeSlashIcon, FloppyDiskIcon } from "@phosphor-icons/react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSettingsStore } from "@/lib/stores"

export default function SettingsPage() {
  const { settings, fetchSettings, updateSetting } = useSettingsStore()
  const [apiKey, setApiKey] = React.useState("")
  const [showKey, setShowKey] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  React.useEffect(() => {
    // Prisma can yield `null` for unset settings; keep the input controlled with a string.
    if (typeof settings.oz_api_key === "string") setApiKey(settings.oz_api_key)
    else if (settings.oz_api_key === null) setApiKey("")
  }, [settings.oz_api_key])

  const handleSave = async () => {
    setSaving(true)
    await updateSetting("oz_api_key", apiKey)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 items-center border-b px-4">
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-md space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="oz-api-key">
              Oz API Key
            </label>
            <p className="text-xs text-muted-foreground">
              Set the API key your Oz control plane expects. This is used to authenticate agent runs.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="oz-api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Oz API key"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? (
                    <EyeSlashIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
              <Button onClick={handleSave} disabled={saving}>
                <FloppyDiskIcon className="h-4 w-4" />
                {saved ? "Saved" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

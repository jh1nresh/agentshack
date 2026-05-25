'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { Download, Loader2, Lock, Check, Copy } from 'lucide-react'

interface DownloadSkillButtonProps {
  skillId: string
  skillName: string
  isCreator?: boolean
}

type Status = 'idle' | 'checking' | 'loading' | 'downloaded' | 'error' | 'not_purchased'

export default function DownloadSkillButton({
  skillId,
  skillName,
  isCreator = false,
}: DownloadSkillButtonProps) {
  const { ready, authenticated, user } = usePrivy()
  const [status, setStatus] = useState<Status>('idle')
  const [content, setContent] = useState<string | null>(null)
  const [fileType, setFileType] = useState<string>('markdown')
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)

  const checkAccess = useCallback(async () => {
    if (!user) return
    setStatus('checking')
    setErrorMsg('')

    try {
      const res = await fetch(`/api/skills/${skillId}/content?privyId=${user.id}`)
      if (res.status === 403) {
        setStatus('not_purchased')
        return
      }
      if (res.status === 404) {
        // Content not available yet
        setStatus('idle')
        setErrorMsg('Skill content not available')
        return
      }
      if (!res.ok) {
        throw new Error('Failed to check access')
      }
      // User has access, but don't load content until they click
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to check access')
    }
  }, [skillId, user])

  // Check purchase status on mount if authenticated
  useEffect(() => {
    if (ready && authenticated && user) {
      checkAccess()
    }
  }, [ready, authenticated, user, checkAccess])

  const handleDownload = async () => {
    if (!user) return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch(`/api/skills/${skillId}/content?privyId=${user.id}`)

      if (res.status === 403) {
        setStatus('not_purchased')
        return
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to download')
      }

      const data = await res.json()
      setContent(data.content)
      setFileType(data.fileType || 'markdown')
      setStatus('downloaded')

      // Trigger file download
      const blob = new Blob([data.content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = data.fileType === 'json' ? 'json' : 'md'
      a.download = `${skillName.toLowerCase().replace(/\s+/g, '-')}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Download failed')
    }
  }

  const handleCopy = async () => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setErrorMsg('Failed to copy')
    }
  }

  // Not logged in
  if (!ready || !authenticated) {
    return null
  }

  // Checking access status
  if (status === 'checking') {
    return (
      <div className="flex items-center gap-2 text-[var(--paper-ink-50)] font-mono text-sm">
        <Loader2 size={14} className="animate-spin" />
        Checking access...
      </div>
    )
  }

  // Not purchased
  if (status === 'not_purchased' && !isCreator) {
    return (
      <div className="flex items-center gap-2 text-[var(--paper-ink-40)] font-mono text-xs">
        <Lock size={12} />
        Purchase to preview and download skill instructions
      </div>
    )
  }

  // Downloaded - show content preview and actions
  if (status === 'downloaded' && content) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-sm text-[var(--paper-success)]">
            <Check size={14} />
            Downloaded
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 font-mono text-xs text-[var(--paper-accent)] hover:underline"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Installation instructions */}
        <div className="p-3 bg-[var(--paper-ink-5)] border border-[var(--paper-ink-10)] font-mono text-xs">
          <p className="text-[var(--paper-ink-70)] mb-2">
            <strong>Install only after approval:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 text-[var(--paper-ink-60)]">
            <li>Review what the skill can read, write, and call</li>
            <li>Paste the downloaded file</li>
            <li>Reload your agent only when you approve the local change</li>
          </ol>
        </div>

        {/* Download again button */}
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 font-mono text-xs text-[var(--paper-ink-50)] hover:text-[var(--paper-ink)] transition-colors"
        >
          <Download size={12} />
          Download again
        </button>
      </div>
    )
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="space-y-2">
        <p className="font-mono text-xs text-[var(--paper-danger)]">{errorMsg}</p>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 font-mono text-xs text-[var(--paper-accent)] hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  // Default: show download button
  return (
    <button
      onClick={handleDownload}
      disabled={status === 'loading'}
      className="flex w-full items-center justify-center gap-2 bg-[var(--paper-success)] py-3 font-mono text-sm uppercase tracking-widest text-[var(--paper-bg)] transition-colors hover:opacity-90 disabled:opacity-50"
    >
      {status === 'loading' ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Downloading...
        </>
      ) : (
        <>
          <Download size={14} />
          Preview & Download
        </>
      )}
    </button>
  )
}

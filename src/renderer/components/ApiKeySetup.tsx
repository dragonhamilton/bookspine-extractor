import { useState } from 'react'

interface Props {
  onSaved: () => void
  /** If already set, show update mode */
  currentMasked?: string | null
}

export default function ApiKeySetup({ onSaved, currentMasked }: Props) {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isUpdate = !!currentMasked
  const isValid  = key.startsWith('sk-ant-') && key.length > 20

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    setError(null)
    try {
      await window.spineAPI.saveApiKey(key)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save key')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="setup-overlay">
      <div className="setup-card">
        <div className="setup-icon">🔑</div>

        <h2>{isUpdate ? 'Update API Key' : 'Anthropic API Key Required'}</h2>

        <p>
          {isUpdate
            ? `Current key: ${currentMasked}. Enter a new key to replace it.`
            : 'Book title extraction uses Claude\'s vision API. Paste your Anthropic API key below to get started.'}
        </p>

        {!isUpdate && (
          <a
            className="setup-link"
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            Get a key at console.anthropic.com →
          </a>
        )}

        <input
          className="setup-input"
          type="password"
          placeholder="sk-ant-api03-…"
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && isValid && handleSave()}
          autoFocus
        />

        {error && <div className="error-msg">{error}</div>}

        <div className="setup-actions">
          {isUpdate && (
            <button className="btn btn-ghost" onClick={onSaved}>
              Cancel
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!isValid || saving}
          >
            {saving ? 'Saving…' : isUpdate ? 'Update Key' : 'Save Key'}
          </button>
        </div>

        <p className="setup-note">
          Your key is encrypted with your system keychain and never leaves this device.
        </p>
      </div>
    </div>
  )
}

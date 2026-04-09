import { useState, useCallback, useEffect } from 'react'
import DropZone     from './components/DropZone'
import SpineGrid    from './components/SpineGrid'
import SpineReview  from './components/SpineReview'
import ApiKeySetup  from './components/ApiKeySetup'
import type { DetectionResult, TrainingStats } from './env'

// ── State machine ──────────────────────────────────────────────────────────
//
//   needs-key ─► idle ─► loaded ─► detecting ─► reviewing ─► done
//       ▲                                           │
//       └──────────── (settings icon) ◄─────────────┘

type AppState =
  | 'checking'    // initial: loading api-key status
  | 'needs-key'   // no key stored yet
  | 'idle'
  | 'loaded'
  | 'detecting'
  | 'reviewing'
  | 'done'
  | 'error'

export default function App() {
  const [state,       setState]       = useState<AppState>('checking')
  const [imagePath,   setImagePath]   = useState<string | null>(null)
  const [detection,   setDetection]   = useState<DetectionResult | null>(null)
  const [trainStats,  setTrainStats]  = useState<TrainingStats | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [keyMasked,   setKeyMasked]   = useState<string | null>(null)
  const [showKeyEdit, setShowKeyEdit] = useState(false)

  // ── Check API key on launch ───────────────────────────────────────────────
  useEffect(() => {
    window.spineAPI.getApiKey().then(status => {
      setKeyMasked(status.masked)
      setState(status.set ? 'idle' : 'needs-key')
    })
    window.spineAPI.getTrainingStats().then(s => setTrainStats(s))
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────

  const loadImage = useCallback((path: string) => {
    setImagePath(path)
    setDetection(null)
    setError(null)
    setState('loaded')
  }, [])

  const handleOpenFile = async () => {
    const path = await window.spineAPI.openImageFile()
    if (path) loadImage(path)
  }

  const handleDetect = async () => {
    if (!imagePath) return
    setState('detecting')
    setError(null)
    try {
      const result = await window.spineAPI.detectSpines(imagePath)
      setDetection(result)
      setState('reviewing')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  const handleReviewDone = (stats: TrainingStats) => {
    setTrainStats(stats)
    setState('done')
  }

  const handleReset = () => {
    setState('idle')
    setImagePath(null)
    setDetection(null)
    setError(null)
  }

  const handleKeyEditDone = () => {
    window.spineAPI.getApiKey().then(s => setKeyMasked(s.masked))
    setShowKeyEdit(false)
    if (state === 'needs-key') setState('idle')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (state === 'checking') return null

  return (
    <div className="app">

      {/* API key setup overlay (first launch or settings edit) */}
      {(state === 'needs-key' || showKeyEdit) && (
        <ApiKeySetup
          onSaved={handleKeyEditDone}
          currentMasked={showKeyEdit ? keyMasked : null}
        />
      )}

      {/* ── Header ── */}
      <header className="app-header">
        <span className="app-logo">📚</span>
        <div>
          <h1>Bookspine Extractor</h1>
          <p>
            Drop a bookshelf photo · AI reads each spine · confirm to improve accuracy
          </p>
        </div>

        <div className="header-right">
          {trainStats && trainStats.total > 0 && (
            <span className="training-pill" title={`${Math.round(trainStats.accuracy * 100)}% first-read accuracy`}>
              📖 {trainStats.total} learned
            </span>
          )}
          <button
            className="btn btn-ghost"
            title="API key settings"
            onClick={() => setShowKeyEdit(true)}
          >
            ⚙
          </button>
          {state !== 'idle' && (
            <button className="btn btn-ghost" onClick={handleReset}>
              Start over
            </button>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">

        {state === 'idle' && (
          <DropZone onFileDrop={loadImage} onOpenFile={handleOpenFile} />
        )}

        {(state === 'loaded' || state === 'detecting' || state === 'error') && imagePath && (
          <div className="image-section">
            <img
              src={`file://${imagePath}`}
              alt="Bookshelf"
              className="image-preview"
            />
            <div className="controls">
              <button className="btn btn-secondary" onClick={handleOpenFile}>
                Open different image
              </button>
              <button
                className="btn btn-primary"
                onClick={handleDetect}
                disabled={state === 'detecting'}
              >
                {state === 'detecting'
                  ? <><span className="spinner" /> Detecting spines…</>
                  : 'Detect Spines'}
              </button>
            </div>
            {state === 'error' && <div className="error-msg">{error}</div>}
          </div>
        )}

        {state === 'reviewing' && detection && (
          <SpineReview
            spines={detection.spines}
            onDone={handleReviewDone}
            onBack={() => setState('loaded')}
          />
        )}

        {state === 'done' && detection && (
          <div className="done-section">
            <div className="done-header">
              <div>
                <h2>Done!</h2>
                {trainStats && (
                  <p className="muted">
                    Training set now has <strong>{trainStats.total}</strong> books
                    {trainStats.total > 0 && ` · ${Math.round(trainStats.accuracy * 100)}% first-read accuracy`}
                  </p>
                )}
              </div>
              <div className="results-actions">
                <button className="btn btn-secondary" onClick={handleReset}>
                  Scan another image
                </button>
              </div>
            </div>
            <SpineGrid spines={detection.spines} />
          </div>
        )}

      </main>
    </div>
  )
}

import { useState, useCallback } from 'react'
import DropZone from './components/DropZone'
import SpineGrid from './components/SpineGrid'
import type { DetectionResult } from './env'

type AppState = 'idle' | 'loaded' | 'processing' | 'done' | 'error'

export default function App() {
  const [state, setState] = useState<AppState>('idle')
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [result, setResult] = useState<DetectionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadImage = useCallback((path: string) => {
    setImagePath(path)
    setState('loaded')
    setResult(null)
    setError(null)
  }, [])

  const handleOpenFile = async () => {
    const path = await window.spineAPI.openImageFile()
    if (path) loadImage(path)
  }

  const handleDetect = async () => {
    if (!imagePath) return
    setState('processing')
    setError(null)
    try {
      const res = await window.spineAPI.detectSpines(imagePath)
      setResult(res)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  const handleSaveAll = async () => {
    if (!result) return
    await window.spineAPI.saveAllSpines(result.spines.map(s => s.dataUrl))
  }

  const handleReset = () => {
    setState('idle')
    setImagePath(null)
    setResult(null)
    setError(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">📚</span>
        <div>
          <h1>Bookspine Extractor</h1>
          <p>Drop a bookshelf photo to extract individual spine images</p>
        </div>
        {state !== 'idle' && (
          <button className="btn btn-ghost" onClick={handleReset} style={{ marginLeft: 'auto' }}>
            Start over
          </button>
        )}
      </header>

      <main className="app-main">
        {state === 'idle' && (
          <DropZone onFileDrop={loadImage} onOpenFile={handleOpenFile} />
        )}

        {(state === 'loaded' || state === 'processing' || state === 'error') && imagePath && (
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
                disabled={state === 'processing'}
              >
                {state === 'processing' ? (
                  <><span className="spinner" /> Detecting spines…</>
                ) : (
                  'Detect Spines'
                )}
              </button>
            </div>
            {state === 'error' && (
              <div className="error-msg">{error}</div>
            )}
          </div>
        )}

        {state === 'done' && result && (
          <div className="results-section">
            <div className="results-header">
              <div className="results-info">
                <h2>{result.spines.length} spine{result.spines.length !== 1 ? 's' : ''} found</h2>
                <span className="badge">
                  {result.orientation === 'vertical' ? 'Vertical' : 'Horizontal'}
                </span>
                {Math.abs(result.correctionAngleDeg) > 0.5 && (
                  <span className="badge">
                    {result.correctionAngleDeg > 0 ? '+' : ''}{result.correctionAngleDeg.toFixed(1)}° corrected
                  </span>
                )}
              </div>
              <div className="results-actions">
                <button className="btn btn-secondary" onClick={() => { setState('loaded'); setResult(null) }}>
                  Back
                </button>
                <button className="btn btn-primary" onClick={handleSaveAll}>
                  Save all spines
                </button>
              </div>
            </div>
            <SpineGrid spines={result.spines} />
          </div>
        )}
      </main>
    </div>
  )
}

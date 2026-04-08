import { useState, useEffect, useCallback } from 'react'
import type { SpineImage } from '../env'

interface Props {
  spines: SpineImage[]
}

export default function SpineGrid({ spines }: Props) {
  const [lightbox, setLightbox] = useState<SpineImage | null>(null)

  const close = useCallback(() => setLightbox(null), [])

  // Close on Escape
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') setLightbox(s => s ? (spines[s.index + 1] ?? s) : null)
      if (e.key === 'ArrowLeft')  setLightbox(s => s ? (spines[s.index - 1] ?? s) : null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, spines, close])

  const handleSave = async (spine: SpineImage) => {
    await window.spineAPI.saveSpine(spine.dataUrl, spine.index)
  }

  return (
    <>
      <div className="spine-grid">
        {spines.map(spine => (
          <div key={spine.index} className="spine-card">
            <div className="spine-img-wrap" onClick={() => setLightbox(spine)} title="Click to view full size">
              <img src={spine.dataUrl} alt={`Spine ${spine.index + 1}`} />
            </div>
            <div className="spine-meta">
              <span className="spine-num">#{spine.index + 1}</span>
              <span className="spine-dims">{spine.width}×{spine.height}</span>
              <button className="btn btn-ghost" onClick={() => handleSave(spine)}>
                Save
              </button>
            </div>
          </div>
        ))}
      </div>

      {lightbox && (
        <div className="lightbox-backdrop" onClick={close}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={lightbox.dataUrl} alt={`Spine ${lightbox.index + 1}`} className="lightbox-img" />
            <div className="lightbox-bar">
              <button
                className="btn btn-ghost"
                onClick={() => setLightbox(spines[lightbox.index - 1] ?? lightbox)}
                disabled={lightbox.index === 0}
              >
                ← Prev
              </button>
              <span className="lightbox-label">
                #{lightbox.index + 1} — {lightbox.width}×{lightbox.height}
              </span>
              <button
                className="btn btn-ghost"
                onClick={() => setLightbox(spines[lightbox.index + 1] ?? lightbox)}
                disabled={lightbox.index === spines.length - 1}
              >
                Next →
              </button>
              <button className="btn btn-secondary" onClick={() => handleSave(lightbox)}>
                Save
              </button>
              <button className="btn btn-ghost lightbox-close" onClick={close}>
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

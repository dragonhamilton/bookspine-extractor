import { useState, useEffect } from 'react'
import type { SpineImage, ExtractionResult, TrainingSaveItem } from '../env'

// ── Types ──────────────────────────────────────────────────────────────────

type ItemStatus = 'waiting' | 'extracting' | 'ready' | 'skipped'

interface ReviewItem {
  spine: SpineImage
  status: ItemStatus
  extracted: ExtractionResult | null
  title: string
  author: string
}

interface Props {
  spines: SpineImage[]
  onDone: (stats: { total: number; corrections: number; accuracy: number }) => void
  onBack: () => void
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SpineReview({ spines, onDone, onBack }: Props) {
  const [items, setItems] = useState<ReviewItem[]>(() =>
    spines.map(spine => ({
      spine,
      status: 'waiting',
      extracted: null,
      title: '',
      author: ''
    }))
  )
  const [allDone, setAllDone]   = useState(false)
  const [saving,  setSaving]    = useState(false)

  // ── Extract all spines sequentially ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function run() {
      for (let i = 0; i < spines.length; i++) {
        if (cancelled) break

        setItems(prev =>
          prev.map((it, idx) => idx === i ? { ...it, status: 'extracting' } : it)
        )

        try {
          const result = await window.spineAPI.extractSpine(spines[i].dataUrl)
          if (!cancelled) {
            setItems(prev =>
              prev.map((it, idx) =>
                idx === i
                  ? { ...it, status: 'ready', extracted: result, title: result.title, author: result.author }
                  : it
              )
            )
          }
        } catch {
          if (!cancelled) {
            setItems(prev =>
              prev.map((it, idx) =>
                idx === i ? { ...it, status: 'ready' } : it
              )
            )
          }
        }
      }
      if (!cancelled) setAllDone(true)
    }

    run()
    return () => { cancelled = true }
  }, [spines])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const update = (i: number, patch: Partial<ReviewItem>) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it))

  const toggleSkip = (i: number) =>
    update(i, {
      status: items[i].status === 'skipped' ? 'ready' : 'skipped'
    })

  const acceptAll = () =>
    setItems(prev =>
      prev.map(it => it.status === 'ready' ? { ...it, status: 'ready' } : it)
    )

  const handleSave = async () => {
    setSaving(true)
    const toSave: TrainingSaveItem[] = items
      .filter(it => it.status !== 'skipped' && (it.title || it.author))
      .map(it => ({
        imageDataUrl:   it.spine.dataUrl,
        confirmedTitle: it.title,
        confirmedAuthor:it.author,
        extractedTitle: it.extracted?.title  ?? '',
        extractedAuthor:it.extracted?.author ?? '',
        confidence:     it.extracted?.confidence ?? 0
      }))

    try {
      const stats = await window.spineAPI.saveTrainingSamples(toSave)
      onDone(stats)
    } finally {
      setSaving(false)
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const extractingIdx = items.findIndex(it => it.status === 'extracting')
  const readyCount    = items.filter(it => it.status === 'ready' && (it.title || it.author)).length
  const skippedCount  = items.filter(it => it.status === 'skipped').length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="review-section">

      {/* ── Header ── */}
      <div className="review-header">
        <div className="review-status">
          {!allDone && extractingIdx >= 0
            ? <><span className="spinner" /> Reading spine {extractingIdx + 1} of {spines.length}…</>
            : allDone
              ? `${spines.length} spines read · ${skippedCount} skipped`
              : 'Starting…'
          }
        </div>
        <div className="review-header-actions">
          <button className="btn btn-ghost" onClick={onBack} disabled={saving}>
            Back
          </button>
          {allDone && readyCount > 0 && (
            <button className="btn btn-secondary" onClick={acceptAll}>
              Accept all
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || readyCount === 0}
          >
            {saving ? <><span className="spinner" /> Saving…</> : `Save & Learn (${readyCount})`}
          </button>
        </div>
      </div>

      {/* ── List ── */}
      <div className="review-list">
        {items.map((item, i) => (
          <div
            key={i}
            className={`review-card${item.status === 'skipped' ? ' skipped' : ''}`}
          >
            {/* Thumbnail */}
            <div
              className="review-thumb"
              onClick={() => {/* lightbox could open here */}}
              title="Click to enlarge"
            >
              <img src={item.spine.dataUrl} alt={`Spine ${i + 1}`} />
            </div>

            {/* Fields */}
            <div className="review-fields">
              {(item.status === 'waiting') && (
                <span className="review-placeholder">Waiting…</span>
              )}
              {(item.status === 'extracting') && (
                <span className="review-placeholder">
                  <span className="spinner" /> Reading…
                </span>
              )}
              {(item.status === 'ready' || item.status === 'skipped') && (
                <>
                  <div className="review-field-row">
                    <label>Title</label>
                    <input
                      type="text"
                      value={item.title}
                      onChange={e => update(i, { title: e.target.value })}
                      placeholder="Unknown"
                      disabled={item.status === 'skipped'}
                    />
                  </div>
                  <div className="review-field-row">
                    <label>Author</label>
                    <input
                      type="text"
                      value={item.author}
                      onChange={e => update(i, { author: e.target.value })}
                      placeholder="Unknown"
                      disabled={item.status === 'skipped'}
                    />
                  </div>
                  {item.extracted && (
                    <div className="confidence-wrap">
                      <div
                        className="confidence-bar"
                        style={{ '--conf': item.extracted.confidence } as React.CSSProperties}
                        title={`Confidence: ${Math.round(item.extracted.confidence * 100)}%`}
                      />
                      <span className="confidence-label">
                        {Math.round(item.extracted.confidence * 100)}%
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Skip button */}
            <button
              className={`btn btn-ghost skip-btn${item.status === 'skipped' ? ' active' : ''}`}
              onClick={() => toggleSkip(i)}
              disabled={item.status === 'waiting' || item.status === 'extracting'}
              title={item.status === 'skipped' ? 'Un-skip' : 'Skip this spine'}
            >
              {item.status === 'skipped' ? '↩' : '✕'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

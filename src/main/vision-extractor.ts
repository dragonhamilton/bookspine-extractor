import Anthropic from '@anthropic-ai/sdk'
import type { TrainingStore } from './training-store'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExtractionResult {
  title: string
  author: string
  /** 0–1 confidence reported by the model */
  confidence: number
}

// ── Core extraction ────────────────────────────────────────────────────────

/**
 * Send one spine image to Claude and return the extracted title/author.
 *
 * The function improves over time by:
 *   1. Prepending a text list of all books confirmed so far — the model uses
 *      this to disambiguate partial or blurry text.
 *   2. Injecting a handful of real (image → title) few-shot pairs so the
 *      model learns the visual style and difficulty of this specific library.
 *      Correction examples (where the user edited the model's answer) are
 *      prioritised so the model learns its own blind spots.
 */
export async function extractSpineText(
  imageDataUrl: string,
  store: TrainingStore,
  apiKey: string
): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey })

  const knownBooks     = store.getKnownBooks()
  const visualExamples = await store.getVisualExamples(4)

  // ── System prompt ─────────────────────────────────────────────────────────
  const systemLines: string[] = [
    'You are an expert at reading text from book spine photographs.',
    'Extract the book title and author from the spine image provided.',
    'Text may be rotated, partially obscured, faded, or at an angle — do your best.',
    '',
    'Respond with a single JSON object and nothing else:',
    '{"title": "...", "author": "...", "confidence": 0.0}',
    'Use confidence 0.0–1.0 to express how certain you are.',
    'If you truly cannot read the text, return {"title": "Unknown", "author": "Unknown", "confidence": 0.0}',
  ]

  if (knownBooks.length > 0) {
    systemLines.push(
      '',
      'Known books already confirmed in this collection — use to help resolve ambiguous readings:',
      ...knownBooks.slice(-60).map(b =>
        `  • "${b.title}"${b.author ? ` — ${b.author}` : ''}`
      )
    )
  }

  // ── Messages: few-shot visual examples ────────────────────────────────────
  const messages: Anthropic.MessageParam[] = []

  for (const { sample, imageDataUrl: exUrl } of visualExamples) {
    const b64 = exUrl.replace(/^data:image\/\w+;base64,/, '')
    messages.push({
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
        },
        { type: 'text', text: 'What is the title and author on this spine?' }
      ]
    })
    messages.push({
      role: 'assistant',
      content: JSON.stringify({
        title: sample.confirmedTitle,
        author: sample.confirmedAuthor,
        confidence: 0.95
      })
    })
  }

  // ── Current spine ─────────────────────────────────────────────────────────
  const b64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
  messages.push({
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
      },
      { type: 'text', text: 'What is the title and author on this spine?' }
    ]
  })

  // ── Call ──────────────────────────────────────────────────────────────────
  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 256,
    system: systemLines.join('\n'),
    messages
  })

  const raw =
    response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  // ── Parse ─────────────────────────────────────────────────────────────────
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed    = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    return {
      title:      String(parsed.title  ?? '').trim(),
      author:     String(parsed.author ?? '').trim(),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5))
    }
  } catch {
    // Graceful fallback: return whatever text we got
    return { title: raw.slice(0, 120), author: '', confidence: 0.2 }
  }
}

import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'

// ── Types ──────────────────────────────────────────────────────────────────

export interface TrainingSample {
  id: string
  imageHash: string
  confirmedTitle: string
  confirmedAuthor: string
  extractedTitle: string   // what the model said before user correction
  extractedAuthor: string
  confidence: number       // model-reported confidence at extraction time
  wasCorrection: boolean   // user changed the extracted text
  createdAt: string
}

export interface TrainingStats {
  total: number
  corrections: number
  accuracy: number  // fraction of extractions that were already correct
}

// ── Store ──────────────────────────────────────────────────────────────────

export class TrainingStore {
  private readonly dataDir: string
  private readonly samplesFile: string
  private readonly spinesDir: string
  private samples: TrainingSample[] = []
  private ready = false

  constructor() {
    this.dataDir  = path.join(app.getPath('userData'), 'training')
    this.samplesFile = path.join(this.dataDir, 'samples.json')
    this.spinesDir   = path.join(this.dataDir, 'spines')
  }

  async init(): Promise<void> {
    await fs.mkdir(this.spinesDir, { recursive: true })
    try {
      const raw = await fs.readFile(this.samplesFile, 'utf-8')
      this.samples = JSON.parse(raw)
    } catch {
      this.samples = []
    }
    this.ready = true
  }

  // ── Write ────────────────────────────────────────────────────────────────

  async addSamples(items: Array<{
    imageDataUrl: string
    confirmedTitle: string
    confirmedAuthor: string
    extractedTitle: string
    extractedAuthor: string
    confidence: number
  }>): Promise<void> {
    if (!this.ready) await this.init()

    for (const item of items) {
      const hash = crypto.createHash('md5').update(item.imageDataUrl).digest('hex')
      const imgPath = path.join(this.spinesDir, `${hash}.jpg`)

      // Persist image file
      const b64 = item.imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
      await fs.writeFile(imgPath, Buffer.from(b64, 'base64'))

      const sample: TrainingSample = {
        id: crypto.randomUUID(),
        imageHash: hash,
        confirmedTitle: item.confirmedTitle.trim(),
        confirmedAuthor: item.confirmedAuthor.trim(),
        extractedTitle: item.extractedTitle,
        extractedAuthor: item.extractedAuthor,
        confidence: item.confidence,
        wasCorrection:
          item.confirmedTitle.trim().toLowerCase() !==
          item.extractedTitle.trim().toLowerCase(),
        createdAt: new Date().toISOString()
      }

      // Upsert by hash so re-scanning the same book updates rather than duplicates
      this.samples = this.samples.filter(s => s.imageHash !== hash)
      this.samples.push(sample)
    }

    await this.persist()
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  /**
   * Returns up to `n` examples suitable for few-shot prompting.
   * Prefers correction examples (where the model was wrong) so the
   * prompt emphasises the model's weak spots.
   */
  async getVisualExamples(n = 4): Promise<Array<{
    sample: TrainingSample
    imageDataUrl: string
  }>> {
    if (!this.ready) await this.init()

    const corrections = this.samples.filter(s => s.wasCorrection)
    const correct     = this.samples.filter(s => !s.wasCorrection)

    // Fill half the slots with corrections, rest with most-recent correct
    const half = Math.floor(n / 2)
    const pool = [
      ...corrections.slice(-half),
      ...correct.slice(-(n - half))
    ]

    const results: Array<{ sample: TrainingSample; imageDataUrl: string }> = []
    for (const sample of pool) {
      try {
        const buf = await fs.readFile(
          path.join(this.spinesDir, `${sample.imageHash}.jpg`)
        )
        results.push({
          sample,
          imageDataUrl: `data:image/jpeg;base64,${buf.toString('base64')}`
        })
      } catch { /* skip if image file was deleted */ }
    }
    return results
  }

  /**
   * Returns the de-duplicated list of confirmed books.
   * Used to build the "known books" hint in the system prompt.
   */
  getKnownBooks(): Array<{ title: string; author: string }> {
    const seen = new Set<string>()
    const out: Array<{ title: string; author: string }> = []
    for (const s of this.samples) {
      const key = s.confirmedTitle.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ title: s.confirmedTitle, author: s.confirmedAuthor })
      }
    }
    return out
  }

  getStats(): TrainingStats {
    const total = this.samples.length
    const corrections = this.samples.filter(s => s.wasCorrection).length
    return {
      total,
      corrections,
      accuracy: total === 0 ? 0 : (total - corrections) / total
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    await fs.writeFile(
      this.samplesFile,
      JSON.stringify(this.samples, null, 2),
      'utf-8'
    )
  }
}

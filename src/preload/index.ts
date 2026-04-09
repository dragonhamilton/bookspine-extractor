import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('spineAPI', {
  // ── File / detection ──────────────────────────────────────────────────────
  openImageFile: (): Promise<string | null> =>
    ipcRenderer.invoke('open-image-file'),

  detectSpines: (imagePath: string): Promise<unknown> =>
    ipcRenderer.invoke('detect-spines', imagePath),

  saveSpine: (dataUrl: string, index: number): Promise<string | null> =>
    ipcRenderer.invoke('save-spine', dataUrl, index),

  saveAllSpines: (dataUrls: string[]): Promise<string[] | null> =>
    ipcRenderer.invoke('save-all-spines', dataUrls),

  // ── API key ───────────────────────────────────────────────────────────────
  getApiKey: (): Promise<{ set: boolean; masked: string | null }> =>
    ipcRenderer.invoke('get-api-key'),

  saveApiKey: (key: string): Promise<void> =>
    ipcRenderer.invoke('save-api-key', key),

  // ── Extraction ────────────────────────────────────────────────────────────
  extractSpine: (imageDataUrl: string): Promise<unknown> =>
    ipcRenderer.invoke('extract-spine', imageDataUrl),

  // ── Training ──────────────────────────────────────────────────────────────
  saveTrainingSamples: (items: Array<{
    imageDataUrl: string
    confirmedTitle: string
    confirmedAuthor: string
    extractedTitle: string
    extractedAuthor: string
    confidence: number
  }>): Promise<unknown> =>
    ipcRenderer.invoke('save-training-samples', items),

  getTrainingStats: (): Promise<unknown> =>
    ipcRenderer.invoke('get-training-stats')
})

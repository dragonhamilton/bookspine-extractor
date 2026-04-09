import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import { detectSpines } from './spine-detector'
import { TrainingStore } from './training-store'
import { extractSpineText } from './vision-extractor'

// ── Singletons ─────────────────────────────────────────────────────────────

const store = new TrainingStore()
const KEY_FILE = join(app.getPath('userData'), '.apikey.enc')

// ── API key helpers ────────────────────────────────────────────────────────

async function loadApiKey(): Promise<string | null> {
  try {
    const buf = await fs.readFile(KEY_FILE)
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf-8')
  } catch {
    return null
  }
}

async function saveApiKey(key: string): Promise<void> {
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key)
    : Buffer.from(key, 'utf-8')
  await fs.writeFile(KEY_FILE, data)
}

// ── Window ─────────────────────────────────────────────────────────────────

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111827',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await store.init()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: file / detection ──────────────────────────────────────────────────

ipcMain.handle('open-image-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] }]
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('detect-spines', async (_e, imagePath: string) => {
  return detectSpines(imagePath)
})

ipcMain.handle('save-spine', async (_e, dataUrl: string, spineIndex: number) => {
  const result = await dialog.showSaveDialog({
    defaultPath: `spine_${String(spineIndex + 1).padStart(3, '0')}.jpg`,
    filters: [{ name: 'JPEG Image', extensions: ['jpg'] }]
  })
  if (result.canceled || !result.filePath) return null
  const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  await fs.writeFile(result.filePath, Buffer.from(b64, 'base64'))
  return result.filePath
})

ipcMain.handle('save-all-spines', async (_e, dataUrls: string[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    message: 'Choose a folder to save all spine images'
  })
  if (result.canceled || !result.filePaths[0]) return null
  const dir = result.filePaths[0]
  const saved: string[] = []
  for (let i = 0; i < dataUrls.length; i++) {
    const b64 = dataUrls[i].replace(/^data:image\/\w+;base64,/, '')
    const p = join(dir, `spine_${String(i + 1).padStart(3, '0')}.jpg`)
    await fs.writeFile(p, Buffer.from(b64, 'base64'))
    saved.push(p)
  }
  return saved
})

// ── IPC: API key ───────────────────────────────────────────────────────────

ipcMain.handle('get-api-key', async () => {
  const key = await loadApiKey()
  // Return a masked version for display; null if not set
  return key ? { set: true, masked: `sk-ant-...${key.slice(-4)}` } : { set: false, masked: null }
})

ipcMain.handle('save-api-key', async (_e, key: string) => {
  await saveApiKey(key)
})

// ── IPC: extraction ────────────────────────────────────────────────────────

ipcMain.handle('extract-spine', async (_e, imageDataUrl: string) => {
  const apiKey = await loadApiKey()
  if (!apiKey) throw new Error('No API key configured')
  return extractSpineText(imageDataUrl, store, apiKey)
})

// ── IPC: training ──────────────────────────────────────────────────────────

ipcMain.handle('save-training-samples', async (_e, items: Array<{
  imageDataUrl: string
  confirmedTitle: string
  confirmedAuthor: string
  extractedTitle: string
  extractedAuthor: string
  confidence: number
}>) => {
  await store.addSamples(items)
  return store.getStats()
})

ipcMain.handle('get-training-stats', async () => {
  return store.getStats()
})

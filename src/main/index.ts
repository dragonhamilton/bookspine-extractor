import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import { detectSpines } from './spine-detector'

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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC handlers ──────────────────────────────────────────────────────────

ipcMain.handle('open-image-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] }]
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('detect-spines', async (_event, imagePath: string) => {
  return detectSpines(imagePath)
})

ipcMain.handle('save-spine', async (_event, dataUrl: string, spineIndex: number) => {
  const result = await dialog.showSaveDialog({
    defaultPath: `spine_${String(spineIndex + 1).padStart(3, '0')}.jpg`,
    filters: [{ name: 'JPEG Image', extensions: ['jpg'] }]
  })
  if (result.canceled || !result.filePath) return null

  const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  await fs.writeFile(result.filePath, Buffer.from(b64, 'base64'))
  return result.filePath
})

ipcMain.handle('save-all-spines', async (_event, dataUrls: string[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    message: 'Choose a folder to save all spine images'
  })
  if (result.canceled || !result.filePaths[0]) return null

  const dir = result.filePaths[0]
  const saved: string[] = []

  for (let i = 0; i < dataUrls.length; i++) {
    const b64 = dataUrls[i].replace(/^data:image\/\w+;base64,/, '')
    const filePath = join(dir, `spine_${String(i + 1).padStart(3, '0')}.jpg`)
    await fs.writeFile(filePath, Buffer.from(b64, 'base64'))
    saved.push(filePath)
  }

  return saved
})

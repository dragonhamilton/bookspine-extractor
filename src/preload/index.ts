import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('spineAPI', {
  openImageFile: (): Promise<string | null> =>
    ipcRenderer.invoke('open-image-file'),

  detectSpines: (imagePath: string): Promise<unknown> =>
    ipcRenderer.invoke('detect-spines', imagePath),

  saveSpine: (dataUrl: string, index: number): Promise<string | null> =>
    ipcRenderer.invoke('save-spine', dataUrl, index),

  saveAllSpines: (dataUrls: string[]): Promise<string[] | null> =>
    ipcRenderer.invoke('save-all-spines', dataUrls)
})

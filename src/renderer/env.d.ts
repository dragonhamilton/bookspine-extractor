export interface SpineImage {
  index: number
  dataUrl: string
  width: number
  height: number
}

export interface DetectionResult {
  spines: SpineImage[]
  correctionAngleDeg: number
  orientation: 'vertical' | 'horizontal'
  boundaries: number[]
}

interface SpineAPI {
  openImageFile(): Promise<string | null>
  detectSpines(imagePath: string): Promise<DetectionResult>
  saveSpine(dataUrl: string, index: number): Promise<string | null>
  saveAllSpines(dataUrls: string[]): Promise<string[] | null>
}

declare global {
  interface Window {
    spineAPI: SpineAPI
  }
}

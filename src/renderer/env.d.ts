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

export interface ExtractionResult {
  title: string
  author: string
  confidence: number
}

export interface TrainingStats {
  total: number
  corrections: number
  accuracy: number
}

export interface ApiKeyStatus {
  set: boolean
  masked: string | null
}

export interface TrainingSaveItem {
  imageDataUrl: string
  confirmedTitle: string
  confirmedAuthor: string
  extractedTitle: string
  extractedAuthor: string
  confidence: number
}

interface SpineAPI {
  // File / detection
  openImageFile(): Promise<string | null>
  detectSpines(imagePath: string): Promise<DetectionResult>
  saveSpine(dataUrl: string, index: number): Promise<string | null>
  saveAllSpines(dataUrls: string[]): Promise<string[] | null>

  // API key
  getApiKey(): Promise<ApiKeyStatus>
  saveApiKey(key: string): Promise<void>

  // Extraction
  extractSpine(imageDataUrl: string): Promise<ExtractionResult>

  // Training
  saveTrainingSamples(items: TrainingSaveItem[]): Promise<TrainingStats>
  getTrainingStats(): Promise<TrainingStats>
}

declare global {
  interface Window {
    spineAPI: SpineAPI
  }
}

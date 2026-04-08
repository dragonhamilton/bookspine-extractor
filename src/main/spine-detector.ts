import Jimp from 'jimp'

// ── Types ──────────────────────────────────────────────────────────────────

export interface SpineImage {
  index: number
  dataUrl: string
  width: number
  height: number
}

export interface DetectionResult {
  spines: SpineImage[]
  /** Degrees the image was rotated (CW positive, jimp convention) to align spines */
  correctionAngleDeg: number
  orientation: 'vertical' | 'horizontal'
  /** Boundary positions (pixels) in the rotated/projected axis */
  boundaries: number[]
}

// ── Signal utilities ───────────────────────────────────────────────────────

function gaussianSmooth1D(signal: number[], sigma: number): number[] {
  const r = Math.ceil(sigma * 3)
  const kernel: number[] = []
  let ksum = 0
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel.push(v)
    ksum += v
  }
  const norm = kernel.map(k => k / ksum)

  return signal.map((_, i) => {
    let acc = 0
    let wsum = 0
    for (let ki = 0; ki < norm.length; ki++) {
      const j = i + ki - r
      if (j >= 0 && j < signal.length) {
        acc += signal[j] * norm[ki]
        wsum += norm[ki]
      }
    }
    return acc / wsum
  })
}

/**
 * Find local peaks with a minimum separation and minimum height (0–1 normalised).
 * The signal is smoothed internally before peak detection.
 */
function findPeaks(signal: number[], minSep: number, minHeight: number): number[] {
  const s = gaussianSmooth1D(signal, Math.max(2, minSep / 4))
  const peaks: number[] = []

  for (let i = minSep; i < s.length - minSep; i++) {
    if (s[i] < minHeight) continue
    let isPeak = true
    for (let j = i - minSep; j <= i + minSep; j++) {
      if (j !== i && s[j] >= s[i]) {
        isPeak = false
        break
      }
    }
    if (isPeak) peaks.push(i)
  }

  return peaks
}

// ── Pixel helpers (Jimp RGBA buffer) ──────────────────────────────────────

/** Read the R channel (== G == B for greyscale images). */
function px(data: Buffer, x: number, y: number, w: number): number {
  return data[(y * w + x) * 4]
}

/** Sobel horizontal gradient (∂I/∂x). */
function sobelGx(data: Buffer, x: number, y: number, w: number): number {
  return (
    -px(data, x - 1, y - 1, w) + px(data, x + 1, y - 1, w) +
    -2 * px(data, x - 1, y, w) + 2 * px(data, x + 1, y, w) +
    -px(data, x - 1, y + 1, w) + px(data, x + 1, y + 1, w)
  )
}

/** Sobel vertical gradient (∂I/∂y). */
function sobelGy(data: Buffer, x: number, y: number, w: number): number {
  return (
    -px(data, x - 1, y - 1, w) - 2 * px(data, x, y - 1, w) - px(data, x + 1, y - 1, w) +
     px(data, x - 1, y + 1, w) + 2 * px(data, x, y + 1, w) + px(data, x + 1, y + 1, w)
  )
}

// ── Dominant edge-angle detection via gradient histogram ───────────────────

/**
 * Returns the dominant EDGE angle in [0°, 180°).
 *   0°  → horizontal edges  (books lying on their sides)
 *  90°  → vertical edges    (books standing upright)
 *  Any other value indicates leaning spines.
 *
 * Method: build a magnitude-weighted histogram of gradient directions,
 * then derive the edge angle as (gradient angle + 90°) % 180.
 */
function detectEdgeAngle(data: Buffer, width: number, height: number): number {
  const BINS = 180
  const hist = new Float64Array(BINS)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const dx = sobelGx(data, x, y, width)
      const dy = sobelGy(data, x, y, width)
      const mag = Math.sqrt(dx * dx + dy * dy)
      if (mag < 15) continue // ignore weak gradients / flat regions

      // Map gradient angle to [0°, 180°) (undirected)
      let angle = Math.atan2(dy, dx) * (180 / Math.PI)
      if (angle < 0) angle += 180
      if (angle >= 180) angle -= 180

      hist[Math.floor(angle)] += mag
    }
  }

  // Smooth histogram circularly to reduce bin-boundary artefacts
  const smoothHist = new Float64Array(BINS)
  for (let i = 0; i < BINS; i++) {
    let acc = 0
    let wsum = 0
    for (let k = -6; k <= 6; k++) {
      const w = Math.exp(-(k * k) / (2 * 4))
      const j = (i + k + BINS) % BINS
      acc += hist[j] * w
      wsum += w
    }
    smoothHist[i] = acc / wsum
  }

  // Peak gradient bin → edge angle perpendicular to it
  let peakBin = 0
  let peakVal = 0
  for (let i = 0; i < BINS; i++) {
    if (smoothHist[i] > peakVal) {
      peakVal = smoothHist[i]
      peakBin = i
    }
  }

  return (peakBin + 90) % 180
}

// ── Projection profiles for spine boundary detection ──────────────────────

// Gradient magnitude required to count a pixel as a "strong edge".
const STRONG_EDGE = 20

/**
 * Column profile: for each column, the *fraction* of rows that contain a
 * strong horizontal gradient (|∂I/∂x| > STRONG_EDGE).
 *
 * A true spine boundary is a full-height vertical line → value near 1.0.
 * Internal text or colour stripes span only part of the height → value ≪ 1.
 * Background or uniform regions → value near 0.
 *
 * Using coverage rather than a raw sum prevents tall, high-contrast text
 * from generating false peaks inside a spine.
 */
function buildColumnProfile(data: Buffer, width: number, height: number): number[] {
  const profile = new Array(width).fill(0)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (Math.abs(sobelGx(data, x, y, width)) > STRONG_EDGE) profile[x]++
    }
  }
  return profile.map(v => v / (height - 2))
}

/**
 * Row profile: same idea for horizontal spines using |∂I/∂y|.
 */
function buildRowProfile(data: Buffer, width: number, height: number): number[] {
  const profile = new Array(height).fill(0)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (Math.abs(sobelGy(data, x, y, width)) > STRONG_EDGE) profile[y]++
    }
  }
  return profile.map(v => v / (width - 2))
}

// ── Main detection pipeline ────────────────────────────────────────────────

export async function detectSpines(imagePath: string): Promise<DetectionResult> {
  // ── 1. Load & scale down for processing performance ──────────────────────
  const img = await Jimp.read(imagePath)
  const MAX_DIM = 1200
  if (Math.max(img.bitmap.width, img.bitmap.height) > MAX_DIM) {
    img.scaleToFit(MAX_DIM, MAX_DIM)
  }

  const W = img.bitmap.width
  const H = img.bitmap.height

  // ── 2. Detect dominant edge angle ────────────────────────────────────────
  const grayData = (img.clone().greyscale().blur(1).bitmap.data) as Buffer
  const edgeAngle = detectEdgeAngle(grayData, W, H)

  // edgeAngle ≈  90° → spines are vertical (books standing up)
  // edgeAngle ≈   0° → spines are horizontal (books lying flat)
  const isVertical = edgeAngle > 45 && edgeAngle <= 135

  // ── 3. Compute correction rotation ───────────────────────────────────────
  // jimp.rotate(deg): positive = clockwise.
  // To bring edgeAngle → 90° (vertical): rotate CW by (edgeAngle − 90°).
  // To bring edgeAngle → 0° (horizontal): rotate CW by edgeAngle (if ≤90°)
  //                                        or by (edgeAngle − 180°) (if >90°).
  let jimpRotCW: number
  if (isVertical) {
    jimpRotCW = edgeAngle - 90
  } else {
    jimpRotCW = edgeAngle <= 90 ? edgeAngle : edgeAngle - 180
  }

  // ── 4. Rotate the image ───────────────────────────────────────────────────
  const rotColor = Math.abs(jimpRotCW) > 0.3 ? img.clone().rotate(jimpRotCW) : img.clone()
  const RW = rotColor.bitmap.width
  const RH = rotColor.bitmap.height

  const rotGrayData = (rotColor.clone().greyscale().blur(1).bitmap.data) as Buffer

  // ── 5. Build projection profile & detect boundaries ──────────────────────
  const profile = isVertical
    ? buildColumnProfile(rotGrayData, RW, RH)
    : buildRowProfile(rotGrayData, RW, RH)

  const profileLen = isVertical ? RW : RH

  // Assume at most ~40 spines; minimum separation suppresses false peaks.
  const minSpine = Math.max(10, Math.round(profileLen / 40))

  // Coverage profile values are in [0, 1].  A true spine boundary needs at
  // least 25 % of the column height to be a strong edge.  Fall back to 12 %
  // if too few peaks are found (e.g. very low-contrast image).
  let peakPositions = findPeaks(profile, minSpine, 0.25)
  if (peakPositions.length < 2) {
    peakPositions = findPeaks(profile, Math.floor(minSpine / 2), 0.12)
  }

  const boundaries = [0, ...peakPositions, profileLen - 1]

  // ── 6. Extract each spine region ─────────────────────────────────────────
  // Average coverage inside a region below this threshold means the region is
  // background (shelf frame, rotation padding) rather than a book spine.
  const BACKGROUND_COVERAGE = 0.05

  const spines: SpineImage[] = []

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]
    const end   = boundaries[i + 1]
    const size  = end - start

    if (size < minSpine) continue

    // Skip background regions: if the mean coverage inside is very low the
    // region contains no real book content (shelf edge, rotation padding, etc.)
    let regionSum = 0
    for (let p = start; p < end; p++) regionSum += profile[p]
    if (regionSum / size < BACKGROUND_COVERAGE) continue

    const left   = isVertical ? start : 0
    const top    = isVertical ? 0     : start
    const width  = isVertical ? size  : RW
    const height = isVertical ? RH    : size

    // Guard against out-of-bounds (can happen near image edges after rotation)
    if (left < 0 || top < 0 || left + width > RW || top + height > RH) continue

    const spineImg = rotColor.clone().crop(left, top, width, height)
    const dataUrl  = await spineImg.getBase64Async(Jimp.MIME_JPEG)

    spines.push({ index: spines.length, dataUrl, width, height })
  }

  return {
    spines,
    correctionAngleDeg: jimpRotCW,
    orientation: isVertical ? 'vertical' : 'horizontal',
    boundaries
  }
}

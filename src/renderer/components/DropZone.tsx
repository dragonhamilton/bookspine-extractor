import { useState, useCallback } from 'react'

interface Props {
  onFileDrop: (path: string) => void
  onOpenFile: () => void
}

export default function DropZone({ onFileDrop, onOpenFile }: Props) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    // Electron exposes the native file path on the File object
    const filePath = (file as File & { path: string }).path
    if (filePath) onFileDrop(filePath)
  }, [onFileDrop])

  return (
    <div
      className={`drop-zone${isDragging ? ' dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="drop-zone-content">
        <div className="drop-zone-icon">📚</div>
        <h2>Drop a bookshelf photo here</h2>
        <p>Spines can be vertical, horizontal, or leaning</p>
        <button className="btn btn-primary" onClick={onOpenFile}>
          Browse for image
        </button>
        <p className="drop-hint">Supports JPEG · PNG · WEBP · BMP · TIFF</p>
      </div>
    </div>
  )
}

import type { SpineImage } from '../env'

interface Props {
  spines: SpineImage[]
}

export default function SpineGrid({ spines }: Props) {
  const handleSave = async (spine: SpineImage) => {
    await window.spineAPI.saveSpine(spine.dataUrl, spine.index)
  }

  return (
    <div className="spine-grid">
      {spines.map(spine => (
        <div key={spine.index} className="spine-card">
          <div className="spine-img-wrap">
            <img src={spine.dataUrl} alt={`Spine ${spine.index + 1}`} />
          </div>
          <div className="spine-meta">
            <span className="spine-num">#{spine.index + 1}</span>
            <span className="spine-dims">{spine.width}×{spine.height}</span>
            <button className="btn btn-ghost" onClick={() => handleSave(spine)}>
              Save
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

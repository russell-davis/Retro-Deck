import { useFireButton } from '../queries/config'
import { actionSummary } from '../lib/binding'
import type { ButtonBinding } from '../../server/config'

type Props = {
  id: string
  binding: ButtonBinding
  highlighted?: boolean
  onEdit: () => void
}

export function ButtonCard({ id, binding, highlighted, onEdit }: Props) {
  const fire = useFireButton()
  const press = binding.press
  const label = press?.label ?? `Button ${id}`
  const summary = actionSummary(press)
  const typeTag = press?.type ?? 'unbound'

  return (
    <div
      className={`btn-card btn-card-clickable ${highlighted ? 'btn-card-hot' : ''} type-${typeTag}`}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit()
        }
      }}
    >
      <div className="btn-head">
        <span className="btn-id">#{id}</span>
        <span className={`btn-type type-${typeTag}`}>{typeTag}</span>
      </div>
      <div className="btn-label">{label}</div>
      <div className="btn-summary" title={summary}>
        {summary}
      </div>
      <button
        type="button"
        className="btn-test"
        disabled={!press || fire.isPending}
        onClick={(e) => {
          e.stopPropagation()
          fire.mutate({ id, slot: 'press' })
        }}
      >
        {fire.isPending && fire.variables?.id === id ? 'firing…' : 'Test'}
      </button>
    </div>
  )
}

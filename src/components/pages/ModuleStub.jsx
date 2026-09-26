import EmptyState from '../common/EmptyState'

export default function ModuleStub({ name }) {
  return (
    <EmptyState
      title={name}
      description="Этот модуль появится в следующей фазе разработки. Сейчас готов фундамент: доступ, роли и справочники."
    />
  )
}

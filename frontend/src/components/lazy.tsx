import { Loader2Icon } from 'lucide-react'
import { lazy, Suspense, type ComponentProps } from 'react'

// Heavy modules (CodeMirror, recharts) load only when a dialog needs them.
const CodeEditorImpl = lazy(() => import('./code-editor').then((m) => ({ default: m.CodeEditor })))
const StatsDialogImpl = lazy(() => import('./insight-dialogs').then((m) => ({ default: m.StatsDialog })))
const QrDialogImpl = lazy(() => import('./insight-dialogs').then((m) => ({ default: m.QrDialog })))

const Spinner = () => (
  <div className="flex h-full min-h-24 items-center justify-center">
    <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
  </div>
)

export function CodeEditor(props: ComponentProps<typeof CodeEditorImpl>) {
  return (
    <Suspense fallback={<Spinner />}>
      <CodeEditorImpl {...props} />
    </Suspense>
  )
}

export function StatsDialog(props: ComponentProps<typeof StatsDialogImpl>) {
  return (
    <Suspense>
      <StatsDialogImpl {...props} />
    </Suspense>
  )
}

export function QrDialog(props: ComponentProps<typeof QrDialogImpl>) {
  return (
    <Suspense>
      <QrDialogImpl {...props} />
    </Suspense>
  )
}

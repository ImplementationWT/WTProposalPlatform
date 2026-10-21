import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo } from 'react'

function languageFor(path: string) {
  if (/\.css$/i.test(path)) return [css()]
  if (/\.(m?js|json)$/i.test(path)) return [javascript()]
  if (/\.(html?|svg|xml)$/i.test(path)) return [html()]
  return []
}

interface Props {
  value: string
  onChange: (value: string) => void
  path?: string
  height?: string
  className?: string
}

export function CodeEditor({ value, onChange, path = 'index.html', height = '100%', className }: Props) {
  const extensions = useMemo(() => languageFor(path), [path])
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      height={height}
      className={className}
      basicSetup={{ foldGutter: true, highlightActiveLine: true }}
    />
  )
}

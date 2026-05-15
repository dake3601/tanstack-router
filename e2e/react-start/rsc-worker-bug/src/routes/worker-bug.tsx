import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/worker-bug')({
  component: WorkerBug,
})

function WorkerBug() {
  const [reply, setReply] = useState<string>('(no reply yet)')

  const spawn = () => {
    setReply('(spawning...)')
    const worker = new Worker(
      /* webpackChunkName: "my-worker" */ new URL(
        './-worker/spawn.js',
        import.meta.url,
      ),
      { type: 'module' },
    )
    worker.onmessage = (event: MessageEvent<string>) => {
      setReply(event.data)
      worker.terminate()
    }
    worker.onerror = (event) => {
      setReply(`(error: ${event.message || 'unknown'})`)
      worker.terminate()
    }
    worker.postMessage('hello from route')
  }

  return (
    <div>
      <h1>worker bug</h1>
      <button type="button" onClick={spawn}>
        spawn worker
      </button>
      <p>
        worker reply:{' '}
        <code data-testid="worker-reply">{reply}</code>
      </p>
    </div>
  )
}

import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => (
    <div>
      <h1>rsc worker bug repro</h1>
      <Link to="/worker-bug">go to repro route</Link>
    </div>
  ),
})

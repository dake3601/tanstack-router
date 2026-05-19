import { createRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { routeTree } from './routeTree.gen'

// A simple error component to catch any errors in the route tree with useEffect
function defaultErrorComponent({ error }: { error: Error }) {
  useEffect(() => {
    console.error('Route error:', error)
  }, [error])

  return <div>{error.message}</div>
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent,
  })
}

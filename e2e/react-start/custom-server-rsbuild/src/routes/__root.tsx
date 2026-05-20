import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { CustomScripts } from '../CustomScripts'
import '../styles/app.css'

// `import.meta.env.CJS` is injected by rsbuild's `source.define`.
const SCRIPTS_COMPONENT: typeof Scripts = import.meta.env.CJS
  ? (CustomScripts as typeof Scripts)
  : Scripts

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Rsbuild custom server test' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <HeadContent />
        {import.meta.env.CJS && <script src="/static/js/index.js" defer />}
      </head>
      <body>
        <Outlet />
        <SCRIPTS_COMPONENT />
      </body>
    </html>
  )
}

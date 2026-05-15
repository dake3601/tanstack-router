// Worker source — any external npm import is enough to trigger the bug.
import * as clsx from 'clsx'

self.onmessage = (event) => {
  const tag = (clsx.default ?? clsx)('echo')
  self.postMessage(`${tag}: ${event.data}`)
}

// Mirrors upstream `<Scripts />` from `@tanstack/react-router`. One
// divergence: drops the default ESM client-entry tag.
import { Asset, useRouter } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { deepEqual } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import type { RouterManagedTag } from '@tanstack/router-core'

export function isEsmClientEntryScript(asset: RouterManagedTag): boolean {
  if (asset.tag !== 'script') return false
  if (asset.attrs?.type !== 'module') return false
  if (typeof asset.children !== 'string') return false
  return /^import\(/.test(asset.children)
}

export const CustomScripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  const getAssetScripts = (matches: Array<any>) => {
    const assetScripts: Array<RouterManagedTag> = []
    const manifest = router.ssr?.manifest

    if (!manifest) {
      return []
    }

    matches
      .map((match) => router.looseRoutesById[match.routeId]!)
      .forEach((route) =>
        manifest.routes[route.id]?.assets
          ?.filter((d) => d.tag === 'script')
          // DIFF with Scripts - drop esm script entries
          .filter((d) => !isEsmClientEntryScript(d))
          .forEach((asset) => {
            assetScripts.push({
              tag: 'script',
              attrs: { ...asset.attrs, nonce },
              children: asset.children,
            } as any)
          }),
      )

    return assetScripts
  }

  const getScripts = (matches: Array<any>): Array<RouterManagedTag> =>
    (
      matches
        .map((match) => match.scripts!)
        .flat(1)
        .filter(Boolean) as Array<RouterManagedTag>
    ).map(
      ({ children, ...script }) =>
        ({
          tag: 'script',
          attrs: {
            ...script,
            suppressHydrationWarning: true,
            nonce,
          },
          children,
        }) satisfies RouterManagedTag,
    )

  if (isServer ?? router.isServer) {
    const activeMatches = router.stores.matches.get()
    const assetScripts = getAssetScripts(activeMatches)
    const scripts = getScripts(activeMatches)
    return renderScripts(router, scripts, assetScripts)
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const assetScripts = useStore(
    router.stores.matches,
    getAssetScripts,
    deepEqual,
  )
  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const scripts = useStore(router.stores.matches, getScripts, deepEqual)

  return renderScripts(router, scripts, assetScripts)
}

function renderScripts(
  router: ReturnType<typeof useRouter>,
  scripts: Array<RouterManagedTag>,
  assetScripts: Array<RouterManagedTag>,
) {
  let serverBufferedScript: RouterManagedTag | undefined = undefined

  if (router.serverSsr) {
    serverBufferedScript = router.serverSsr.takeBufferedScripts()
  }

  const allScripts = [...scripts, ...assetScripts] as Array<RouterManagedTag>

  if (serverBufferedScript) {
    allScripts.unshift(serverBufferedScript)
  }

  return (
    <>
      {allScripts.map((asset, i) => (
        <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
      ))}
    </>
  )
}

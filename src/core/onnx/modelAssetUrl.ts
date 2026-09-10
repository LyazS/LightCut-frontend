function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function modelAssetUrl(pathname: string): string {
  const configuredBaseUrl = import.meta.env.VITE_MODEL_ASSET_BASE_URL?.trim()
  if (configuredBaseUrl) {
    return `${trimTrailingSlash(configuredBaseUrl)}/${pathname}`
  }

  const appBaseUrl = import.meta.env.BASE_URL || '/'
  return `${trimTrailingSlash(appBaseUrl)}/model-assets/${pathname}`
}

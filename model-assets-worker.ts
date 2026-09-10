interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
  CORS_ALLOWED_ORIGINS: string
}

function allowedOrigins(value: string): Set<string> {
  return new Set(
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
}

function corsHeaders(origin: string): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    Vary: 'Origin',
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const allowed = origin !== null && allowedOrigins(env.CORS_ALLOWED_ORIGINS).has(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: allowed ? 204 : 403,
        headers: allowed ? corsHeaders(origin) : undefined,
      })
    }

    const response = await env.ASSETS.fetch(request)
    if (!allowed) return response

    const headers = new Headers(response.headers)
    corsHeaders(origin).forEach((value, name) => headers.set(name, value))
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}

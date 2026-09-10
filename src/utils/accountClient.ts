import type { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, User } from '@/utils/types'

const accountApiBaseUrl = import.meta.env.VITE_ACCOUNT_API_BASE_URL

interface AccountError extends Error {
  status?: number
  code?: string
}

interface BalanceResponse {
  balance: string
  version: number
}

interface ActivationRedemptionResponse {
  amount: string
  current_balance: string
}

interface AccountErrorBody {
  code?: string
  message?: string
}

let csrfToken: string | null = null
let refreshPromise: Promise<void> | null = null
let refreshEpoch = 0

const authChannel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('lightcut-account-auth')

authChannel?.addEventListener('message', (event: MessageEvent<{ type: string; csrfToken?: string }>) => {
  if (event.data.type === 'refreshed' && event.data.csrfToken) {
    csrfToken = event.data.csrfToken
    refreshEpoch += 1
  }
  if (event.data.type === 'logged-out') {
    csrfToken = null
  }
})

function accountUrl(path: string): string {
  if (!accountApiBaseUrl) {
    throw new Error('Account API is not configured')
  }
  return new URL(path, accountApiBaseUrl).toString()
}

function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

function apiError(status: number, body: unknown): AccountError {
  const errorBody = body && typeof body === 'object' ? (body as AccountErrorBody) : undefined
  const error = new Error(errorBody?.message || `HTTP ${status}`) as AccountError
  error.status = status
  error.code = errorBody?.code
  return error
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('application/json') ? response.json() : response.text()
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { csrf?: boolean; idempotency?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  if (options.csrf) {
    if (!csrfToken) throw new Error('CSRF token is unavailable')
    headers.set('X-CSRF-Token', csrfToken)
  }
  if (options.idempotency) headers.set('Idempotency-Key', newIdempotencyKey())

  const response = await fetch(accountUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  })
  const body = await parseBody(response)
  if (!response.ok) throw apiError(response.status, body)
  return body as T
}

async function fetchCsrfToken(): Promise<void> {
  const response = await request<{ csrfToken: string }>('/api/auth/csrf')
  csrfToken = response.csrfToken
}

async function refreshSession(): Promise<void> {
  if (refreshPromise) return refreshPromise

  const epochBeforeRefresh = refreshEpoch
  const refresh = async (): Promise<void> => {
    if (refreshEpoch !== epochBeforeRefresh) return
    if (!csrfToken) await fetchCsrfToken()
    const response = await request<LoginResponse>('/api/auth/refresh', { method: 'POST' }, { csrf: true })
    csrfToken = response.csrfToken
    refreshEpoch += 1
    authChannel?.postMessage({ type: 'refreshed', csrfToken })
  }

  const pending: Promise<void> = (async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request('lightcut-account-refresh', { mode: 'exclusive' }, refresh)
    } else {
      await refresh()
    }
  })()
  refreshPromise = pending.finally(() => {
    refreshPromise = null
  })
  return pending
}

async function authenticatedRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { csrf?: boolean; idempotency?: boolean } = {},
): Promise<T> {
  try {
    return await request<T>(path, init, options)
  } catch (error) {
    if ((error as AccountError).status !== 401) throw error
    try {
      await refreshSession()
      return await request<T>(path, init, options)
    } catch (refreshError) {
      csrfToken = null
      throw refreshError
    }
  }
}

export const accountClient = {
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    return request<RegisterResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    csrfToken = response.csrfToken
    return response
  },

  async currentUser(): Promise<Omit<User, 'balance'>> {
    const response = await authenticatedRequest<{ user: Omit<User, 'balance'> }>('/api/auth/me')
    return response.user
  },

  async getBalance(): Promise<BalanceResponse> {
    return authenticatedRequest<BalanceResponse>('/api/balance')
  },

  async redeemActivationCode(code: string): Promise<ActivationRedemptionResponse> {
    if (!csrfToken) await fetchCsrfToken()
    return authenticatedRequest<ActivationRedemptionResponse>(
      '/api/activation-code/use',
      { method: 'POST', body: JSON.stringify({ code }) },
      { csrf: true, idempotency: true },
    )
  },

  async logout(): Promise<void> {
    if (!csrfToken) await fetchCsrfToken()
    try {
      await authenticatedRequest<void>('/api/auth/logout', { method: 'POST' }, { csrf: true })
    } finally {
      csrfToken = null
      authChannel?.postMessage({ type: 'logged-out' })
    }
  },
}

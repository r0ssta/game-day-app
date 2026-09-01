import type { APIRequestContext, APIResponse } from '@playwright/test'

export async function postMatchAction(
  request: APIRequestContext,
  token: string,
  path: string,
  data: Record<string, unknown>,
): Promise<{ response: APIResponse; body: Record<string, unknown> }> {
  const response = await request.post(path, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  })
  const body = (await response.json()) as Record<string, unknown>
  return { response, body }
}

export function actionError(body: Record<string, unknown>): string {
  return typeof body.error === 'string' ? body.error : JSON.stringify(body)
}

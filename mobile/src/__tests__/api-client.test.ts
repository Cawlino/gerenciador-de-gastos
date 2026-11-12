/// <reference types="jest" />

import { ApiError, createApiClient } from '../api/client';
import {
  isValidUuid,
  mapItemStatus,
  mapSyncRunStatus,
  mapTriggerLabel,
  maskItemId,
} from '../utils/connectionHelpers';

function mockJsonResponse(status: number, body: unknown, raw = false): Response {
  const textValue =
    typeof body === 'string' && raw ? body : body === null ? '' : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => textValue,
  } as unknown as Response;
}

describe('Cliente REST e helpers de conexão', () => {
  const originalUrl = process.env.EXPO_PUBLIC_API_URL;
  const originalKey = process.env.EXPO_PUBLIC_APP_KEY;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_APP_KEY;
  });

  afterAll(() => {
    if (originalUrl !== undefined) process.env.EXPO_PUBLIC_API_URL = originalUrl;
    if (originalKey !== undefined) process.env.EXPO_PUBLIC_APP_KEY = originalKey;
  });

  it('falha com ApiError claro quando EXPO_PUBLIC_API_URL ou EXPO_PUBLIC_APP_KEY faltam', async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    const noUrlClient = createApiClient({ baseUrl: '', appKey: 'secret', fetchFn: fetchMock });

    await expect(noUrlClient.getDashboard()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'missing_api_url',
    });

    const noKeyClient = createApiClient({
      baseUrl: 'https://example.supabase.co/functions/v1/api',
      appKey: '',
      fetchFn: fetchMock,
    });
    await expect(noKeyClient.getDashboard()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'missing_app_key',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chama /health sem header x-app-key e endpoints protegidos com x-app-key e query string', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () =>
      mockJsonResponse(200, { ok: true, service: 'finance-api' }),
    );
    const client = createApiClient({
      baseUrl: 'https://proj.supabase.co/functions/v1/api/',
      appKey: 'app-key-teste',
      fetchFn: fetchMock,
    });

    await client.health();
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://proj.supabase.co/functions/v1/api/health', {
      method: 'GET',
      headers: {},
      body: undefined,
    });

    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(200, { results: [], limit: 20, offset: 0 }),
    );
    await client.getTransactions({
      month: '2026-11',
      type: 'expense',
      q: 'mercado livre',
      includeExcluded: true,
      limit: 20,
      offset: 0,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://proj.supabase.co/functions/v1/api/transactions?month=2026-11&type=expense&q=mercado%20livre&includeExcluded=true&limit=20&offset=0',
      {
        method: 'GET',
        headers: { 'x-app-key': 'app-key-teste' },
        body: undefined,
      },
    );
  });

  it('envia métodos e payloads JSON corretos nas mutações e trata erros JSON e HTML', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(mockJsonResponse(200, { ok: true, sync: { fetchedCount: 12 } }))
      .mockResolvedValueOnce(mockJsonResponse(200, { settings: { exclude_own_transfers: false } }))
      .mockResolvedValueOnce(
        mockJsonResponse(422, { error: 'validation_error', message: 'UUID inválido' }),
      )
      .mockResolvedValueOnce(mockJsonResponse(502, 'Bad Gateway', true));

    const client = createApiClient({
      baseUrl: 'https://proj.supabase.co/functions/v1/api',
      appKey: 'app-key-teste',
      fetchFn: fetchMock,
    });

    await client.sync({ itemId: 'item-1', fullSync: true, trigger: 'manual' });
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://proj.supabase.co/functions/v1/api/sync', {
      method: 'POST',
      headers: {
        'x-app-key': 'app-key-teste',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ itemId: 'item-1', fullSync: true, trigger: 'manual' }),
    });

    await client.updateSettings({ exclude_own_transfers: false });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://proj.supabase.co/functions/v1/api/settings',
      {
        method: 'PATCH',
        headers: {
          'x-app-key': 'app-key-teste',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ exclude_own_transfers: false }),
      },
    );

    await expect(client.registerItem({ itemId: 'bad', sync: true })).rejects.toThrow(ApiError);
    await expect(client.getItems()).rejects.toMatchObject({
      status: 502,
      code: 'http_502',
    });
  });

  it('valida UUIDs, mascara item IDs e traduz status da Pluggy para PT-BR', () => {
    expect(isValidUuid('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isValidUuid('nao-e-uuid')).toBe(false);
    expect(maskItemId('12345678-aaaa-bbbb-cccc-1234567890ef')).toBe('12345678…90ef');
    expect(mapItemStatus('UPDATED', 'SUCCESS')).toEqual({
      label: 'Conectado',
      variant: 'success',
    });
    expect(mapItemStatus('LOGIN_ERROR')).toEqual({
      label: 'Requer reconexão',
      variant: 'error',
    });
    expect(mapItemStatus('WAITING_USER_INPUT')).toEqual({
      label: 'Aguardando usuário',
      variant: 'warning',
    });
    expect(mapSyncRunStatus('success')).toEqual({ label: 'Sucesso', variant: 'success' });
    expect(mapTriggerLabel('pull_to_refresh')).toBe('Pull-to-refresh');
  });
});

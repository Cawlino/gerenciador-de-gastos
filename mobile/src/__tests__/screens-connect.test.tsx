/// <reference types="jest" />

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ExpoRouter from 'expo-router';
import ConnectScreen from '../../app/connect';
import { apiClient } from '../api/client';

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('ConnectScreen — falhas, retry e fechamento do widget', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    queryClient = createClient();
    jest.spyOn(ExpoRouter, 'useLocalSearchParams').mockReturnValue({});
    jest.spyOn(ExpoRouter, 'useRouter').mockReturnValue({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    } as unknown as ReturnType<typeof ExpoRouter.useRouter>);
  });

  afterEach(() => {
    queryClient.clear();
  });

  function wrap(ui: React.ReactElement) {
    return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
  }

  it('exibe estado de erro ao falhar connectToken e permite gerar novo token', async () => {
    const tokenSpy = jest
      .spyOn(apiClient, 'createConnectToken')
      .mockRejectedValueOnce(new Error('Falha ao gerar token'))
      .mockResolvedValueOnce({ accessToken: 'connect-token-retry-123456' });

    await render(wrap(<ConnectScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('connect-error')).toBeTruthy();
    });

    expect(screen.getByText('Falha ao gerar token')).toBeTruthy();
    expect(screen.getByText('Conectar Banco Inter')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('connect-retry-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('pluggy-connect-mock')).toBeTruthy();
    });

    expect(screen.getByTestId('pluggy-connect-mock').props.connectToken).toBe(
      'connect-token-retry-123456',
    );
    expect(tokenSpy).toHaveBeenCalledTimes(2);
  });

  it('trata onError do widget e redireciona via replace ao fechar sem historico', async () => {
    const replaceMock = jest.fn();
    jest.spyOn(ExpoRouter, 'useRouter').mockReturnValue({
      push: jest.fn(),
      back: jest.fn(),
      replace: replaceMock,
      canGoBack: jest.fn(() => false),
    } as unknown as ReturnType<typeof ExpoRouter.useRouter>);

    jest
      .spyOn(apiClient, 'createConnectToken')
      .mockResolvedValue({ accessToken: 'connect-token-valid-123456' });

    await render(wrap(<ConnectScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('pluggy-connect-mock')).toBeTruthy();
    });

    const widget = screen.getByTestId('pluggy-connect-mock');
    await act(async () => {
      (widget.props.onError as (err: { message?: string }) => void)({
        message: 'Banco indisponível no momento',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Banco indisponível no momento')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('connect-back-btn'));
    expect(replaceMock).toHaveBeenCalledWith('/(tabs)/settings');
  });
});

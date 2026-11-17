import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { ApiClient } from '../api/client';
import { createDemoApiClient } from '../utils/demoDataGenerator';

export interface PrivacyDemoContextValue {
  isPrivacyHidden: boolean;
  isDemoMode: boolean;
  togglePrivacy: () => void;
  setPrivacyHidden: (value: boolean) => void;
  toggleDemoMode: () => void;
  setDemoMode: (value: boolean) => void;
  demoClient: ApiClient;
}

let fallbackDemoClientSingleton: ApiClient | null = null;
function getFallbackDemoClient(): ApiClient {
  if (!fallbackDemoClientSingleton) {
    fallbackDemoClientSingleton = createDemoApiClient();
  }
  return fallbackDemoClientSingleton;
}

const DEFAULT_CONTEXT: PrivacyDemoContextValue = {
  isPrivacyHidden: false,
  isDemoMode: false,
  togglePrivacy: () => undefined,
  setPrivacyHidden: () => undefined,
  toggleDemoMode: () => undefined,
  setDemoMode: () => undefined,
  get demoClient() {
    return getFallbackDemoClient();
  },
};

const PrivacyDemoContext = createContext<PrivacyDemoContextValue>(DEFAULT_CONTEXT);

export interface PrivacyDemoProviderProps {
  children: React.ReactNode;
  initialPrivacyHidden?: boolean;
  initialDemoMode?: boolean;
}

/**
 * Provedor global dos modos de Privacidade (Olho) e Demonstração (12 meses em memória).
 * Com ambos desativados (padrão), o aplicativo exibe integralmente os dados reais.
 */
export function PrivacyDemoProvider({
  children,
  initialPrivacyHidden = false,
  initialDemoMode = false,
}: PrivacyDemoProviderProps) {
  const [isPrivacyHidden, setIsPrivacyHidden] = useState(initialPrivacyHidden);
  const [isDemoMode, setIsDemoMode] = useState(initialDemoMode);
  const [demoClient, setDemoClient] = useState<ApiClient>(() => createDemoApiClient());

  const togglePrivacy = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
    setIsPrivacyHidden((prev) => !prev);
  }, []);

  const setPrivacyHidden = useCallback((value: boolean) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setIsPrivacyHidden(value);
  }, []);

  const setDemoMode = useCallback((value: boolean) => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (value) {
      setDemoClient(createDemoApiClient());
    }
    setIsDemoMode(value);
  }, []);

  const toggleDemoMode = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
    setIsDemoMode((prev) => {
      const next = !prev;
      if (next) {
        setDemoClient(createDemoApiClient());
      }
      return next;
    });
  }, []);

  const value = useMemo<PrivacyDemoContextValue>(
    () => ({
      isPrivacyHidden,
      isDemoMode,
      togglePrivacy,
      setPrivacyHidden,
      toggleDemoMode,
      setDemoMode,
      demoClient,
    }),
    [demoClient, isDemoMode, isPrivacyHidden, setDemoMode, setPrivacyHidden, toggleDemoMode, togglePrivacy],
  );

  return <PrivacyDemoContext.Provider value={value}>{children}</PrivacyDemoContext.Provider>;
}

/**
 * Lê e controla os estados globais de Privacidade e Simulação de Dados Fictícios (12 meses).
 */
export function usePrivacyDemo(): PrivacyDemoContextValue {
  return useContext(PrivacyDemoContext);
}

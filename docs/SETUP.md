# Guia de Setup — Gerenciador de Gastos (Inter via Pluggy)

Passo a passo para configurar contas, credenciais, ambiente local e build Android sem expor segredos no Git.

---

## 1. Pré-requisitos no PC

- **Node.js 20+** e **npm**
- **Docker Desktop** (obrigatório para o Supabase local e testes `T4`/`T5`)
- **Deno 2+** (para Edge Functions e testes `T2`/`T3`)
- **GitHub CLI (`gh`)** autenticado
- **gitleaks** (para auditoria de histórico em `T1`)

---

## 2. Pluggy (Meu Pluggy + Developer Dashboard)

1. Acesse [meu.pluggy.ai](https://meu.pluggy.ai), crie sua conta pessoal e conecte o **Banco Inter** via Open Finance.
   - O **Meu Pluggy é gratuito para uso pessoal** (até 5 conexões), mesmo depois que o aviso de trial de 15 dias do dashboard expirar.
2. Acesse [dashboard.pluggy.ai](https://dashboard.pluggy.ai) com o mesmo e-mail, crie uma aplicação e copie:
   - `PLUGGY_CLIENT_ID`
   - `PLUGGY_CLIENT_SECRET` (salve imediatamente ao criar)
3. Conecte sua conta do **MeuPluggy** na aplicação e anote o `PLUGGY_ITEM_ID` (UUID da conexão).
   > No plano gratuito, `GET /items` (listagem geral) retorna 403 (`LIST_ITEMS_FEATURE_NOT_ENABLED`), então guarde sempre o `itemId`. Já `GET /items/{id}` funciona normalmente.

---

## 3. Supabase (sa-east-1 · São Paulo)

1. Faça login no CLI:
   ```bash
   npx supabase login
   ```
2. Crie ou vincule um projeto gratuito na região `sa-east-1` (São Paulo):
   ```bash
   npx supabase projects create gerenciador-de-gastos --org-id <ORG_ID> --region sa-east-1 --db-password <SENHA>
   npx supabase link --project-ref <PROJECT_REF>
   ```
3. Configure os segredos das Edge Functions (nunca coloque em arquivo versionado):
   ```bash
   npx supabase secrets set \
     PLUGGY_CLIENT_ID=... \
     PLUGGY_CLIENT_SECRET=... \
     APP_KEY=... \
     WEBHOOK_TOKEN=...
   ```

---

## 4. Variáveis de Ambiente Locais (`.env`)

Copie o template e preencha os valores reais:

```bash
cp .env.example .env
```

Preencha também `PII_GUARD` com dados que jamais devem ir para commits públicos (seu `itemId`, IDs das contas, número da conta, CPF, nome completo). O hook `pre-commit` (`scripts/check-pii.mjs`) bloqueia qualquer commit que contenha esses trechos.

---

## 5. App Android (Expo Dev Build, EAS ou Build Local no Emulador)

Como o efeito **Liquid Glass** usa shaders Skia (`@shopify/react-native-skia`) e a New Architecture, ele **não roda no Expo Go** — use uma das duas opções abaixo:

### Opção A — EAS Build (dispositivo físico / preview APK na nuvem)

```bash
cd mobile
npx eas login
npx eas build -p android --profile development
```

Para gerar o APK final de uso pessoal (sem depender do PC):

```bash
npx eas build -p android --profile preview
```

### Opção B — Emulador Android Local + Build Local Automatizado

Ideal para testar e rodar E2E (`T8`) localmente sem esperar fila do EAS:

1. Pré-requisitos no PC: **Java 17+ (`JAVA_HOME`)** e **Android SDK** (`platform-tools`, `emulator`, NDK `27.1.12297006`, CMake `3.22.1`) com um AVD configurado (ex.: `medium_phone`).
2. Suba o emulador local:
   ```bash
   npm run emulator:up
   ```
   - Opções úteis: `--avd <nome>`, `--cold` (boot limpo sem snapshot) e `--stop` (encerra o emulador).
   - O script usa `ADB_LOCAL_TRANSPORT_MAX_PORT=5555` no Windows (evita porta fantasma `emulator-5562 offline`) e ajusta `hw.ramSize=4096` quando há ≥ 12 GB de RAM no host.
3. Compile o APK release localmente e instale no emulador/dispositivo conectado:
   ```bash
   npm run android:local
   ```
   - No Windows, o script espelha `mobile/` para um caminho ASCII curto (`C:\gdg-build\mobile`) com `buildStagingDirectory` em `C:/x` e `-DCMAKE_OBJECT_PATH_MAX=240` (evita falhas do CMake/Ninja com acentos e limite `MAX_PATH` de 260 caracteres), salva em `mobile/android/app/build/outputs/apk/release/app-release.apk` e instala via `adb install -r`.
   - Opções úteis: `--launch`, `--arch <abi>`, `--build-type debug|release`, `--no-install`, `--clean`.

---

## 6. Testes E2E (Maestro via Emulador Local ou Wi-Fi ADB)

1. Instale o **Maestro CLI** (requer Java 17+) em `%USERPROFILE%\.maestro\bin` (ou no `PATH`).
2. Escolha o alvo:
   - **Emulador local (Opção B):** rode `npm run emulator:up` e garanta que o app esteja instalado com `npm run android:local`.
   - **Celular físico sem cabo (Opção A — Wi-Fi ADB):**
     1. No celular Android: **Configurações → Sobre o telefone → toque 7× em Número da versão**.
     2. Em **Opções do desenvolvedor**, ative **Depuração sem fio**.
     3. Toque em **Parear dispositivo com código** e rode no PC:
        ```bash
        adb pair <IP>:<PORTA_PAREAMENTO>
        adb connect <IP>:<PORTA_CONEXAO>
        ```
3. Rode os fluxos E2E:
   ```bash
   npm run test:t8
   ```
   Em emuladores locais, `scripts/run-t8.mjs` desativa temporariamente as escalas de animação do Android durante a suíte (alinhando `useReducedMotion()` do Reanimated com `mobile/.maestro/config.yaml`) e as restaura automaticamente ao terminar.

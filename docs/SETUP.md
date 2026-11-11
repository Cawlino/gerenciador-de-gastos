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

## 5. App Android (Expo Dev Build + EAS)

Como o efeito **Liquid Glass** usa shaders Skia (`@shopify/react-native-skia`) e a New Architecture, ele **não roda no Expo Go** — é necessário gerar um **Expo Development Build** (ou APK de preview):

```bash
cd mobile
npx eas login
npx eas build -p android --profile development
```

Para gerar o APK final de uso pessoal (sem depender do PC):

```bash
npx eas build -p android --profile preview
```

---

## 6. Testes E2E sem cabo (Wi-Fi ADB + Maestro)

1. No celular Android: **Configurações → Sobre o telefone → toque 7× em Número da versão**.
2. Em **Opções do desenvolvedor**, ative **Depuração sem fio**.
3. Toque em **Parear dispositivo com código** e rode no PC:
   ```bash
   adb pair <IP>:<PORTA_PAREAMENTO>
   adb connect <IP>:<PORTA_CONEXAO>
   ```
4. Rode os fluxos E2E:
   ```bash
   npm run test:t8
   ```

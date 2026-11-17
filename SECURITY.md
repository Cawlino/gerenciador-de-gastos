# Política de Segurança e Privacidade (`SECURITY.md`)

## Garantias deste Repositório Público

Este projeto foi auditado e sanitizado para publicação aberta mantendo **zero exposição** de dados financeiros pessoais, credenciais ou identificadores operacionais privados:

1. **Sem credenciais ou segredos:** `.env`, `mobile/.env`, `supabase/.temp/`, keystores e artefatos de build (`.apk`, `.aab`) são ignorados via `.gitignore` e bloqueados no hook `pre-commit` (`scripts/check-pii.mjs` + `secretlint`).
2. **Sem dados reais ou PII:** todas as fixtures em `fixtures/synthetic/` e os dados do **Modo Demo 12M** (`mobile/src/utils/demoDataGenerator.ts`) são 100% sintéticos e determinísticos.
3. **Banco de dados isolado:** o schema `finance` possui **RLS habilitado sem policies** e revogação total para `anon` e `authenticated`, acessível apenas via Edge Functions autenticadas.
4. **Auditoria contínua (`T1`):** qualquer alteração passa por `check-pii.mjs`, `secretlint` e `gitleaks` no histórico completo Git.

## Reportando Vulnerabilidades

Caso identifique qualquer possível problema de segurança neste código, por favor entre em contato diretamente pelo GitHub (`@Cawlino`) ou via LinkedIn (`danielbarrionuevo`) antes de abrir uma issue pública com detalhes exploráveis.

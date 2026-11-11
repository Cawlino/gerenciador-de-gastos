# STATUS — GerenciadorDeGastos

**Última Atualização:** 2026-11-11 17:30 (-03:00)

## 📍 Ponto Exato de Parada / Onde Estamos
**Fase 4 (Backend / Edge Functions) concluída e validada localmente** com bateria cumulativa `T1–T6` **100% verde** (`docs/test-reports/fase-04.md`). Falta apenas a `SUPABASE_DB_PASSWORD` real do projeto remoto `<SUPABASE_PROJECT_REF>` no `.env` para aplicar migrations + deploy das Edge Functions em produção.

## ✅ Tarefas Concluídas Recentemente
- Edge Functions em Deno 2 + Hono: `_shared/{schemas,rules,categorize,pluggy,db,sync}.ts`, `api/index.ts`, `pluggy-webhook/index.ts` e `_mock/pluggy-mock.ts`.
- Correção crítica em `_shared/db.ts` (`sql.json` via `toJsonb`) evitando dupla serialização de colunas JSONB no `postgres.js`.
- Suítes ativadas: **T3** (`deno test`, 10/10), **T5** (`tests/integration/api.test.ts` + mock + Edge Runtime local, 8/8) e **T6** (`tests/contract/pluggy.contract.test.ts` contra Pluggy v2 real read-only, 4/4).
- Bateria cumulativa Fase 4 (`npm run test:all -- --phase 4`): **T1, T2, T4 (36/36), T3, T5, T6** aprovadas (`docs/test-reports/fase-04.md`).
- CI (`.github/workflows/ci.yml`) atualizado para executar T1–T5 automaticamente.

## ⏳ Tarefas em Andamento
- Deploy remoto da Fase 3/4 aguardando `SUPABASE_DB_PASSWORD` real no `.env` (`db push --include-seed`, `secrets set`, `functions deploy`).

## 🚧 Pendências / Atenção
- Atualizar `SUPABASE_DB_PASSWORD` real no `.env` local (projeto `<SUPABASE_PROJECT_REF>`) antes de rodar deploy remoto; **nunca** rodar `db reset --linked` (outras tabelas em `public`).

## 🎯 Próxima Ação Imediata
Usuário atualizar `SUPABASE_DB_PASSWORD` real no `.env` seguindo o passo a passo fornecido e autorizar o deploy remoto ou o avanço para a **Fase 5 (Design System Liquid Glass Skia)**.

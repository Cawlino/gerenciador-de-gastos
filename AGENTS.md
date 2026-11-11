# AGENTS — Protocolo Universal

1. No início de cada sessão, leia `.context/STATUS.md`.
2. Consulte `.context/MEMORY.md` para arquitetura/stack e `.context/DECISIONS.md` para ADRs quando necessário.
3. Não contrarie ADRs aceitas; registre novas decisões como ADR (append-only).
4. Ao concluir tarefas relevantes, atualize `.context/STATUS.md` (< 100 linhas).
5. Nunca commitar segredos (CLIENT_ID/CLIENT_SECRET da Pluggy) — usar `.env` e `.gitignore`.

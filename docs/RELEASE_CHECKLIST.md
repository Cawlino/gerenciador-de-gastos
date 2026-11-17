# Checklist de Entrega e Publicação — Fase 10

Use este roteiro para a validação final no dispositivo físico e antes de qualquer push/publicação no GitHub.

---

## 1. Instalação do APK standalone no celular Android

O build release universal (`arm64-v8a,x86_64`) é gerado em:
- `mobile/android/app/build/outputs/apk/release/app-release.apk`

Para instalar direto no celular via cabo USB ou Wi-Fi ADB (sem Metro/Expo):

```bash
adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
```

Ou copie o arquivo `app-release.apk` para o aparelho e abra pelo gerenciador de arquivos (permitindo instalação da fonte local).

---

## 2. Conferência manual com o app do Banco Inter

1. **Carregamento autônomo (sem PC):** abrir o app **Gastos** no celular apenas no Wi-Fi/4G → o **Painel** carrega os dados reais sem depender de Metro/Expo.
2. **Saldo da conta corrente:** comparar o valor em **Saldo em Conta** no Painel com o saldo disponível no aplicativo do Banco Inter.
3. **Navegação por mês:** alternar entre os meses com `<` e `>` no topo do Painel → cards **Receitas**, **Despesas**, saldo líquido e rosca atualizam conforme o mês selecionado.
4. **Filtro de transações:** abrir **Transações**, filtrar **Saídas** → confirmar que apenas despesas efetivas são exibidas.
5. **Recategorização persistente (R9):** abrir o detalhe de uma transação PIX, trocar a categoria (com ou sem **Aplicar a semelhantes**) → voltar ao Painel e verificar que o gráfico por categoria atualizou; depois acionar sync e confirmar que a categoria manual foi preservada.
6. **Pull-to-refresh (`PATCH /items`):** puxar para baixo no **Painel**, **Transações** ou **Conexão** → `last_synced_at` atualiza e a sincronização conclui com status positivo.
7. **Exclusões (R2/R4/R5):** verificar no filtro **Excluídas** (ou visual esmaecido na lista geral) que pagamento de fatura, transferências entre contas próprias e investimentos estão excluídos das somas de receitas e despesas.
8. **Cartão Inter GOLD (R10):** conferir no card do cartão no **Painel** e na aba **Conexão** os valores de **Fatura atual**, **Limite disponível / total** e **Vencimento**.
9. **Reconexão via widget Pluggy:** na aba **Conexão**, tocar em **Gerenciar / Reconectar no Pluggy** → validar abertura do modal **Pluggy Connect** sem erro de token.

---

## 3. Checklist de segurança pré-publicação GitHub

- [x] `.gitignore` cobre `.env`, `.env.*`, `*.jks`, `*.keystore`, `credentials.json`, `fixtures/real/`, `supabase/.temp/` e `mobile/android/`
- [x] Nenhum arquivo `.env` real versionado no Git (`git ls-files .env*` retorna apenas `.env.example`)
- [x] `gitleaks git . --no-banner` executado com **0 findings**
- [x] `npm run test:t1` (`check-pii` + `secretlint` + `gitleaks`) aprovado após o último commit
- [ ] Confirmar CI verde (`.github/workflows/ci.yml`: `T1–T3, T7` e `T4–T5`)
- [x] Projeto remoto (`<SUPABASE_PROJECT_REF>` via `.env`) com webhook ativo e `pg_cron` diário (`finance-daily-sync`)
- [x] Repositório `Cawlino/gerenciador-de-gastos` sanitizado (histórico e arquivos) e preparado para publicação pública segura

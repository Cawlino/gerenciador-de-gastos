# DECISIONS (ADRs) — append-only

Formato: `## ADR-00X: Título` com Status, Contexto, Decisão, Consequências.

## ADR-001: Mobile com React Native + Expo (TypeScript), foco Android
- **Status:** Aceito (2026-11-11)
- **Contexto:** App pessoal; Pluggy oferece `react-native-pluggy-connect` e quickstart Expo; usuário sem necessidade de iOS agora.
- **Decisão:** Expo + Expo Router + TypeScript; distribuição via APK pessoal (EAS Build). iOS possível depois.
- **Consequências:** Testes via Expo Go/dev build; deep link para OAuth do widget precisa de `scheme` próprio.

## ADR-002: Backend em Supabase (Edge Functions + Postgres)
- **Status:** Aceito (2026-11-11)
- **Contexto:** `CLIENT_SECRET` da Pluggy não pode ficar no app; precisa de URL HTTPS pública para webhook e armazenamento de histórico.
- **Decisão:** Supabase free tier. Edge Functions (Deno) guardam segredos e falam com a Pluggy; Postgres guarda items, contas, transações e categorias.
- **Consequências:** App nunca fala com a Pluggy diretamente (exceto widget com connectToken de curta duração).

## ADR-003: Acesso protegido por chave fixa (sem login)
- **Status:** Aceito (2026-11-11) — risco aceito pelo usuário
- **Contexto:** Uso estritamente pessoal; usuário preferiu simplicidade a login.
- **Decisão:** App envia header `x-app-key`; Edge Functions validam contra secret `APP_KEY`. Tabelas com RLS ativo e sem policies (anon bloqueado); só service role acessa.
- **Consequências:** Quem extrair a chave do APK acessa os dados. Mitigar: não distribuir APK, chave longa e rotacionável.

## ADR-004: Sincronização por webhook + refresh manual
- **Status:** Aceito (2026-11-11)
- **Decisão:** Webhook Pluggy (`item/updated`, `transactions/*`) dispara sync para o Postgres; pull-to-refresh no app força `PATCH /items/{id}` + sync.
- **Consequências:** App lê sempre do Postgres (rápido); webhook protegido por token na URL.

## ADR-005: Escopo de contas e regras de negócio
- **Status:** Aceito (2026-11-11)
- **Decisão:** Conta corrente + cartão de crédito Inter. Pagamento de fatura e transferências entre contas próprias são excluídos de receitas/despesas. Categorias Pluggy traduzidas/agrupadas, com override manual por transação. Painel: saldo da conta corrente; receitas/despesas por mês com navegação; gráfico de rosca por categoria.

## ADR-006: Reaproveitamento de projeto Supabase com schema `finance` isolado
- **Status:** Aceito (2026-11-11)
- **Contexto:** Cota gratuita da organização no Supabase já utilizava `2/2` projetos ativos em produção, sendo um deles compartilhado com tabelas existentes no schema `public`.
- **Decisão:** Isolar todas as tabelas, views e funções do Gerenciador de Gastos no schema dedicado `finance` (com RLS ativo e sem policies), mantendo o schema `public` 100% intacto e nunca usando `db reset --linked`. Edge Functions conectam via `SUPABASE_DB_URL` para não expor `finance` na API PostgREST pública.
- **Consequências:** Zero impacto no schema `public`. Nota de segurança: `service_role` do projeto continua tendo acesso administrativo a todos os schemas; para isolamento físico completo no futuro, basta migrar para um projeto dedicado.

## ADR-007: Automação Android Local (Opção B) e E2E Maestro no Windows
- **Status:** Aceito (2026-11-11)
- **Contexto:** Caminhos com acento no Windows (`Área de Trabalho`), limite `MAX_PATH` do CMake/Ninja para dependências nativas (`react-native-skia`/`reanimated`), conflito de transporte ADB (`emulator-5562 offline`), pouca RAM padrão no AVD Play Store (`2048 MB`) e animações contínuas (`withRepeat`) travavam build local e árvore de acessibilidade no Maestro.
- **Decisão:** Automatizar a Opção B com `npm run emulator:up` (`scripts/emulator-up.mjs`) e `npm run android:local` (`scripts/android-local.mjs`), compartilhando `scripts/lib/android-sdk.mjs`. No Windows, o build espelha `mobile/` para caminho ASCII curto (`C:\gdg-build\mobile`) com `buildStagingDirectory` em `C:/x` e `-DCMAKE_OBJECT_PATH_MAX=240` sem alterar arquivos Gradle versionados. Em execução E2E (`scripts/run-t8.mjs`), forçamos `ADB_LOCAL_TRANSPORT_MAX_PORT=5555` e desativamos temporariamente escalas de animação do emulador para ativar `useReducedMotion()` em `GlassBackground`/`Skeleton`.
- **Consequências:** Build release local e suíte `T8` rodam em ~1–2 minutos no Windows sem fila do EAS ou dispositivo físico, mantendo Opção A (EAS + Wi-Fi ADB) intacta.

## ADR-008: Automação em produção (Webhook header, `pg_cron` runtime e portas WinNAT)
- **Status:** Aceito (2026-11-12)
- **Contexto:** Na Fase 9, verificou-se que: (a) em Supabase gerenciado, `pg_extension.extnamespace` de `pg_cron`/`pg_net` aponta para `pg_catalog`/`public`, mas as tabelas e funções ficam nos schemas `cron` (`cron.job`, `cron.schedule`) e `net` (`net.http_post`); (b) `supabase db lint` (`plpgsql_check`) falha com erro `42P01` caso `cron.job` seja referenciada de forma estática ou literal no SQL quando `pg_cron` não está ativo no banco local; (c) no Windows, o WinNAT reserva a faixa TCP `54278–54477`, bloqueando as portas padrão do Supabase local (`54321–54324`).
- **Decisão:** Registrar o webhook global na Pluggy com header `x-webhook-token` (sem token na URL), resolver `cron`/`net` via `pg_namespace` em runtime dentro de `EXECUTE format(...)` na migration `20261112000007_cron_runtime_ns.sql`, deslocar as portas locais em `supabase/config.toml` para `55420–55429` com resolução dinâmica de `API_URL` em `scripts/run-t5.mjs` e automatizar setup/smoke de produção em `scripts/setup-automation.mjs` e `scripts/run-t9.mjs`.
- **Consequências:** `T4` (`db lint` + `pgTAP`), `T5` (local) e `T9` (produção com `pg_cron` diário `0 9 * * *` e webhook ativo) passam integralmente sem alterações manuais.

## ADR-009: Design System Clean Dark-Blue & Liquid Glass AGSL Nativo (`react-native-liquid-glassmorphism`)
- **Status:** Aceita
- **Contexto:** Na implementação inicial, `GlassCard` empilhava `BlurView` (`dimezisBlurViewSdk31Plus` sem `blurTarget`, gerando fallback `"none"` e warnings) + `<Canvas>` Skia com `<Rect>` semiopaco, enquanto botões/barra inferior aplicavam `elevation` sobre transparência e o fundo possuía 3 orbes neon animados. O visual ficava poluído e os cards/dock pareciam sólidos no Android.
- **Decisão:**
  - Substituir o fundo colorido por degradê azul escuro profundo estático (`#040916 -> #081530 -> #0C214A -> #050B18`) com halo safira contínuo via `react-native-svg` (`RadialGradient`), sem animações contínuas em loop.
  - Migrar `GlassCard` (cartões principais/elevados/pílulas), `GlassTabBar` (`preset="floatingTabBar"` + `ScrollEdgeBlurView edge="bottom"` + auto-hide no teclado Android), `NeonButton` (`preset="compactControl"`), `MonthSwitcher` e `CategoryPickerModal` (bottom sheet) para `<LiquidGlassView variant="clear">` nativo AGSL (`react-native-liquid-glassmorphism`, já compilada no APK), eliminando `BlurView` e `elevation` cinza.
  - Adotar `surface="lightweight"` translúcido em linhas repetitivas (`TransactionRow`, sublinhas de `settings.tsx`) para 120Hz fluido, remover botões redundantes no rodapé do `Painel`, tornar `StatusPill` do cabeçalho clicável, recolher busca no cabeçalho de `Transações` (`tx-search-toggle-btn`) e exigir confirmação (`Alert.alert`) ao excluir regras R9.
- **Consequências:** Zero rebuild nativo necessário (`Fast Refresh` em JS/TSX); `liquid_glass.sksl` mantida intacta para testes de contrato; cards neutros com cor restrita a valores monetários `+/-`, alertas e fatias do Donut (`innerCircleColor="transparent"`).

## ADR-010: Vidro Chanfrado Espesso em Skia Shader + Pager Deslizante e Dock Expansível Magnética (2026-11-12)
- **Status:** Aceita
- **Contexto:** A camada `ScrollEdgeBlurView` da `react-native-liquid-glassmorphism` disparava `invalidate()` contínuo em `onPreDraw()` e cada card disparava captura síncrona em CPU via `SharedBackdrop.captureIfNeeded()` (~27,8% frames janky / 23ms UI thread no Galaxy S24), além de gerar bordas finas (~1dp) pouco perceptíveis no tema escuro.
- **Decisão:**
  1. Fundo minimalista `GlassBackground` em camadas puras `LinearGradient` + Reanimated (`#114394` descendo até ~55% e dissolvendo em `#000000` puro), unificado sob `(tabs)` via `MotionContext` (`scrollY` + `tabProgress`) sem timers ociosos.
  2. `GlassCard` e `GlassTabBar` passam a usar shader SkSL dedicado em GPU (`mobile/src/shaders/thickGlassShader.ts` + `@shopify/react-native-skia` `<Shader>` cacheado pelo `SkiaPictureView`), removendo `SharedBackdrop` e `ScrollEdgeBlurView` e desenhando chanfro óptico espesso (~10–13dp) com refração cromática R/G/B e duplo anel especular; `NeonButton` migrado para `LinearGradient` chanfrado leve.
  3. `(tabs)/_layout.tsx` usa `<Navigator router={TabRouter}>` com pager horizontal Reanimated + `react-native-gesture-handler` v3 (`usePanGesture`) sincronizado em 1:1 com a cápsula expansível/arrastável/magnética de `GlassTabBar`, mantendo `GestureHandlerRootView` na raiz e `block` em `MonthSwitcher` + `disallowInterruption` nos chips horizontais.
- **Consequências:** Zero dependências nativas novas (100% compatível com o `app-debug.apk` instalado); zero captura de tela em CPU durante scroll/swipe; contratos `liquid_glass.sksl` e rotas Expo Router preservados.

## ADR-011: Liquid Glass Reativo ao Fundo (iOS 26), StandardRouter Multi-Aba, Pull-to-Refresh Elástico e Donut em Skia (2026-11-12)
- **Status:** Aceita
- **Contexto:** Na validação em dispositivo físico (screenshot `media_1794520849850_f1063b74.jpg`), a iteração anterior com `<Navigator router={TabRouter}>` renderizava apenas a aba focada (`"Painel"`) no dock inferior porque o `TabRouter` padrão incluía apenas a rota ativa em `state.routes`; os chanfros espessos escuros (`innerGroove`) criavam molduras pesadas; o pull-to-refresh usava o spinner nativo flutuante do Android; e o `DonutChart` estático + card `Cartão Inter Gold` careciam de hierarquia e fluidez.
- **Decisão:**
  1. Migrar `mobile/app/(tabs)/_layout.tsx` para `createStandardRouterNavigator` com `TabRouter`, `TAB_ORDER = ['index', 'transactions', 'settings']` e pré-carregamento (`PRELOAD`) das abas para garantir a dock completa e o pager horizontal fluido.
  2. Reescrever `THICK_GLASS_SKSL` (`thickGlassShader.ts`) removendo o sulco escuro (`innerGroove`), reduzindo chanfros (`VARIANT_DEFAULTS`) e calculando em GPU via `evalOceanBackdrop` + `sampleBlurredBackdrop` a reação desfocada das bordas à posição na tela (`uScreenOrigin`, `uViewport`, `uTabOffset`, `uScrollRatio`) ligada em 120Hz via Reanimated `useDerivedValue` (`GlassCard.tsx`, `GlassTabBar.tsx`, `MotionContext.tsx` com `pullOffset` e `viewportHeight`).
  3. Criar `LiquidPullRefresh.tsx` com `usePanGesture` + amortecimento exponencial para puxar a tela inteira para baixo com cápsula translúcida e feedback háptico nas 3 abas (`index.tsx`, `transactions.tsx`, `settings.tsx`), substituindo o `RefreshControl` nativo.
  4. Refinar o topo do Painel (`'Painel Gerenciador de Gastos'` + badge `'Online'`), reorganizar `CreditCardPanel` (`Fatura atual`, `Vence`, `Limite disponível` e barra `LinearGradient`) e reescrever `DonutChart.tsx` em `@shopify/react-native-skia` (`Canvas`, `Circle`, `Path`, `Group`, `BlurMask`) + `sweepProgress` + `useTapGesture`.
- **Consequências:** Zero dependências nativas novas; suítes `test:t1`, `test:t2` e `test:t7` (`10/10` suítes, `53/53` testes) e bundle Metro (`HTTP 200`) aprovados; validação iterativa priorizada com `tsc --noEmit` + Metro durante edições e suíte completa executada ao final.

## ADR-012: Correções Runtime RNGH v3 / TabRouter PRELOAD e Culling 120Hz de Superfícies Skia (2026-11-12)
- **Status:** Aceita
- **Contexto:** Ao subir o app via USB em dispositivo Android físico (Galaxy S24, 120Hz), o `logcat` apontou dois erros de runtime: `usePanGesture` do `LiquidPullRefresh` rejeitava arrays `[positivo, positivo]` em `activeOffsetY`/`failOffsetY` no RNGH v3, e o `useEffect` de `PRELOAD` via `useNavigation()` disparava contra o Stack pai gerando `Maximum update depth exceeded`. Adicionalmente, `dumpsys gfxinfo` durante scroll e swipe registrava `31,82%` de jank (`17ms` p50 UI thread) devido ao redesenho simultâneo de todos os `<Canvas>` Skia de `GlassCard` across todas as 3 abas.
- **Decisão:**
  1. Ajustar `LiquidPullRefresh.tsx` para valores escalares direcionais (`activeOffsetY: 10`, `failOffsetY: -8`), compatíveis com `validateOffsetsArray` do RNGH v3.
  2. Migrar o `PRELOAD` em `mobile/app/(tabs)/_layout.tsx` para `createProps: ({ dispatch })` ligado diretamente ao `TabRouter` e protegido por `preloadedNamesRef` (`Set<string>`), além de usar `key={route.name}` nas páginas do strip e `describe({ key: undefined, name })` em `processDescriptors`.
  3. Introduzir `TabSlotProvider` / `useTabSlotIndex` (`MotionContext.tsx`) e substituir `useDerivedValue` de `GlassCard.tsx` por `uniformsSV` + `useAnimatedReaction` com culling por aba ativa, viewport vertical (`screenTop + h < -28 || screenTop > vpH + 28`) e cache estático abaixo da zona azul (`screenTop >= vpH * 0.64`).
- **Consequências:** Zero erros/warnings no `logcat` do aparelho; redução de jank em scroll/swipe de `31,82%` para `8,39%`, `Missed Vsync` de `43` para `0` e UI p50 de `17ms` para `10ms` (GPU Vulkan em `3ms`); `test:t1`, `test:t2` e `test:t7` (`10/10` suítes, `53/53` testes) 100% aprovados após as alterações.


## ADR-013: Aura dinâmica reativa ao scroll, pull-to-refresh mais longo e desseleção global do Donut
- **Status:** Aceita (2026-11-12)
- **Contexto:** Daniel solicitou três refinamentos de uso diário no Galaxy S24 mantendo a paleta azul exata: (1) tornar a aura azul de `GlassBackground` reativa à passagem dos cards durante o scroll (desviando suavemente para os lados e para baixo com retorno elástico via `withSpring`), (2) exigir arraste maior no `LiquidPullRefresh` para evitar atualizações acidentais, e (3) permitir desselecionar a fatia ativa do `DonutChart` tocando em qualquer outro lugar da tela `Painel`.
- **Decisão:**
  1. Em `mobile/src/components/GlassBackground.tsx`, adicionada reação na UI thread (`useAnimatedReaction` sobre `scrollY.get()`, sem array de dependências) combinando onda espacial por passagem de card (`Math.sin(nextY / 115)`) e retorno com `withSpring(0, { damping: 11, stiffness: 48, mass: 1.4 })` para `deflectX`/`deflectY`, além de resposta sutil ao `pullOffset` e ampliação da margem de overscan de `sheenLayer`/`crownLayer` mantendo inalteradas as constantes `OCEAN_TOP_COLORS`, `SHEEN_COLORS` e `CROWN_COLORS`.
  2. Em `mobile/src/components/LiquidPullRefresh.tsx`, elevados `activeOffsetY: 24`, `PULL_THRESHOLD = 96`, `PULL_MAX = 156`, `REFRESH_REST_HEIGHT = 64` e curva exponencial `Math.exp(-dy / 245)` para exigir puxada deliberada (~2x maior).
  3. Em `mobile/src/components/DonutChart.tsx` e `mobile/app/(tabs)/index.tsx`, `handleCanvasTap` passou a limpar `selectedCategoryId` em toques fora das fatias/anel, `chartBox`/`wrapper` limpam em `e.target === e.currentTarget`, e o `SafeAreaView` da tela `Painel` limpa a seleção em toques curtos (`< 10px` e `< 450ms`) fora da área interativa do `DonutChart` e do botão de filtro.
- **Consequências:** Zero impacto no FPS durante scroll (`0,64%` de jank em `466` frames no `dumpsys gfxinfo`, `Missed Vsync: 0`), interações validadas via `adb` e screenshots no S24, e aprovação integral em `test:t1`, `test:t2` e `test:t7` (`10/10` suítes, `53/53` testes).


## ADR-014: Auras azuis vagantes full-screen sincronizadas com GlassCard e GlassTabBar
- **Status:** Aceita (2026-11-12)
- **Contexto:** Na verificação visual no Galaxy S24, Daniel identificou que o degradê/aura azul anterior ficava preso ao topo (~40% superiores) deixando a parte inferior da tela escura e dando impressão de luz fixa no topo em vez de vagar por toda a tela no scroll.
- **Decisão:**
  1. Estender a camada base de `GlassBackground.tsx` para cobrir `100%` da altura (`top: -60, bottom: -60`) com a mesma paleta oceânica (`#114394 → #0B2E6B → #061B44 → #020B20 → #010512`).
  2. Substituir as faixas planas superiores por duas auras radiais suaves em Skia `<Canvas>` estático (`540×540` e `480×480`) transladadas exclusivamente por `transform` GPU (`Animated.View`), seguindo órbitas contínuas por toda a largura e altura da tela (`computeWanderingAuras` em `MotionContext.tsx`: 16%–84% vertical, 14%–86% horizontal, mais deslocamento entre abas e deflexão elástica `withSpring` na passagem dos cards).
  3. Unificar `thickGlassShader.ts` (`uAura1`, `uAura2`), `GlassCard.tsx` (removendo o corte fixo em `vpH * 0.64`, mantendo culling de abas inativas e cards fora da viewport) e `GlassTabBar.tsx`, fazendo as bordas refratarem exatamente a passagem das auras por qualquer card ou dock da tela.
- **Consequências:** Visual coerente de ponta a ponta confirmado nos screenshots topo/meio/base no Galaxy S24, zero erros no `logcat` (`PID 30402`), `2.45%` de jank em `531` frames de scroll completo (`GPU 50th: 2ms`, `99th: 5ms`), e aprovação integral em `test:t1`, `test:t2` e `test:t7` (`10/10` suítes, `53/53` testes).


## ADR-015: Extensão da aura azul vagante e elástica para o scroll horizontal entre abas e arraste da dock
- **Status:** Aceita (2026-11-12)
- **Contexto:** Após validar a aura full-screen vagante no scroll vertical no Galaxy S24, Daniel solicitou aplicar o mesmo comportamento dinâmico e elástico no deslocamento horizontal (ao arrastar o dedo entre as abas da direita para a esquerda / esquerda para a direita e ao arrastar a cápsula da barra inferior).
- **Decisão:**
  1. Adicionar `auraHorizX: SharedValue<number>` ao `MotionContextValue` (`MotionContext.tsx`) e estender `computeWanderingAuras` com `horizX` somado às coordenadas horizontais das duas auras (`c1x` com `horizX`, `c2x` com `horizX * 0.88`), mantendo as trajetórias guiadas por `tabProgress`.
  2. Em `GlassBackground.tsx`, adicionar `useAnimatedReaction` observando `tabProgress.get()` para impulsionar `horizX` na direção do arraste (`dir = dt > 0 ? -1 : 1`, acompanhando o gesto direita→esquerda) e `deflectY` proporcional ao avanço entre abas, retornando suavemente com `withSpring(0, AURA_RETURN_SPRING)` e aplicando nos estilos animados das camadas `primaryAuraStyle` e `secondaryAuraStyle`.
  3. Propagar `auraHorizX` para `GlassCard.tsx` e `GlassTabBar.tsx` (`dockUniforms` e `pillUniforms`), garantindo sincronia entre o fundo e todas as bordas Liquid Glass e a cápsula móvel durante o swipe e durante o `pillPanGesture`.
- **Consequências:** Transição horizontal validada visualmente em meio ao swipe (`h_mid.png`) e no retorno ao `Painel` (`h_final_painel.png`) no Galaxy S24 (`PID 6421`), `logcat` sem erros, `dumpsys gfxinfo` de swipes horizontais completos + arraste da cápsula registrando `50th: 13ms` / `99th: 30ms` / `14.37%` de jank em 828 frames (ponto natural para otimização na próxima fase de performance), e aprovação integral de `test:t1`, `test:t2` e `test:t7` (`10/10` suítes, `53/53` testes em `65.674s`).


## ADR-016: Elástico vertical estilo iOS (rubber-band e fling bounce) no topo e no fundo via LiquidPullRefresh
- **Status:** Aceita (2026-11-12)
- **Contexto:** Daniel apontou que, diferente do swipe horizontal (que já possuía retorno elástico nas extremidades esquerda/direita), o scroll vertical batia "seco" ao chegar no fim da página e ao retornar ao topo por causa de `overScrollMode="never"`.
- **Decisão:**
  1. Em `mobile/src/components/LiquidPullRefresh.tsx`, introduzir `overscrollY: SharedValue<number>` separado de `pullY` (`translateY = pullY + overscrollY`), permitindo elasticidade negativa no fundo (`BOTTOM_BOUNCE_MAX = 88`) e positiva leve no topo (`TOP_BOUNCE_MAX = 56`) quando vindo de baixo sem acionar a pílula nem disparar Pull-to-Refresh acidental.
  2. Expor `bounces: false`, `onLayout`, `onContentSizeChange` e `wrapScroll(handler)` em `LiquidPullRefreshBind` e integrá-los em `index.tsx`, `transactions.tsx` e `settings.tsx` para calcular `maxScrollY` e detectar impacto em velocidade (`fling`) tanto no topo quanto no fundo (além do soltar rápido no `onDeactivate`), aplicando sequência `withTiming` + `withSpring(0, { damping: 12.5, stiffness: 215, mass: 0.9 })` e mantendo relógios consistentes na JS thread via `scheduleOnRN`.
  3. Permitir `pullOffset` negativo em `computeWanderingAuras` (`MotionContext.tsx`, intervalo `[-96, 165]`) e aplicar `overflow: 'hidden'` em `LiquidPullRefresh` para recorte limpo abaixo de cabeçalhos/filtros.
- **Consequências:** Cobertura unitária ampliada (`55/55` testes em `10/10` suítes no `test:t7` em `61.14 s`), zero erros em `test:t1` e `test:t2`; validado ao vivo no Galaxy S24 (`PID 22784`) com capturas de esticamento no fundo e rebote no topo (`elastic_bot_stretch.png`, `elastic_top_bounce.png`, `elastic_tx_bot.png`, `elastic_settled.png`), `logcat` (`task-1612`) sem erros e `dumpsys gfxinfo` em `1626` frames registrando `2.03%` de jank (`50th: 10ms`, `95th: 15ms`, `99th: 22ms`, `0` slow bitmap uploads).

## ADR-017: Unificação `useFrameCallback` sem alocações para 120Hz, ajuste de swipe horizontal/chips e `CategoryPickerModal` arrastável
- **Status:** Aceita (2026-11-12)
- **Contexto:** Após os primeiros testes ao vivo no Galaxy S24 (`120Hz`), três pontos precisaram de ajuste fino mantendo o visual Liquid Glass: (1) o swipe horizontal entre abas travava ao arrastar-e-parar ou piscava em arrastes rápidos, (2) o modal de categoria cobria altura excessiva e precisava acompanhar o dedo ao arrastar para baixo para fechar, e (3) a atualização do background parecia descompassada em relação aos cards durante o scroll (`scrollEventThrottle={1}` disparando worklets em 240Hz de toque e alocações repetidas de `withSpring` em `useAnimatedReaction`).
- **Decisão:**
  1. Em `mobile/src/theme/MotionContext.tsx`, substituir os múltiplos `withSpring` alocados dentro dos `useAnimatedReaction` de `scrollY` e `tabProgress` por um único `useFrameCallback` (`stepScrollDeflect`, `autostart=false`) que integra vertical (`internalAuraDeflectX`/`Y`) e horizontal (`internalAuraHorizX`) na cadência exata do VSync e se desliga ao estabilizar (`0` frames em repouso), usando chaves inteiras de 52 bits via `packGlassUniformKey` quantizado a `1dp` em `GlassCard.tsx` e `GlassTabBar.tsx`.
  2. Em `mobile/src/components/LiquidPullRefresh.tsx`, posicionar `scrollEventThrottle={8}` após `{...rest}` para alinhar eventos de scroll a 120Hz (evitando disparos duplos em 240Hz durante `HandleInputStart`) e ajustar `pullPan` (`activeOffsetY: [-12, 16]`, `failOffsetX: [-7, 7]`) com `nativeGesture` `disallowInterruption: false`.
  3. Em `mobile/app/(tabs)/_layout.tsx` e `transactions.tsx`, calibrar `pagerPan` (`activeOffsetX: [-5, 5]`, `failOffsetY: [-14, 14]`, spring `{ damping: 24, stiffness: 360, mass: 0.78, energyThreshold: 8e-6 }`, sincronização determinística de `tabProgress` no fim da mola/efeito) e isolar os chips horizontais com `<GestureScrollView block={motion?.pagerGesture}>`.
  4. Em `mobile/src/components/CategoryPickerModal.tsx`, fixar `maxSheetHeight = Math.round(vpH * 0.64)` (~36% de backdrop visível) e habilitar drag-to-dismiss em 120Hz no cabeçalho (`dismissPan`) e no corpo da `SectionList` (`listDismissPan` simultâneo ao `GestureScrollView` da lista) com `syncListAtTop` (`onScroll`, `onScrollEndDrag`, `onMomentumScrollEnd`), além de fallback `useFrameCallback` em `mobile/jest.setup.ts`.
- **Consequências:** Zero erros/warnings em nossos arquivos em `test:t1`, `test:t2` (`deno lint & check` em `12` arquivos + `tsc` + `eslint`) e `test:t7` (`10/10` suítes, `55/55` testes em `43.341 s`); validado no Galaxy S24 (`PID 27054`, `120Hz`, debug) com `logcat` limpo de erros nativos/JS, `0` frames em repouso, scroll Painel `50th: 13ms / 90th: 20ms`, swipe lento `50th: 12ms / 90th: 21ms`, swipe rápido `50th: 11ms / 90th: 18ms` (`GPU 50th: 2–3ms`) e `CategoryPickerModal` abrindo/rolando/fechando por arraste (`50th: 8ms / 90th: 18ms`, `ModalOpenAfterDragDismiss=False`).

## ADR-018: Escopo de scroll por aba/container, eliminação de dente-de-serra e sincronia visual 120Hz Background ↔ Cards
- **Status:** Aceita (2026-11-16)
- **Contexto:** Daniel identificou que a movimentação horizontal entre abas ainda podia ganhar fluidez e que o movimento do plano de fundo (`GlassBackground`) ainda não parecia totalmente condizente com os cards durante o arraste horizontal e vertical.
- **Decisão:**
  1. Em `mobile/src/theme/MotionContext.tsx` e `LiquidPullRefresh.tsx`, separar `tabScrollY` e `tabPullOffset` por aba com interpolação suave em `effectiveScrollY`/`effectivePullOffset` e introduzir `ScrollOffsetProvider`/`useScrollOffsetScope`, garantindo que os `GlassCard`s dentro de cada `LiquidPullRefresh` leiam apenas seu próprio scroll enquanto elementos fixos (ex.: `MonthSwitcher` em `Transações`) fiquem isolados em `0`.
  2. Em `MotionContext.tsx`, eliminar o salto em zero e a oscilação em dente-de-serra aplicando atualização imediata em `useAnimatedReaction` (`effectiveScrollY` e `tabProgress`) associada a contadores de quadros (`framesSinceScrollSV`/`framesSinceTabSV`) no `stepScrollDeflect`, ajustar `computeWanderingAuras` para órbita horizontal monotônica acompanhando os cards e manter resposta vertical direcional (`dy > 0` empurra para cima, `dy < 0` para baixo).
  3. Em `mobile/src/components/LiquidPullRefresh.tsx` e `GlassBackground.tsx`, alterar `scrollEventThrottle={5}` (impedindo descarte de quadros `120Hz` de ~`7–8ms` no Android mantendo filtro contra `240Hz`) e remover a pulsação variável de `scale` no fundo (`scale: AURA_TEX_UPSAMPLE` fixo).
  4. Em `mobile/src/components/GlassCard.tsx`, separar `LightweightGlassCard` (zero hooks Reanimated para `surface="lightweight"`), descontar `(tabSlot - tabProgress) * vpW` no `measureInWindow` em `handleLayout` e quantizar `packGlassUniformKey` a `0.5dp` em `GlassCard.tsx` e `GlassTabBar.tsx`.
  5. Em `mobile/app/(tabs)/_layout.tsx` e `GlassTabBar.tsx`, calibrar `PAGER_SNAP_SPRING`/`PILL_PAGE_SPRING` (`{ damping: 26, stiffness: 255, mass: 0.86, energyThreshold: 2e-5 }`) e `pagerPan` (`activeOffsetX: [-6, 6]`, `failOffsetY: [-20, 20]`, limiar de flick `0.14` / `260 px/s`).
- **Consequências:** Zero erros de compilação ou testes (`tsc --noEmit` OK, `test:t1` OK, `test:t2` OK em `12` arquivos Deno + `tsc` + `eslint`, `test:t7` com `10/10` suítes e `55/55` testes em `52.626 s`); pronto para validação ao vivo no Galaxy S24 assim que conectado via USB.

## ADR-019: Correção de flicks horizontais rápidos via `absoluteX` e animação fluida nos cliques da `GlassTabBar`
- **Status:** Aceita (2026-11-16)
- **Contexto:** Nos testes via Wi-Fi ADB em dispositivo Android físico (120Hz), dois comportamentos prejudicavam a navegação: (1) flicks horizontais muito rápidos (`60 ms`) travavam/voltavam para a aba anterior porque `PanGestureHandler.activate()` no Android chama `resetProgress()` (zerando `translationX`), o commit `navigateToIndex` só ocorria ao fim da mola (~`350–450 ms`) e `block: motion?.pagerGesture` em `pullPan` invertia o bloqueio (`blocksHandlers`), fazendo `pullPan` segurar `pagerPan`; (2) cliques na barra inferior com duração >= `120 ms` ativavam `pillPanGesture` (`activateAfterLongPress: 120, minDistance: 0`), teletransportando diretamente entre `Painel` e `Conexão` sem deslizar pelas telas intermediárias.
- **Decisão:**
  1. Em `mobile/app/(tabs)/_layout.tsx`, calcular deslocamento via `event.absoluteX` desde `onBegin` (`touchStartAbsX`/`touchStartAbsY`), acionar `committedTabSV` + `scheduleOnRN(navigateToIndex, target)` imediatamente no `finishPagerGesture`, proteger contra disparo duplo entre `onDeactivate` e `onFinalize` via `panHandledSV`, preservar âncora para gestos encadeados (`dragAnchorTabSV`) e extrair `applyRubberBandTab` e `initDragAnchor`.
  2. Em `mobile/app/(tabs)/_layout.tsx` e `mobile/src/components/GlassTabBar.tsx`, substituir `withTiming(240ms)` por `TAB_PRESS_SPRING` (`{ damping: 28, stiffness: 185, mass: 0.9, energyThreshold: 2e-5 }`) acionado imediatamente em `navigateToTab`, e alterar `pillPanGesture` para `activeOffsetX: [-10, 10]` / `failOffsetY: [-18, 18]` (removendo `activateAfterLongPress: 120` e o salto seco no `onActivate`), preservando ainda a mola de momentum quando o clique vier de um arraste da pílula (`gestureTargetRef.current === targetIdx`).
  3. Em `mobile/src/components/LiquidPullRefresh.tsx`, remover `block: motion?.pagerGesture` de `pullPan`.
- **Consequências:** `tsc --noEmit` OK, `test:t1` OK, `test:t2` OK (`0` erros), `test:t7` OK (`10/10` suítes, `55/55` testes em `42.962 s`); validado ao vivo no Galaxy S24 (`PID 28951`) via Wi-Fi ADB com flick único de `60 ms` (`Painel -> Transações`), flicks encadeados `60 ms` (`Painel -> Transações -> Conexão` e retorno ao `Painel`, `285` frames, `50th: 11 ms`, `90th: 19 ms`, `GPU 50th: 3 ms`) e toques na barra inferior deslizando por todas as telas (`Painel -> Conexão -> Painel`, `285` frames, `50th: 11 ms`, `90th: 19 ms`, `5.96%` jank), sem erros no `logcat`.

## ADR-020: Correção do Pull-to-Refresh via `absoluteY` e calibração de concorrência com `pagerPan`
- **Status:** Aceita (2026-11-16)
- **Contexto:** Após os ajustes do `pagerPan` no Android (`ADR-019`), puxar verticalmente para baixo no topo das abas parou de acionar o Pull-to-Refresh por dois motivos: (1) `PanGestureHandler.activate()` no Android chama `resetProgress()` antes de `onActivate`, zerando `event.translationY = 0` e fazendo a guarda `event.translationY > 8` em `LiquidPullRefresh.tsx` falhar sempre; (2) `pagerPan` usava `failOffsetY: [-28, 28]` com `activeOffsetX: [-5, 5]`, roubando puxões verticais com mínimo desvio lateral antes de atingir `28dp`.
- **Decisão:**
  1. Em `mobile/src/components/LiquidPullRefresh.tsx`, registrar `pullStartAbsY` em `onBegin`, calcular `totalDy = event.absoluteY - pullStartAbsY.get()` em `onActivate` e `onUpdate`, ativar `isActivePull` com `(totalDy > 4 || event.translationY > 4)` (preservando a distinção contra scroll normal para baixo a partir do topo, onde `totalDy <= -12` e `event.translationY === 0`), adicionar engate tardio em `onUpdate` quando `totalDy > 10` sem contato no fundo, usar `dy = Math.max(0, totalDy, event.translationY)` com curva `/ 210` e `PULL_THRESHOLD = 80`, além de `activeOffsetY: [-12, 14]` e `failOffsetX: [-10, 10]`.
  2. Em `mobile/app/(tabs)/_layout.tsx`, calibrar `pagerPan` para `activeOffsetX: [-7, 7]` e `failOffsetY: [-15, 15]` para falhar prontamente em gestos verticais mantendo flicks horizontais rápidos via `absoluteX`.
- **Consequências:** `tsc --noEmit` OK, `test:t1` OK, `test:t2` OK (`0` erros), `test:t7` OK (`10/10` suítes, `55/55` testes em `48.286 s`); validado ao vivo no Galaxy S24 (`PID 20534`, Wi-Fi ADB) com Pull-to-Refresh registrando `syncRun` `pull_to_refresh` (`11` lidas / `11` salvas) e exibindo `Atualizado: 11 lidas · 11 salvas`, scroll normal do topo até categorias sem disparo falso de refresh, flicks horizontais de `60 ms` entre abas preservados e `dumpsys gfxinfo` em `1523` frames com `2.56%` de jank (`50th: 9 ms`, `90th: 12 ms`, `GPU 50th: 3 ms`, `0` slow bitmap uploads), sem erros no `logcat`.

## ADR-021: Modo Privacidade Global (Olho), Simulação 12M em Memória e Central de Análises (`/analytics`) em Skia GPU
- **Status:** Aceita (2026-11-16)
- **Contexto:** Daniel solicitou (1) controles rápidos no topo do Painel ao lado do título e do badge `Online` — um botão de Olho para ocultar valores monetários e um botão para simular 12 meses de dados fictícios realistas para demonstrações, voltando aos dados reais quando ambos estiverem desativados; e (2) um botão expansível fluido abaixo do gráfico de rosca abrindo uma tela separada rica em gráficos comparativos e KPIs sobre ganhos, gastos e dinheiro em conta (inspirada em Copilot Money, Monarch, Revolut e Nubank).
- **Decisão:**
  1. Criar `PrivacyDemoContext` (`mobile/src/context/PrivacyDemoContext.tsx`) envolvendo o root stack (`mobile/app/_layout.tsx`), com fallback seguro fora do provider para compatibilidade retroativa com testes isolados.
  2. Implementar `createDemoApiClient()` (`mobile/src/utils/demoDataGenerator.ts`) gerando 12 meses determinísticos completos em memória (salário, bônus/13º, moradia, mercado, restaurantes, transporte, assinaturas, saúde, estornos, pendentes, exclusões R2/R4/R5 e evolução de saldo), chaveado de forma transparente em `useFinance.ts` e `useAnalyticsData.ts` sem tocar no Supabase real.
  3. Estender `format.ts` (`formatMaskedBRL`, `formatPrivacyBRL`) e `AmountText.tsx` para mascarar valores (`R$ ••••`) mantendo cores e proporções gráficas intactas; adicionar os botões `dashboard-demo-toggle-btn` e `dashboard-privacy-toggle-btn` no topo do Painel e em `/analytics`.
  4. Criar `analyticsHelpers.ts`, `useAnalyticsData.ts`, `AnalyticsCharts.tsx` (gráficos 100% GPU em `@shopify/react-native-skia` + `react-native-reanimated`: `BalanceAreaChart`, `IncomeExpenseComboChart`, `SpendingPaceChart`, `CashFlowWaterfallChart`, `CategoryComparisonChart`, `AccountVsCardSplitChart`, `WeekdayHeatmapChart`, `TopMerchantsList`) e a rota `/analytics` (`mobile/app/analytics.tsx`) acessível pelo card expansível `dashboard-open-analytics-btn` abaixo do `DonutChart`, mantendo apenas as 3 abas principais na `GlassTabBar`.
- **Consequências:** Zero dependências nativas novas; `test:t1`, `test:t2` (`0` erros de TS/ESLint/Deno) e `test:t7` (`11/11` suítes, `60/60` testes em `50.507 s`) 100% aprovados; pronto para verificação visual em dispositivo/emulador ou geração de novo APK release.

## ADR-022: Tipografia Fintech (`Space Grotesk` + `Plus Jakarta Sans`), Header em Duas Camadas e Correções Pós-Device em `GlassCard` / `useAnalyticsData`
- **Status:** Aceita (2026-11-16)
- **Contexto:** Durante os testes ao vivo via Wi-Fi ADB mDNS no Galaxy S24 (`dev_01..dev_12`), identificaram-se três melhorias importantes: (1) com os dois novos botões no topo, o título `Painel Gerenciador de Gastos` em linha única sofria truncamento (`...`) e Daniel solicitou uma tipografia moderna de fintech alinhada ao visual Liquid Glass; (2) na tela `/analytics`, o card `Top 5 Estabelecimentos` tinha sua borda Skia cortada antes do fim quando expandia fora da viewport em um `ScrollView` sem `ScrollOffsetProvider`; (3) durante o carregamento parcial de `useQueries`, meses pendentes de resposta geravam queda temporária na curva de saldo; (4) `parseAdbDevices` em `scripts/lib/android-sdk.mjs` não reconhecia conexões Wi-Fi ADB mDNS (`._adb-tls-connect._tcp`).
- **Decisão:**
  1. Instalar `@expo-google-fonts/space-grotesk` (`display`) e `@expo-google-fonts/plus-jakarta-sans` (`regular`..`bold`), carregando-as em `mobile/app/_layout.tsx` e atualizando `TYPOGRAPHY.family` (`mobile/src/theme/tokens.ts`) e `AmountText.tsx`.
  2. Redesenhar o header de `mobile/app/(tabs)/index.tsx` em duas camadas (`GERENCIADOR DE GASTOS` + `Painel`) com cápsula translúcida para `[Demo, Olho, StatusPill]`, além de aplicar `TYPOGRAPHY.family.display` nos títulos das telas `analytics.tsx`, `transactions.tsx` e `settings.tsx`.
  3. Atualizar `uSize` dentro de `uniformsSV` diretamente no `handleLayout` de `GlassCard.tsx`, migrar `analytics.tsx` para `LiquidPullRefresh` + `LiquidPullScrollView` com `kpiRow` de altura equalizada, aguardar `combinedDash.isLoading === false` em `useAnalyticsData.ts` e usar `fallbackBalance` em `sliceHorizonMonths` (`analyticsHelpers.ts`).
  4. Atualizar `hasRemoteTcp` em `scripts/lib/android-sdk.mjs` para reconhecer `._adb-tls-connect._tcp`.
- **Consequências:** Aprovado integralmente em `test:t1`, `test:t2` (`0` erros) e `test:t7` (`11/11` suítes, `60/60` testes em `49.275 s`); APK release standalone (`54.426.479` bytes, `arm64-v8a`) compilado e instalado no dispositivo com Metro encerrado e sem `adb reverse`.

## ADR-023: Blindagem de privacidade, fallback Demo 12M sem `.env` e abertura pública do repositório
- **Status:** Aceita (2026-11-16)
- **Contexto:** Ao preparar `Cawlino/gerenciador-de-gastos` para abertura pública no GitHub como vitrine técnica para recrutadores, a auditoria identificou: (1) necessidade de impedir que qualquer visitante sem `.env` fique preso na tela de erro de API ao clonar o projeto; (2) metadados operacionais/pessoais residuais no histórico antigo e docs (`project ref`, e-mail pessoal de commits, serial ADB e notas de projetos internos); e (3) lacunas em `scripts/check-pii.mjs` para `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `EXPO_PUBLIC_API_URL`, `PLUGGY_CLIENT_ID` e `mobile/.env`.
- **Decisão:**
  1. Endurecer `scripts/check-pii.mjs` (leitura de `.env` + `mobile/.env`, bloqueio de URLs Supabase reais, e-mails Gmail, IPs LAN `192.168.x.x` e seriais ADB) e reforçar `.gitignore` (`*.apk`, `*.aab`, `*.mp4`, `mobile/.env*`).
  2. Adicionar CTA secundário **"Explorar em Modo Demo (12 meses)"** nos estados de erro de carregamento (`index.tsx`, `transactions.tsx`, `settings.tsx`, `analytics.tsx`), preservando intacto o fluxo padrão quando `.env` está configurado.
  3. Reconstruir o histórico Git com commits sanitizados e e-mail privado `users.noreply.github.com`, reescrever `README.md` com a trajetória completa de engenharia e publicar `docs/ARCHITECTURE.md` e `SECURITY.md`.
- **Consequências:** Zero segredos, dados financeiros reais ou PII em todo o histórico Git (`T1`/`gitleaks` com `0` achados); visitantes testam a UI completa em Modo Demo 12M sem backend, enquanto o ambiente pessoal local permanece 100% preservado.

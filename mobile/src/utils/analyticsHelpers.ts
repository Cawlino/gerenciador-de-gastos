import type { DashboardResponse, TransactionDto } from '../api/types';
import { getDatePartsSP, parseYearMonth, shiftYearMonth } from './format';

export type AnalyticsHorizon = '3M' | '6M' | '12M';

export interface ExecutiveKpis {
  month: string;
  checkingBalance: number;
  savingsRatePct: number;
  savingsRateDeltaPp: number;
  dailyBurnRate: number;
  projectedMonthExpense: number;
  avgMonthlyExpense: number;
  projectionVsAvgPct: number;
  cashRunwayMonths: number;
  periodNetTotal: number;
  periodIncomeTotal: number;
  periodExpenseTotal: number;
  averageExpenseTicket: number;
  expenseTxCount: number;
}

export interface AccountBalancePoint {
  month: string;
  label: string;
  endingBalance: number;
  netFlow: number;
  movingAvg3M: number;
}

export interface IncomeExpensePoint {
  month: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  savingsRatePct: number;
}

export interface DailyPaceComparison {
  month: string;
  previousMonth: string;
  daysInMonth: number;
  elapsedDays: number;
  currentSeries: number[];
  previousSeries: number[];
  currentTotalAtDay: number;
  previousTotalAtDay: number;
  deltaAtCurrentDay: number;
  deltaPct: number;
  status: 'below' | 'on_track' | 'above';
}

export interface WaterfallStep {
  id: string;
  label: string;
  amount: number;
  startValue: number;
  endValue: number;
  kind: 'income' | 'expense' | 'net';
  color: string;
}

export interface CategoryComparisonItem {
  categoryId: string;
  name: string;
  color: string;
  currentAmount: number;
  previousAmount: number;
  average12MAmount: number;
  sharePct: number;
  deltaVsAvgPct: number;
  deltaVsPrevPct: number;
  txCount: number;
}

export interface WeekdayHeatCell {
  dayIndex: number;
  shortLabel: string;
  totalAmount: number;
  txCount: number;
  intensity: number;
}

export interface TopMerchantItem {
  name: string;
  totalAmount: number;
  txCount: number;
  averageTicket: number;
  categoryName: string;
  sharePct: number;
}

export interface HabitsBreakdown {
  channelSplit: {
    checkingAmount: number;
    creditCardAmount: number;
    totalAmount: number;
    checkingPct: number;
    creditCardPct: number;
  };
  weekdayHeatmap: WeekdayHeatCell[];
  topMerchants: TopMerchantItem[];
}

export interface AnalyticsDataset {
  selectedMonth: string;
  horizon: AnalyticsHorizon;
  kpis: ExecutiveKpis;
  balanceSeries: AccountBalancePoint[];
  incomeExpenseSeries: IncomeExpensePoint[];
  spendingPace: DailyPaceComparison;
  waterfall: WaterfallStep[];
  categoryComparisons: CategoryComparisonItem[];
  habits: HabitsBreakdown;
}

const SHORT_MONTHS_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

const WEEKDAY_SHORT_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function horizonToMonthCount(horizon: AnalyticsHorizon): number {
  if (horizon === '3M') return 3;
  if (horizon === '6M') return 6;
  return 12;
}

export function formatTinyMonthLabel(monthKey: string): string {
  const { month, year } = parseYearMonth(monthKey);
  const short = SHORT_MONTHS_PT[month - 1];
  return `${short}/${String(year).slice(-2)}`;
}

export function getDaysInYearMonth(monthKey: string): number {
  const { year, month } = parseYearMonth(monthKey);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getElapsedDaysForMonth(monthKey: string, now = new Date()): number {
  const daysInMonth = getDaysInYearMonth(monthKey);
  const parts = getDatePartsSP(now);
  const currentMonthKey = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}`;
  if (monthKey === currentMonthKey) {
    return Math.min(Math.max(1, parts.day), daysInMonth);
  }
  return daysInMonth;
}

function sliceHorizonMonths(
  dashboards12M: DashboardResponse[],
  selectedMonth: string,
  horizon: AnalyticsHorizon,
): DashboardResponse[] {
  const count = horizonToMonthCount(horizon);
  const byMonth = new Map(dashboards12M.map((d) => [d.month, d]));
  const fallbackBalance =
    dashboards12M[dashboards12M.length - 1]?.checking_balance ??
    dashboards12M[0]?.checking_balance ??
    0;
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    months.push(shiftYearMonth(selectedMonth, -i));
  }
  return months.map((m) => {
    const found = byMonth.get(m);
    if (found) return found;
    return {
      month: m,
      checking_balance: fallbackBalance,
      credit_card: null,
      credit_cards: [],
      last_synced_at: null,
      item_status: null,
      consent_expires_at: null,
      income_total: 0,
      expense_total: 0,
      net_total: 0,
      pending_count: 0,
      pending_expense_total: 0,
      excluded_count: 0,
      categories: [],
      available_months: [m],
      settings: {},
    };
  });
}

function sortDashboardsChronological(
  dashboards12M: DashboardResponse[],
  selectedMonth: string,
): DashboardResponse[] {
  return sliceHorizonMonths(dashboards12M, selectedMonth, '12M');
}

function isExpenseTx(tx: TransactionDto): boolean {
  return !tx.effective_excluded && (tx.amount_norm < 0 || tx.kind === 'refund');
}

function txExpenseValue(tx: TransactionDto): number {
  return -tx.amount_norm;
}

/**
 * Calcula os Super KPIs Executivos para o mês de referência e horizonte selecionado.
 */
export function computeExecutiveKpis(
  dashboards12M: DashboardResponse[],
  transactions: TransactionDto[],
  selectedMonth: string,
  horizon: AnalyticsHorizon,
  now = new Date(),
): ExecutiveKpis {
  const chronological12 = sortDashboardsChronological(dashboards12M, selectedMonth);
  const horizonSlice = sliceHorizonMonths(dashboards12M, selectedMonth, horizon);
  const currentDash = chronological12[chronological12.length - 1];
  const prevDash = chronological12[chronological12.length - 2];

  const income = currentDash?.income_total ?? 0;
  const expense = currentDash?.expense_total ?? 0;
  const savingsRatePct = income > 0 ? round1(((income - expense) / income) * 100) : 0;

  const prevIncome = prevDash?.income_total ?? 0;
  const prevExpense = prevDash?.expense_total ?? 0;
  const prevSavingsRatePct =
    prevIncome > 0 ? round1(((prevIncome - prevExpense) / prevIncome) * 100) : 0;
  const savingsRateDeltaPp = round1(savingsRatePct - prevSavingsRatePct);

  const daysInMonth = getDaysInYearMonth(selectedMonth);
  const elapsedDays = getElapsedDaysForMonth(selectedMonth, now);
  const dailyBurnRate = elapsedDays > 0 ? round2(expense / elapsedDays) : 0;
  const projectedMonthExpense = round2(dailyBurnRate * daysInMonth);

  const activeHorizonMonths = horizonSlice.filter((d) => d.expense_total > 0 || d.income_total > 0);
  const avgDivisor = Math.max(activeHorizonMonths.length, 1);
  const periodIncomeTotal = round2(horizonSlice.reduce((acc, d) => acc + d.income_total, 0));
  const periodExpenseTotal = round2(horizonSlice.reduce((acc, d) => acc + d.expense_total, 0));
  const periodNetTotal = round2(horizonSlice.reduce((acc, d) => acc + d.net_total, 0));
  const avgMonthlyExpense = round2(periodExpenseTotal / avgDivisor);

  const projectionVsAvgPct =
    avgMonthlyExpense > 0
      ? round1(((projectedMonthExpense - avgMonthlyExpense) / avgMonthlyExpense) * 100)
      : 0;

  const checkingBalance = currentDash?.checking_balance ?? 0;
  const cashRunwayMonths =
    avgMonthlyExpense > 0 ? round1(Math.max(0, checkingBalance) / avgMonthlyExpense) : 0;

  const monthExpenseTxs = transactions.filter(
    (t) => t.month_sp === selectedMonth && isExpenseTx(t) && t.amount_norm < 0,
  );
  const expenseTxCount = monthExpenseTxs.length;
  const grossTxExpense = monthExpenseTxs.reduce((acc, t) => acc + Math.abs(t.amount_norm), 0);
  const averageExpenseTicket = expenseTxCount > 0 ? round2(grossTxExpense / expenseTxCount) : 0;

  return {
    month: selectedMonth,
    checkingBalance: round2(checkingBalance),
    savingsRatePct,
    savingsRateDeltaPp,
    dailyBurnRate,
    projectedMonthExpense,
    avgMonthlyExpense,
    projectionVsAvgPct,
    cashRunwayMonths,
    periodNetTotal,
    periodIncomeTotal,
    periodExpenseTotal,
    averageExpenseTicket,
    expenseTxCount,
  };
}

/**
 * Constrói a série histórica do Dinheiro em Conta com média móvel de 3 meses.
 */
export function buildAccountBalanceSeries(
  dashboards12M: DashboardResponse[],
  selectedMonth: string,
  horizon: AnalyticsHorizon,
): AccountBalancePoint[] {
  const chronological12 = sortDashboardsChronological(dashboards12M, selectedMonth);
  const hasDistinctBalances = chronological12.some(
    (d, i) => i > 0 && Math.abs(d.checking_balance - chronological12[0].checking_balance) > 0.01,
  );

  const balances12: number[] = new Array(chronological12.length).fill(0);
  if (hasDistinctBalances) {
    for (let i = 0; i < chronological12.length; i += 1) {
      balances12[i] = round2(chronological12[i].checking_balance);
    }
  } else {
    let cursor = chronological12[chronological12.length - 1]?.checking_balance ?? 0;
    for (let i = chronological12.length - 1; i >= 0; i -= 1) {
      balances12[i] = round2(Math.max(0, cursor));
      cursor -= chronological12[i].net_total;
    }
  }

  const count = horizonToMonthCount(horizon);
  const startIdx = Math.max(0, chronological12.length - count);
  const points: AccountBalancePoint[] = [];

  for (let i = startIdx; i < chronological12.length; i += 1) {
    const windowStart = Math.max(0, i - 2);
    let windowSum = 0;
    let windowLen = 0;
    for (let j = windowStart; j <= i; j += 1) {
      windowSum += balances12[j];
      windowLen += 1;
    }
    const dash = chronological12[i];
    points.push({
      month: dash.month,
      label: formatTinyMonthLabel(dash.month),
      endingBalance: balances12[i],
      netFlow: round2(dash.net_total),
      movingAvg3M: round2(windowSum / Math.max(windowLen, 1)),
    });
  }

  return points;
}

/**
 * Constrói série combinada mensal de Ganhos, Gastos, Sobra Líquida e Taxa de Poupança.
 */
export function buildIncomeExpenseComboSeries(
  dashboards12M: DashboardResponse[],
  selectedMonth: string,
  horizon: AnalyticsHorizon,
): IncomeExpensePoint[] {
  const slice = sliceHorizonMonths(dashboards12M, selectedMonth, horizon);
  return slice.map((d) => {
    const savingsRatePct =
      d.income_total > 0 ? round1(((d.income_total - d.expense_total) / d.income_total) * 100) : 0;
    return {
      month: d.month,
      label: formatTinyMonthLabel(d.month),
      income: round2(d.income_total),
      expense: round2(d.expense_total),
      net: round2(d.net_total),
      savingsRatePct,
    };
  });
}

/**
 * Constrói a curva acumulada de ritmo diário de gastos (Dia 1..31) comparando mês atual vs. mês anterior.
 */
export function buildDailySpendingPace(
  transactions: TransactionDto[],
  selectedMonth: string,
  now = new Date(),
): DailyPaceComparison {
  const previousMonth = shiftYearMonth(selectedMonth, -1);
  const daysInMonth = getDaysInYearMonth(selectedMonth);
  const prevDaysInMonth = getDaysInYearMonth(previousMonth);
  const elapsedDays = getElapsedDaysForMonth(selectedMonth, now);

  const curDaily = new Array<number>(daysInMonth).fill(0);
  const prevDaily = new Array<number>(Math.max(daysInMonth, prevDaysInMonth)).fill(0);

  for (const tx of transactions) {
    if (!isExpenseTx(tx)) continue;
    const dayStr = tx.occurred_date_sp?.slice(8, 10);
    const dayNum = Number(dayStr);
    if (!Number.isInteger(dayNum) || dayNum < 1) continue;
    const value = txExpenseValue(tx);
    if (tx.month_sp === selectedMonth && dayNum <= daysInMonth) {
      curDaily[dayNum - 1] += value;
    } else if (tx.month_sp === previousMonth && dayNum <= prevDaily.length) {
      prevDaily[dayNum - 1] += value;
    }
  }

  const currentSeries: number[] = [];
  const previousSeries: number[] = [];
  let curAcc = 0;
  let prevAcc = 0;

  for (let d = 0; d < daysInMonth; d += 1) {
    curAcc = round2(curAcc + curDaily[d]);
    prevAcc = round2(prevAcc + (prevDaily[d] ?? 0));
    if (d < elapsedDays) {
      currentSeries.push(Math.max(0, curAcc));
    }
    previousSeries.push(Math.max(0, prevAcc));
  }

  const currentTotalAtDay = currentSeries[currentSeries.length - 1] ?? 0;
  const previousTotalAtDay = previousSeries[Math.min(elapsedDays - 1, previousSeries.length - 1)] ?? 0;
  const deltaAtCurrentDay = round2(currentTotalAtDay - previousTotalAtDay);
  const deltaPct =
    previousTotalAtDay > 0 ? round1((deltaAtCurrentDay / previousTotalAtDay) * 100) : 0;

  let status: 'below' | 'on_track' | 'above' = 'on_track';
  if (deltaPct <= -5) status = 'below';
  else if (deltaPct >= 5) status = 'above';

  return {
    month: selectedMonth,
    previousMonth,
    daysInMonth,
    elapsedDays,
    currentSeries,
    previousSeries,
    currentTotalAtDay,
    previousTotalAtDay,
    deltaAtCurrentDay,
    deltaPct,
    status,
  };
}

/**
 * Monta os degraus da ponte de fluxo de caixa (Waterfall) do mês selecionado.
 */
export function buildCashFlowWaterfall(dashboard: DashboardResponse | undefined): WaterfallStep[] {
  if (!dashboard) return [];

  const income = round2(Math.max(0, dashboard.income_total));
  const sortedCats = [...dashboard.categories]
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const steps: WaterfallStep[] = [
    {
      id: 'wf-income',
      label: 'Ganhos',
      amount: income,
      startValue: 0,
      endValue: income,
      kind: 'income',
      color: '#34D399',
    },
  ];

  let cursor = income;
  const topFour = sortedCats.slice(0, 4);
  for (const cat of topFour) {
    const nextCursor = round2(cursor - cat.total);
    steps.push({
      id: `wf-cat-${cat.category_id}`,
      label: cat.name_pt,
      amount: -round2(cat.total),
      startValue: cursor,
      endValue: nextCursor,
      kind: 'expense',
      color: cat.color || '#FB7185',
    });
    cursor = nextCursor;
  }

  const remainingTotal = round2(
    sortedCats.slice(4).reduce((acc, c) => acc + c.total, 0),
  );
  if (remainingTotal > 0.01) {
    const nextCursor = round2(cursor - remainingTotal);
    steps.push({
      id: 'wf-others',
      label: 'Demais categorias',
      amount: -remainingTotal,
      startValue: cursor,
      endValue: nextCursor,
      kind: 'expense',
      color: '#94A3B8',
    });
    cursor = nextCursor;
  }

  const net = round2(dashboard.net_total);
  steps.push({
    id: 'wf-net',
    label: net >= 0 ? 'Sobra em conta' : 'Déficit',
    amount: net,
    startValue: 0,
    endValue: net,
    kind: 'net',
    color: net >= 0 ? '#38BDF8' : '#FB7185',
  });

  return steps;
}

/**
 * Compara o gasto de cada categoria do mês selecionado contra o mês anterior e a média histórica de 12M.
 */
export function buildCategoryComparisons(
  dashboards12M: DashboardResponse[],
  selectedMonth: string,
): CategoryComparisonItem[] {
  const chronological12 = sortDashboardsChronological(dashboards12M, selectedMonth);
  const currentDash = chronological12[chronological12.length - 1];
  const prevDash = chronological12[chronological12.length - 2];

  const statsMap = new Map<
    string,
    {
      name: string;
      color: string;
      sum12M: number;
      activeMonths: number;
      currentAmount: number;
      previousAmount: number;
      txCount: number;
      sharePct: number;
    }
  >();

  for (const dash of chronological12) {
    for (const cat of dash.categories) {
      const entry = statsMap.get(cat.category_id) ?? {
        name: cat.name_pt,
        color: cat.color || '#38BDF8',
        sum12M: 0,
        activeMonths: 0,
        currentAmount: 0,
        previousAmount: 0,
        txCount: 0,
        sharePct: 0,
      };
      entry.sum12M += cat.total;
      entry.activeMonths += 1;
      if (dash.month === selectedMonth) {
        entry.currentAmount = cat.total;
        entry.txCount = cat.tx_count;
        entry.sharePct = cat.percentage;
      } else if (prevDash && dash.month === prevDash.month) {
        entry.previousAmount = cat.total;
      }
      statsMap.set(cat.category_id, entry);
    }
  }

  const totalMonthsWithData = Math.max(
    chronological12.filter((d) => d.categories.length > 0).length,
    1,
  );

  const items: CategoryComparisonItem[] = [];
  for (const [categoryId, entry] of statsMap.entries()) {
    if (entry.currentAmount <= 0 && entry.sum12M <= 0) continue;
    const avg12M = round2(entry.sum12M / totalMonthsWithData);
    const deltaVsAvgPct =
      avg12M > 0 ? round1(((entry.currentAmount - avg12M) / avg12M) * 100) : 0;
    const deltaVsPrevPct =
      entry.previousAmount > 0
        ? round1(((entry.currentAmount - entry.previousAmount) / entry.previousAmount) * 100)
        : 0;

    items.push({
      categoryId,
      name: entry.name,
      color: entry.color,
      currentAmount: round2(entry.currentAmount),
      previousAmount: round2(entry.previousAmount),
      average12MAmount: avg12M,
      sharePct: currentDash ? entry.sharePct : 0,
      deltaVsAvgPct,
      deltaVsPrevPct,
      txCount: entry.txCount,
    });
  }

  return items.sort(
    (a, b) => b.currentAmount - a.currentAmount || b.average12MAmount - a.average12MAmount,
  );
}

/**
 * Calcula divisão Conta Corrente vs. Cartão de Crédito, mapa de calor por dia da semana e Top 5 estabelecimentos.
 */
export function buildHabitsBreakdown(
  transactions: TransactionDto[],
  selectedMonth: string,
  horizon: AnalyticsHorizon,
): HabitsBreakdown {
  const count = horizonToMonthCount(horizon);
  const allowedMonths = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    allowedMonths.add(shiftYearMonth(selectedMonth, -i));
  }

  const periodExpenses = transactions.filter(
    (t) => allowedMonths.has(t.month_sp) && isExpenseTx(t) && t.amount_norm < 0,
  );

  let checkingAmount = 0;
  let creditCardAmount = 0;

  const weekdayTotals = new Array<number>(7).fill(0);
  const weekdayCounts = new Array<number>(7).fill(0);

  const merchantMap = new Map<
    string,
    { name: string; totalAmount: number; txCount: number; categoryName: string }
  >();

  for (const tx of periodExpenses) {
    const val = Math.abs(tx.amount_norm);
    if (tx.account_type === 'BANK') {
      checkingAmount += val;
    } else {
      creditCardAmount += val;
    }

    const parsedDate = new Date(`${tx.occurred_date_sp}T12:00:00-03:00`);
    if (!Number.isNaN(parsedDate.getTime())) {
      const { weekdayIndex } = getDatePartsSP(parsedDate);
      weekdayTotals[weekdayIndex] += val;
      weekdayCounts[weekdayIndex] += 1;
    }

    const merchantLabel =
      tx.merchant_name?.trim() ||
      tx.counterparty_name?.trim() ||
      tx.description.trim();
    if (merchantLabel) {
      const key = merchantLabel.toUpperCase();
      const prev = merchantMap.get(key) ?? {
        name: merchantLabel,
        totalAmount: 0,
        txCount: 0,
        categoryName: tx.category_group_name_pt || tx.category_name_pt,
      };
      prev.totalAmount = round2(prev.totalAmount + val);
      prev.txCount += 1;
      merchantMap.set(key, prev);
    }
  }

  const totalChannel = round2(checkingAmount + creditCardAmount);
  const checkingPct = totalChannel > 0 ? round1((checkingAmount / totalChannel) * 100) : 0;
  const creditCardPct = totalChannel > 0 ? round1(100 - checkingPct) : 0;

  const maxWeekday = Math.max(...weekdayTotals, 0);
  const weekdayHeatmap: WeekdayHeatCell[] = WEEKDAY_SHORT_PT.map((shortLabel, dayIndex) => ({
    dayIndex,
    shortLabel,
    totalAmount: round2(weekdayTotals[dayIndex]),
    txCount: weekdayCounts[dayIndex],
    intensity: maxWeekday > 0 ? Math.min(1, weekdayTotals[dayIndex] / maxWeekday) : 0,
  }));

  const topMerchants: TopMerchantItem[] = Array.from(merchantMap.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 5)
    .map((m) => ({
      name: m.name,
      totalAmount: m.totalAmount,
      txCount: m.txCount,
      averageTicket: round2(m.totalAmount / Math.max(m.txCount, 1)),
      categoryName: m.categoryName,
      sharePct: totalChannel > 0 ? round1((m.totalAmount / totalChannel) * 100) : 0,
    }));

  return {
    channelSplit: {
      checkingAmount: round2(checkingAmount),
      creditCardAmount: round2(creditCardAmount),
      totalAmount: totalChannel,
      checkingPct,
      creditCardPct,
    },
    weekdayHeatmap,
    topMerchants,
  };
}

/**
 * Monta o pacote completo da Central de Análises & KPIs a partir de 12 meses de dashboards e transações.
 */
export function buildAnalyticsDataset(params: {
  dashboards12M: DashboardResponse[];
  transactions: TransactionDto[];
  selectedMonth: string;
  horizon: AnalyticsHorizon;
  now?: Date;
}): AnalyticsDataset {
  const { dashboards12M, transactions, selectedMonth, horizon, now = new Date() } = params;
  const currentDash = dashboards12M.find((d) => d.month === selectedMonth);

  return {
    selectedMonth,
    horizon,
    kpis: computeExecutiveKpis(dashboards12M, transactions, selectedMonth, horizon, now),
    balanceSeries: buildAccountBalanceSeries(dashboards12M, selectedMonth, horizon),
    incomeExpenseSeries: buildIncomeExpenseComboSeries(dashboards12M, selectedMonth, horizon),
    spendingPace: buildDailySpendingPace(transactions, selectedMonth, now),
    waterfall: buildCashFlowWaterfall(currentDash),
    categoryComparisons: buildCategoryComparisons(dashboards12M, selectedMonth),
    habits: buildHabitsBreakdown(transactions, selectedMonth, horizon),
  };
}

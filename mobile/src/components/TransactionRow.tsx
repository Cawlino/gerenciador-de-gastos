import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Car,
  CreditCard,
  HeartPulse,
  Home,
  Receipt,
  ShoppingBag,
  Tag,
  Utensils,
  Wallet,
  Zap,
} from 'lucide-react-native';
import { COLORS, GLASS_METRICS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { formatTimeSP } from '../utils/format';
import { AmountText } from './AmountText';
import { GlassCard } from './GlassCard';
import { StatusPill } from './StatusPill';

export interface TransactionRowItem {
  id: string;
  description: string;
  categoryName?: string | null;
  categoryColor?: string | null;
  accountLabel?: string | null;
  amountNorm: number;
  date: string;
  status?: 'POSTED' | 'PENDING';
  effectiveExcluded?: boolean;
  excludedReason?: string | null;
}

export interface TransactionRowProps {
  item: TransactionRowItem;
  onPress?: (item: TransactionRowItem) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function renderCategoryIcon(categoryName: string | null | undefined, color: string) {
  const key = (categoryName ?? '').toLowerCase();
  const size = 18;
  if (key.includes('aliment') || key.includes('restaur') || key.includes('mercad')) {
    return <Utensils size={size} color={color} />;
  }
  if (key.includes('transport') || key.includes('uber') || key.includes('combust')) {
    return <Car size={size} color={color} />;
  }
  if (key.includes('moradia') || key.includes('casa') || key.includes('aluguel')) {
    return <Home size={size} color={color} />;
  }
  if (key.includes('saúd') || key.includes('saud') || key.includes('farm')) {
    return <HeartPulse size={size} color={color} />;
  }
  if (key.includes('compra') || key.includes('lazer') || key.includes('vest')) {
    return <ShoppingBag size={size} color={color} />;
  }
  if (key.includes('energia') || key.includes('conta') || key.includes('assinat')) {
    return <Zap size={size} color={color} />;
  }
  if (key.includes('fatura') || key.includes('cart')) {
    return <CreditCard size={size} color={color} />;
  }
  if (key.includes('salár') || key.includes('salar') || key.includes('renda') || key.includes('receit')) {
    return <Wallet size={size} color={color} />;
  }
  if (key.length > 0) {
    return <Tag size={size} color={color} />;
  }
  return <Receipt size={size} color={color} />;
}

/**
 * Linha minimalista (vidro leve translúcido) com ícone neutro, hora SP e valores tabulares.
 */
function TransactionRowImpl({
  item,
  onPress,
  style,
  testID,
}: TransactionRowProps) {
  const excluded = Boolean(item.effectiveExcluded);
  const isPending = item.status === 'PENDING';
  const categoryLabel = item.categoryName?.trim() || 'Sem categoria';
  const timeLabel = formatTimeSP(item.date);
  const subtitleText = item.accountLabel?.trim()
    ? `${categoryLabel} · ${item.accountLabel.trim()} · ${timeLabel}`
    : `${categoryLabel} · ${timeLabel}`;
  const iconColor = excluded ? COLORS.text.secondary : '#D7E2F3';

  const handlePress = React.useCallback(() => {
    if (!onPress) return;
    void Haptics.selectionAsync().catch(() => undefined);
    onPress(item);
  }, [item, onPress]);

  const rowContent = (
    <GlassCard
      variant="row"
      surface="lightweight"
      padding={SPACING.md + 2}
      contentStyle={styles.row}
    >
      <View style={styles.avatar}>
        {renderCategoryIcon(item.categoryName, iconColor)}
      </View>

      <View style={styles.main}>
        <Text style={[styles.title, excluded ? styles.titleExcluded : null]} numberOfLines={1}>
          {item.description}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitleText}
          </Text>
          {isPending ? (
            <StatusPill label="pendente" variant="warning" showDot={false} />
          ) : null}
          {excluded ? (
            <StatusPill
              label={item.excludedReason ?? 'ignorado'}
              variant="muted"
              showDot={false}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.amountCol}>
        <AmountText
          value={item.amountNorm}
          signed
          muted={excluded}
          size={TYPOGRAPHY.size.body}
          weight="semibold"
        />
      </View>
    </GlassCard>
  );

  if (!onPress) {
    return (
      <View style={style} testID={testID}>
        {rowContent}
      </View>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${item.description}, ${categoryLabel}`}
      style={({ pressed }) => [style, pressed ? styles.pressed : null]}
      testID={testID}
    >
      {rowContent}
    </Pressable>
  );
}

export const TransactionRow = React.memo(TransactionRowImpl);

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.86,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: GLASS_METRICS.radius.row - 4,
    borderWidth: 1,
    borderColor: COLORS.glass.hairlineSubtle,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.body,
    lineHeight: TYPOGRAPHY.lineHeight.body,
  },
  titleExcluded: {
    color: COLORS.text.secondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs + 2,
  },
  subtitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.caption,
    lineHeight: TYPOGRAPHY.lineHeight.caption,
    flexShrink: 1,
  },
  amountCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: SPACING.xs,
  },
});

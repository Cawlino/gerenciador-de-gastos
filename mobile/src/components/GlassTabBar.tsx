import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChartPie, Link2, ReceiptText } from 'lucide-react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { GlassCard } from './GlassCard';

export interface GlassTabRoute {
  key: string;
  name: string;
}

export interface GlassTabDescriptor {
  options: {
    title?: string;
    tabBarLabel?: unknown;
    tabBarAccessibilityLabel?: string;
    tabBarButtonTestID?: string;
    tabBarIcon?: (props: { focused: boolean; color: string; size: number }) => ReactNode;
  };
}

export interface GlassTabBarProps {
  state: {
    index: number;
    routes: GlassTabRoute[];
  };
  descriptors: Record<string, GlassTabDescriptor>;
  emitter?: {
    emit: (options: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
  };
  navigateToTab?: (routeKey: string) => void;
  navigation?: {
    emit?: (event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate?: (name: string) => void;
  };
  insets: {
    bottom: number;
  };
}

const DEFAULT_META: Record<
  string,
  { label: string; renderIcon: (color: string, size: number) => ReactNode }
> = {
  index: {
    label: 'Painel',
    renderIcon: (color, size) => <ChartPie size={size} color={color} strokeWidth={2} />,
  },
  transactions: {
    label: 'Transações',
    renderIcon: (color, size) => <ReceiptText size={size} color={color} strokeWidth={2} />,
  },
  settings: {
    label: 'Conexão',
    renderIcon: (color, size) => <Link2 size={size} color={color} strokeWidth={2} />,
  },
};

/**
 * Barra de navegação inferior flutuante em cápsula Liquid Glass com brilho ativo ciano.
 */
export function GlassTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  navigation,
  insets,
}: GlassTabBarProps) {
  const bottomOffset = Math.max(insets.bottom, 12) + 8;

  return (
    <View
      style={[styles.wrapper, { bottom: bottomOffset }]}
      pointerEvents="box-none"
      testID="glass-tab-bar"
    >
      <GlassCard
        variant="pill"
        intensity={48}
        padding={SPACING.xs + 2}
        style={styles.capsule}
        contentStyle={styles.row}
      >
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const options = descriptor?.options ?? {};
          const isFocused = state.index === index;

          const fallback = DEFAULT_META[route.name];
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? fallback?.label ?? route.name);

          const color = isFocused ? COLORS.neon.cyan : COLORS.text.secondary;

          const icon = options.tabBarIcon
            ? options.tabBarIcon({ focused: isFocused, color, size: 20 })
            : fallback
              ? fallback.renderIcon(color, 20)
              : <ChartPie size={20} color={color} />;

          const handlePress = () => {
            const event = emitter
              ? emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              : navigation?.emit
                ? navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                : { defaultPrevented: false };

            if (!isFocused && !event.defaultPrevented) {
              void Haptics.selectionAsync().catch(() => undefined);
              if (navigateToTab) {
                navigateToTab(route.key);
              } else {
                navigation?.navigate?.(route.name);
              }
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={handlePress}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              testID={options.tabBarButtonTestID ?? `tab-${route.name}`}
              style={[styles.item, isFocused ? styles.itemActive : null]}
            >
              <View style={styles.iconContainer}>{icon}</View>
              <Text
                style={[
                  styles.label,
                  {
                    color,
                    fontFamily: isFocused
                      ? TYPOGRAPHY.family.semibold
                      : TYPOGRAPHY.family.medium,
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
              {isFocused ? <View style={styles.activeDot} /> : <View style={styles.dotPlaceholder} />}
            </Pressable>
          );
        })}
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    zIndex: 50,
  },
  capsule: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.xs,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  itemActive: {
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.28)',
  },
  iconContainer: {
    marginBottom: 2,
  },
  label: {
    fontSize: TYPOGRAPHY.size.micro,
    lineHeight: TYPOGRAPHY.lineHeight.micro,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: COLORS.neon.cyan,
    marginTop: 2,
  },
  dotPlaceholder: {
    width: 4,
    height: 4,
    marginTop: 2,
  },
});

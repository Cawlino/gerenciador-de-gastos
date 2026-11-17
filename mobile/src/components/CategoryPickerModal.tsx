import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Search, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type LayoutChangeEvent,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  type ScrollViewProps,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  ScrollView as GestureScrollView,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import type { CategoryDto } from '../api/types';
import { COLORS, GLASS_METRICS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import {
  groupCategoriesByRoot,
  type CategoryGroupSection,
} from '../utils/transactionHelpers';

export interface CategoryPickerModalProps {
  visible: boolean;
  categories: CategoryDto[];
  selectedCategoryId?: string | null;
  title?: string;
  allowClear?: boolean;
  onSelect: (categoryId: string | null) => void;
  onClose: () => void;
  testID?: string;
}

const SHEET_SNAPBACK_SPRING = {
  damping: 22,
  stiffness: 300,
  mass: 0.85,
} as const;

function snapSheetOpenWorklet(
  reducedMotion: boolean,
  sheetTranslateY: SharedValue<number>,
) {
  'worklet';
  if (reducedMotion) {
    sheetTranslateY.set(0);
  } else {
    sheetTranslateY.set(withSpring(0, SHEET_SNAPBACK_SPRING));
  }
}

function releaseSheetGestureWorklet(
  translationY: number,
  velocityY: number,
  reducedMotion: boolean,
  isClosingSV: SharedValue<number>,
  sheetTranslateY: SharedValue<number>,
  sheetHeightSV: SharedValue<number>,
  onDone: () => void,
) {
  'worklet';
  if (isClosingSV.get() === 1) return;
  const shouldDismiss = translationY > 95 || velocityY > 600;
  if (shouldDismiss) {
    isClosingSV.set(1);
    if (reducedMotion) {
      scheduleOnRN(onDone);
      return;
    }
    sheetTranslateY.set(
      withSpring(
        sheetHeightSV.get() + 48,
        {
          damping: 24,
          stiffness: 340,
          mass: 0.8,
          energyThreshold: 1e-3,
          velocity: Math.max(velocityY, 420),
        },
        (finished) => {
          'worklet';
          if (finished) {
            scheduleOnRN(onDone);
          }
        },
      ),
    );
    return;
  }
  snapSheetOpenWorklet(reducedMotion, sheetTranslateY);
}

/**
 * Bottom sheet Liquid Glass de categorias PT-BR agrupadas por raiz com busca instantânea
 * e fechamento interativo arrastando para baixo em 120Hz.
 */
function CategoryPickerModalImpl({
  visible,
  categories,
  selectedCategoryId = null,
  title = 'Selecionar categoria',
  allowClear = false,
  onSelect,
  onClose,
  testID = 'category-picker-modal',
}: CategoryPickerModalProps) {
  const { height: rawVpH } = useWindowDimensions();
  const vpH = rawVpH > 0 ? rawVpH : 840;
  const maxSheetHeight = Math.round(vpH * 0.64);
  const reducedMotion = useReducedMotion();

  const [searchQuery, setSearchQuery] = useState('');
  const sheetHeightSV = useSharedValue(maxSheetHeight);
  const sheetTranslateY = useSharedValue(maxSheetHeight);
  const isClosingSV = useSharedValue(0);
  const listAtTopSV = useSharedValue(1);
  const canListDragSV = useSharedValue(0);

  const defaultSections = useMemo(() => groupCategoriesByRoot(categories, ''), [categories]);
  const sections = useMemo(() => {
    if (!visible) return [];
    return searchQuery.trim() ? groupCategoriesByRoot(categories, searchQuery) : defaultSections;
  }, [categories, defaultSections, searchQuery, visible]);

  const finishClose = useCallback(() => {
    isClosingSV.set(0);
    setSearchQuery('');
    onClose();
  }, [isClosingSV, onClose]);

  const animateAndClose = useCallback(() => {
    if (isClosingSV.get() === 1) return;
    isClosingSV.set(1);
    cancelAnimation(sheetTranslateY);
    if (reducedMotion) {
      finishClose();
      return;
    }
    sheetTranslateY.set(
      withTiming(
        sheetHeightSV.get() + 48,
        { duration: 190, easing: Easing.out(Easing.cubic) },
        (finished) => {
          'worklet';
          if (finished) {
            scheduleOnRN(finishClose);
          }
        },
      ),
    );
  }, [finishClose, isClosingSV, reducedMotion, sheetHeightSV, sheetTranslateY]);

  useEffect(() => {
    if (!visible) return;
    isClosingSV.set(0);
    sheetHeightSV.set(maxSheetHeight);
    if (reducedMotion) {
      sheetTranslateY.set(0);
    } else {
      sheetTranslateY.set(maxSheetHeight);
      sheetTranslateY.set(
        withSpring(0, { damping: 24, stiffness: 300, mass: 0.85 }),
      );
    }
  }, [isClosingSV, maxSheetHeight, reducedMotion, sheetHeightSV, sheetTranslateY, visible]);

  const dismissPan = usePanGesture({
    activeOffsetY: 8,
    failOffsetX: [-24, 24],
    enabled: visible,
    onBegin: () => {
      'worklet';
      cancelAnimation(sheetTranslateY);
    },
    onUpdate: (event) => {
      'worklet';
      if (isClosingSV.get() === 1) return;
      sheetTranslateY.set(
        event.translationY >= 0 ? event.translationY : event.translationY * 0.14,
      );
    },
    onDeactivate: (event) => {
      'worklet';
      releaseSheetGestureWorklet(
        event.translationY,
        event.velocityY,
        reducedMotion,
        isClosingSV,
        sheetTranslateY,
        sheetHeightSV,
        finishClose,
      );
    },
    onFinalize: () => {
      'worklet';
      if (isClosingSV.get() === 1) return;
      snapSheetOpenWorklet(reducedMotion, sheetTranslateY);
    },
  });

  const listDismissPan = usePanGesture({
    activeOffsetY: 10,
    failOffsetX: [-24, 24],
    enabled: visible,
    onBegin: () => {
      'worklet';
      const atTop = listAtTopSV.get() === 1 ? 1 : 0;
      canListDragSV.set(atTop);
      if (atTop === 1) {
        cancelAnimation(sheetTranslateY);
      }
    },
    onUpdate: (event) => {
      'worklet';
      if (isClosingSV.get() === 1 || canListDragSV.get() !== 1) return;
      sheetTranslateY.set(event.translationY >= 0 ? event.translationY : 0);
    },
    onDeactivate: (event) => {
      'worklet';
      if (isClosingSV.get() === 1 || canListDragSV.get() !== 1) return;
      canListDragSV.set(0);
      releaseSheetGestureWorklet(
        event.translationY,
        event.velocityY,
        reducedMotion,
        isClosingSV,
        sheetTranslateY,
        sheetHeightSV,
        finishClose,
      );
    },
    onFinalize: () => {
      'worklet';
      if (isClosingSV.get() === 1 || canListDragSV.get() !== 1) return;
      canListDragSV.set(0);
      snapSheetOpenWorklet(reducedMotion, sheetTranslateY);
    },
  });

  const renderListScrollComponent = useCallback(
    (scrollProps: ScrollViewProps) => (
      <GestureScrollView
        {...scrollProps}
        simultaneousWith={listDismissPan}
        disallowInterruption={false}
        overScrollMode="never"
        bounces={false}
      />
    ),
    [listDismissPan],
  );

  const syncListAtTop = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const atTop = event.nativeEvent.contentOffset.y <= 2 ? 1 : 0;
      if (listAtTopSV.get() !== atTop) {
        listAtTopSV.set(atTop);
      }
    },
    [listAtTopSV],
  );

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      sheetTranslateY.get(),
      [0, Math.max(sheetHeightSV.get(), 1)],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.get() }],
  }));

  const handleSheetLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const h = Math.round(event.nativeEvent.layout.height);
      if (h > 0) {
        sheetHeightSV.set(h);
      }
    },
    [sheetHeightSV],
  );

  const handleChoose = useCallback(
    (categoryId: string | null) => {
      void Haptics.selectionAsync().catch(() => undefined);
      onSelect(categoryId);
      animateAndClose();
    },
    [animateAndClose, onSelect],
  );

  const keyExtractor = useCallback((item: CategoryDto) => item.id, []);

  const renderSectionHeader = useCallback(
    ({ section }: { section: CategoryGroupSection }) => (
      <View style={styles.groupHeader}>
        <View style={[styles.groupDot, { backgroundColor: section.groupColor }]} />
        <Text style={styles.groupTitle}>{section.groupName}</Text>
      </View>
    ),
    [],
  );

  const renderItem = useCallback(
    ({ item, section }: { item: CategoryDto; section: CategoryGroupSection }) => {
      const isSelected = selectedCategoryId === item.id;
      const isRoot = item.depth === 0 || item.id === section.groupId;

      return (
        <Pressable
          onPress={() => handleChoose(item.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          testID={`category-option-${item.id}`}
          style={({ pressed }) => [
            styles.optionRow,
            !isRoot ? styles.optionChild : null,
            isSelected ? styles.selectedOption : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={styles.optionTextWrap}>
            <Text
              style={[styles.optionText, isRoot ? styles.optionRootText : null]}
              numberOfLines={1}
            >
              {item.description_pt}
            </Text>
            {isRoot ? <Text style={styles.rootBadge}>Grupo</Text> : null}
          </View>
          {isSelected ? <Check size={16} color={COLORS.accent.ice} /> : null}
        </Pressable>
      );
    },
    [handleChoose, selectedCategoryId],
  );

  const emptyList = useMemo(
    () => (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>Nenhuma categoria encontrada.</Text>
      </View>
    ),
    [],
  );

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={animateAndClose}
    >
      <GestureHandlerRootView style={styles.modalRoot}>
        <View style={styles.overlay} testID={testID}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropAnimatedStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={animateAndClose}
              accessibilityRole="button"
              accessibilityLabel="Fechar seletor de categorias"
            />
          </Animated.View>

          <SafeAreaView style={styles.sheetAnchor} edges={['bottom']} pointerEvents="box-none">
            <Animated.View
              onLayout={handleSheetLayout}
              style={[styles.sheetContainer, { maxHeight: maxSheetHeight }, sheetAnimatedStyle]}
            >
              <View style={[styles.sheetSurface, { maxHeight: maxSheetHeight }]}>
                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    'rgba(125, 211, 252, 0.14)',
                    'rgba(30, 88, 175, 0.05)',
                    'rgba(0, 0, 0, 0)',
                  ]}
                  locations={[0, 0.35, 1]}
                  style={styles.sheetTopSheen}
                />
                <View pointerEvents="none" style={styles.sheetTopRim} />

                <GestureDetector gesture={dismissPan}>
                  <View style={styles.dragHeaderGroup}>
                    <View style={styles.dragZone}>
                      <View style={styles.handleWrap}>
                        <View style={styles.handleBar} />
                      </View>

                      <View style={styles.header}>
                        <Text style={styles.title}>{title}</Text>
                        <Pressable
                          onPress={animateAndClose}
                          accessibilityRole="button"
                          accessibilityLabel="Fechar seletor de categorias"
                          testID="category-picker-close"
                          hitSlop={8}
                          style={styles.closeBtn}
                        >
                          <X size={18} color={COLORS.text.primary} />
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.searchBox}>
                      <Search size={16} color={COLORS.text.secondary} />
                      <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Buscar categoria ou grupo..."
                        placeholderTextColor={COLORS.text.secondary}
                        autoCorrect={false}
                        style={styles.searchInput}
                        testID="category-picker-search"
                      />
                      {searchQuery ? (
                        <Pressable
                          onPress={() => setSearchQuery('')}
                          accessibilityRole="button"
                          accessibilityLabel="Limpar busca de categoria"
                          hitSlop={8}
                        >
                          <X size={16} color={COLORS.text.secondary} />
                        </Pressable>
                      ) : null}
                    </View>

                    {allowClear ? (
                      <Pressable
                        onPress={() => handleChoose(null)}
                        accessibilityRole="button"
                        testID="category-option-clear"
                        style={[
                          styles.clearRow,
                          selectedCategoryId === null ? styles.selectedOption : null,
                        ]}
                      >
                        <Text style={styles.clearText}>Todas as categorias</Text>
                        {selectedCategoryId === null ? (
                          <Check size={16} color={COLORS.accent.ice} />
                        ) : null}
                      </Pressable>
                    ) : null}
                  </View>
                </GestureDetector>

                <GestureDetector gesture={listDismissPan}>
                  <View style={styles.list}>
                    <SectionList<CategoryDto, CategoryGroupSection>
                      sections={sections}
                      keyExtractor={keyExtractor}
                      stickySectionHeadersEnabled={false}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      initialNumToRender={14}
                      maxToRenderPerBatch={12}
                      windowSize={5}
                      removeClippedSubviews={Platform.OS === 'android'}
                      scrollEventThrottle={8}
                      onScroll={syncListAtTop}
                      onScrollEndDrag={syncListAtTop}
                      onMomentumScrollEnd={syncListAtTop}
                      renderScrollComponent={renderListScrollComponent}
                      style={styles.list}
                      contentContainerStyle={styles.listContent}
                      ListEmptyComponent={emptyList}
                      renderSectionHeader={renderSectionHeader}
                      renderItem={renderItem}
                    />
                  </View>
                </GestureDetector>
              </View>
            </Animated.View>
          </SafeAreaView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export const CategoryPickerModal = React.memo(CategoryPickerModalImpl);

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(2, 7, 18, 0.48)',
  },
  sheetAnchor: {
    width: '100%',
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  sheetContainer: {
    width: '100%',
  },
  sheetSurface: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: 'rgba(8, 20, 46, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(135, 206, 250, 0.24)',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  sheetTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  sheetTopRim: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(186, 230, 253, 0.34)',
  },
  dragHeaderGroup: {
    gap: SPACING.md,
  },
  dragZone: {
    gap: SPACING.sm,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 2,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  title: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.bold,
    fontSize: TYPOGRAPHY.size.section,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: COLORS.glass.hairline,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 46,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: GLASS_METRICS.radius.pill,
    borderWidth: 1,
    borderColor: COLORS.glass.hairline,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
    paddingVertical: 0,
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderRadius: GLASS_METRICS.radius.row,
    borderWidth: 1,
    borderColor: COLORS.glass.hairlineSubtle,
    backgroundColor: COLORS.glass.fillSubtle,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  clearText: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.body,
  },
  list: {
    flexShrink: 1,
  },
  listContent: {
    paddingBottom: SPACING.md,
    gap: SPACING.xs,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  groupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  groupTitle: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    gap: SPACING.sm,
    borderRadius: GLASS_METRICS.radius.row - 4,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: COLORS.glass.fillSubtle,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  optionChild: {
    marginLeft: SPACING.md,
  },
  selectedOption: {
    borderColor: COLORS.accent.iceBorder,
    backgroundColor: COLORS.accent.iceTint,
  },
  pressed: {
    opacity: 0.8,
  },
  optionTextWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  optionText: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
    flexShrink: 1,
  },
  optionRootText: {
    fontFamily: TYPOGRAPHY.family.semibold,
  },
  rootBadge: {
    color: COLORS.accent.ice,
    fontFamily: TYPOGRAPHY.family.medium,
    fontSize: TYPOGRAPHY.size.micro,
  },
  emptyBox: {
    paddingVertical: SPACING.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.text.secondary,
    fontFamily: TYPOGRAPHY.family.regular,
    fontSize: TYPOGRAPHY.size.body,
  },
});

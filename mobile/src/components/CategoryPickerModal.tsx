import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Search, X } from 'lucide-react-native';
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

/**
 * Seletor modal de categorias PT-BR agrupadas por grupo-pai raiz com busca instantânea.
 */
export function CategoryPickerModal({
  visible,
  categories,
  selectedCategoryId = null,
  title = 'Selecionar categoria',
  allowClear = false,
  onSelect,
  onClose,
  testID = 'category-picker-modal',
}: CategoryPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const sections = useMemo(
    () => groupCategoriesByRoot(categories, searchQuery),
    [categories, searchQuery],
  );

  const handleChoose = (categoryId: string | null) => {
    setSearchQuery('');
    onSelect(categoryId);
    onClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop} testID={testID}>
        <SafeAreaView style={styles.safeWrap} edges={['top', 'bottom']}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel="Fechar seletor de categorias"
                testID="category-picker-close"
                hitSlop={8}
                style={styles.closeBtn}
              >
                <X size={18} color={COLORS.text.primary} />
              </Pressable>
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
                  <Check size={16} color={COLORS.neon.cyan} />
                ) : null}
              </Pressable>
            ) : null}

            <SectionList<CategoryDto, CategoryGroupSection>
              sections={sections}
              keyExtractor={(item) => item.id}
              stickySectionHeadersEnabled={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Nenhuma categoria encontrada.</Text>
                </View>
              }
              renderSectionHeader={({ section }) => (
                <View style={styles.groupHeader}>
                  <View style={[styles.groupDot, { backgroundColor: section.groupColor }]} />
                  <Text style={styles.groupTitle}>{section.groupName}</Text>
                </View>
              )}
              renderItem={({ item, section }) => {
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
                    {isSelected ? <Check size={16} color={COLORS.neon.cyan} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 13, 0.84)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
  },
  safeWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  sheet: {
    flex: 1,
    maxHeight: '90%',
    backgroundColor: COLORS.bg.mid,
    borderRadius: GLASS_METRICS.radius.card,
    borderWidth: 1,
    borderColor: COLORS.glass.strokeStart,
    padding: SPACING.lg,
    gap: SPACING.md,
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
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.glass.fill,
    borderWidth: 1,
    borderColor: COLORS.glass.strokeEnd,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bg.high,
    borderRadius: GLASS_METRICS.radius.pill,
    borderWidth: 1,
    borderColor: COLORS.glass.strokeStart,
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
    borderRadius: GLASS_METRICS.radius.row,
    borderWidth: 1,
    borderColor: COLORS.glass.strokeEnd,
    backgroundColor: COLORS.glass.fillSubtle,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  clearText: {
    color: COLORS.text.primary,
    fontFamily: TYPOGRAPHY.family.semibold,
    fontSize: TYPOGRAPHY.size.body,
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
    borderColor: 'rgba(34, 211, 238, 0.55)',
    backgroundColor: COLORS.glass.tintCyan,
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
    color: COLORS.neon.cyan,
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

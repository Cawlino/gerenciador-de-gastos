import React, { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../theme/tokens';

export interface GlassBackgroundProps {
  children?: ReactNode;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Fundo atmosférico Deep Space Night com 3 orbes neon suaves para o efeito Liquid Glass.
 */
export function GlassBackground({
  children,
  animated = true,
  style,
  testID,
}: GlassBackgroundProps) {
  const cyanDrift = useSharedValue(0);
  const purpleDrift = useSharedValue(0);
  const mintDrift = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!animated || reducedMotion) {
      cancelAnimation(cyanDrift);
      cancelAnimation(purpleDrift);
      cancelAnimation(mintDrift);
      cyanDrift.value = 0;
      purpleDrift.value = 0;
      mintDrift.value = 0;
      return;
    }

    cyanDrift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 6800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 6800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    purpleDrift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 8400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 8400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    mintDrift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 9600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 9600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [animated, cyanDrift, mintDrift, purpleDrift, reducedMotion]);

  const cyanStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cyanDrift.value * 14 - 7 },
      { translateY: cyanDrift.value * -18 + 9 },
      { scale: 1 + cyanDrift.value * 0.05 },
    ],
  }));

  const purpleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: purpleDrift.value * -16 + 8 },
      { translateY: purpleDrift.value * 20 - 10 },
      { scale: 1 + purpleDrift.value * 0.06 },
    ],
  }));

  const mintStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: mintDrift.value * 12 - 6 },
      { translateY: mintDrift.value * -14 + 7 },
    ],
  }));

  return (
    <View style={[styles.root, style]} testID={testID}>
      <LinearGradient
        colors={[COLORS.bg.deep, COLORS.bg.mid, COLORS.bg.high]}
        locations={[0, 0.52, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[styles.orbContainer, styles.orbCyanPos, cyanStyle]}>
          <View style={[styles.orbOuter, { backgroundColor: 'rgba(34, 211, 238, 0.07)' }]} />
          <View style={[styles.orbInner, { backgroundColor: COLORS.orb.cyan }]} />
        </Animated.View>

        <Animated.View style={[styles.orbContainer, styles.orbPurplePos, purpleStyle]}>
          <View style={[styles.orbOuter, { backgroundColor: 'rgba(168, 85, 247, 0.07)' }]} />
          <View style={[styles.orbInner, { backgroundColor: COLORS.orb.purple }]} />
        </Animated.View>

        <Animated.View style={[styles.orbContainer, styles.orbMintPos, mintStyle]}>
          <View style={[styles.orbOuter, { backgroundColor: 'rgba(52, 211, 153, 0.06)' }]} />
          <View style={[styles.orbInner, { backgroundColor: COLORS.orb.mint }]} />
        </Animated.View>
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg.deep,
  },
  orbContainer: {
    position: 'absolute',
    width: 300,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbCyanPos: {
    top: -60,
    right: -85,
  },
  orbPurplePos: {
    top: '36%',
    left: -115,
  },
  orbMintPos: {
    bottom: -70,
    right: -75,
  },
  orbOuter: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 999,
  },
  orbInner: {
    width: 170,
    height: 170,
    borderRadius: 999,
  },
});

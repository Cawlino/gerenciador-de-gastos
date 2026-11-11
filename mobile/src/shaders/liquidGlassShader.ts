import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { parseRgbaColor } from '../theme/contrast';

/**
 * Fonte SkSL sincronizada com `liquid_glass.sksl` para bundling portátil no Metro/Jest.
 */
export const LIQUID_GLASS_SKSL = `uniform shader backdrop;
uniform float2 uSize;
uniform float uRadius;
uniform float uRefraction;
uniform float uChromatic;
uniform float4 uTint;

float sdRoundedRect(float2 p, float2 halfSize, float r) {
  float2 q = abs(p) - (halfSize - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float2 safeNormal(float2 p, float2 halfSize, float r) {
  float eps = 1.0;
  float dx = sdRoundedRect(p + float2(eps, 0.0), halfSize, r) -
             sdRoundedRect(p - float2(eps, 0.0), halfSize, r);
  float dy = sdRoundedRect(p + float2(0.0, eps), halfSize, r) -
             sdRoundedRect(p - float2(0.0, eps), halfSize, r);
  float2 g = float2(dx, dy);
  float len = length(g);
  return len > 0.0001 ? g / len : float2(0.0, 0.0);
}

half4 main(float2 coord) {
  float2 center = uSize * 0.5;
  float safeRadius = clamp(uRadius, 0.0, min(center.x, center.y));
  float2 halfSize = max(center, float2(1.0));
  float2 p = coord - center;
  float d = sdRoundedRect(p, halfSize, safeRadius);

  if (d > 0.0) {
    return half4(0.0);
  }

  float rimBand = 24.0;
  float edgeT = smoothstep(-rimBand, 0.0, d);
  float2 normal = safeNormal(p, halfSize, safeRadius);
  float2 refractOffset = normal * (-edgeT * uRefraction * min(uSize.x, uSize.y));
  float2 chromaDelta = normal * (edgeT * uChromatic * min(uSize.x, uSize.y));

  float2 samplePos = clamp(coord + refractOffset, float2(0.0), uSize);
  float2 posR = clamp(samplePos + chromaDelta, float2(0.0), uSize);
  float2 posB = clamp(samplePos - chromaDelta, float2(0.0), uSize);

  half4 baseSample = backdrop.eval(samplePos);
  half rChan = backdrop.eval(posR).r;
  half bChan = backdrop.eval(posB).b;

  half3 refracted = half3(rChan, baseSample.g, bChan);
  half3 tinted = mix(refracted, half3(uTint.rgb), half(uTint.a));

  float specular = smoothstep(-3.0, -0.5, d) * (0.16 + 0.12 * clamp(-normal.y - normal.x, 0.0, 1.0));
  half3 finalRgb = clamp(tinted + half3(specular), 0.0, 1.0);

  return half4(finalRgb, 1.0);
}
`;

let cachedEffect: SkRuntimeEffect | null | undefined;

/**
 * Compila o SkRuntimeEffect uma única vez e retorna null caso Skia indisponível.
 */
export function getLiquidGlassEffect(): SkRuntimeEffect | null {
  if (cachedEffect !== undefined) {
    return cachedEffect;
  }
  try {
    cachedEffect = Skia?.RuntimeEffect?.Make(LIQUID_GLASS_SKSL) ?? null;
  } catch {
    cachedEffect = null;
  }
  return cachedEffect;
}

/**
 * Converte cor CSS rgba(...) ou #hex para tupla normalizada [0..1] usada nos uniforms do shader.
 */
export function colorToShaderVec4(color: string): [number, number, number, number] {
  const { r, g, b, a } = parseRgbaColor(color);
  return [r / 255, g / 255, b / 255, a];
}

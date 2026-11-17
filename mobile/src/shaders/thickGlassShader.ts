import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

/**
 * Shader SkSL estilo iOS 26 Liquid Glass minimalista com refração óptica dinâmica.
 * As bordas calculam em tempo real a posição do componente sobre o degradê azul->preto
 * (inclusive durante scroll vertical, pull-to-refresh e swipe entre abas) e aplicam
 * difusão gaussiana simulada do fundo apenas onde a luz azul toca o vidro.
 */
export const THICK_GLASS_SKSL = `
uniform float2 uSize;
uniform float uRadius;
uniform float uBevel;
uniform float2 uScreenOrigin;
uniform float2 uViewport;
uniform float2 uAura1;
uniform float2 uAura2;
uniform float4 uTint;
uniform float uHighlight;
uniform float uChromatic;

float3 evalAuraContribution(float2 screenCoord, float2 center, float radius, float3 innerRgb, float3 outerRgb, float strength) {
  float2 delta = (screenCoord - center) / max(radius, 1.0);
  float2 weighted = float2(delta.x * 0.92, delta.y * 1.04);
  float dSq = dot(weighted, weighted);
  if (dSq >= 1.0) {
    return float3(0.0);
  }
  float d = sqrt(dSq);
  float core = exp(-dSq * 3.8);
  float halo = exp(-dSq * 1.7);
  float fade = smoothstep(1.0, 0.58, d);
  float weight = clamp((core * 0.44 + halo * 0.30) * fade * strength, 0.0, 0.85);
  float3 tint = mix(outerRgb, innerRgb, clamp(core * 0.62, 0.0, 1.0));
  return tint * weight;
}

float3 evalOceanBackdrop(float2 screenCoord, float2 viewport, float2 aura1, float2 aura2) {
  float vh = max(viewport.y, 1.0);

  // Base oceânica contínua cobrindo toda a altura da tela (mesma paleta de GlassBackground)
  float ty = clamp((screenCoord.y + 60.0) / (vh + 120.0), 0.0, 1.0);

  float3 c0 = float3(0.067, 0.263, 0.580); // #114394
  float3 c1 = float3(0.043, 0.180, 0.420); // #0B2E6B
  float3 c2 = float3(0.024, 0.106, 0.267); // #061B44
  float3 c3 = float3(0.008, 0.043, 0.125); // #020B20
  float3 c4 = float3(0.004, 0.020, 0.071); // #010512

  float3 col = c0;
  col = mix(col, c1, smoothstep(0.0, 0.25, ty));
  col = mix(col, c2, smoothstep(0.25, 0.52, ty));
  col = mix(col, c3, smoothstep(0.52, 0.78, ty));
  col = mix(col, c4, smoothstep(0.78, 1.0, ty));

  // Luz das duas auras vagantes que cruzam a tela no scroll/swipe
  float3 sky = float3(0.220, 0.698, 1.000);    // #38B2FF
  float3 ocean = float3(0.067, 0.263, 0.580);  // #114394
  float3 cobalt = float3(0.043, 0.180, 0.420); // #0B2E6B
  float3 azure = float3(0.118, 0.424, 0.878);  // #1E6CE0

  col += evalAuraContribution(screenCoord, aura1, 270.0, sky, ocean, 1.05);
  col += evalAuraContribution(screenCoord, aura2, 240.0, azure, cobalt, 0.82);

  return col;
}

float3 sampleBlurredBackdrop(float2 screenCoord, float2 viewport, float2 aura1, float2 aura2, float blurRadius) {
  float3 sum = evalOceanBackdrop(screenCoord, viewport, aura1, aura2) * 0.36;
  sum += evalOceanBackdrop(screenCoord + float2(-blurRadius, -blurRadius), viewport, aura1, aura2) * 0.16;
  sum += evalOceanBackdrop(screenCoord + float2(blurRadius, -blurRadius), viewport, aura1, aura2) * 0.16;
  sum += evalOceanBackdrop(screenCoord + float2(-blurRadius, blurRadius), viewport, aura1, aura2) * 0.16;
  sum += evalOceanBackdrop(screenCoord + float2(blurRadius, blurRadius), viewport, aura1, aura2) * 0.16;
  return sum;
}

half4 main(float2 fragCoord) {
  float2 halfSize = max(uSize * 0.5, float2(2.0));
  float maxR = max(min(halfSize.x, halfSize.y) - 1.0, 1.0);
  float r = clamp(uRadius, 1.0, maxR);
  float2 p = fragCoord - halfSize;
  float2 b = halfSize - float2(0.5);

  float2 q = abs(p) - b + float2(r);
  float d = length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - r;

  float shapeMask = 1.0 - smoothstep(-0.85, 0.65, d);
  if (shapeMask <= 0.001) {
    return half4(0.0);
  }

  float bevel = clamp(uBevel, 2.5, min(halfSize.x, halfSize.y) * 0.34);
  float dist = max(-d, 0.0);
  float2 screenCoord = uScreenOrigin + fragCoord;

  // Fast path para o miolo plano do card: 0 grad, 0 blurR/blurB e 0 cálculos de catchlight
  if (dist >= bevel * 2.4) {
    float3 blurCenter = sampleBlurredBackdrop(screenCoord, uViewport, uAura1, uAura2, 24.0);
    float3 interiorRgb = clamp(uTint.rgb + blurCenter * 0.112, 0.0, 1.0);
    float finalAlpha = clamp(uTint.a, 0.0, 0.90) * shapeMask;
    return half4(half3(interiorRgb * finalAlpha), half(finalAlpha));
  }

  float2 signs = float2(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0);
  float2 grad;
  if (q.x > 0.0 || q.y > 0.0) {
    grad = normalize(max(q, float2(0.0)) + float2(0.0001)) * signs;
  } else {
    grad = q.x > q.y ? float2(signs.x, 0.0) : float2(0.0, signs.y);
  }

  // Perfis suaves estilo iOS 26 (sem canaleta escura espessa)
  float rimFactor = pow(1.0 - smoothstep(0.0, bevel, dist), 1.8);
  float hairLip = 1.0 - smoothstep(0.0, 1.15, dist);
  float innerGlowBand = 1.0 - smoothstep(0.0, bevel * 2.4, dist);

  float bendStrength = bevel * 2.4 * rimFactor + 6.0 * innerGlowBand;
  float3 blurCenter = sampleBlurredBackdrop(
    screenCoord - grad * bendStrength,
    uViewport,
    uAura1,
    uAura2,
    24.0 + 18.0 * rimFactor
  );

  // Banda interna entre bevel e 2.4*bevel: sem aberração cromática nem catchlight
  if (rimFactor <= 0.0001 && hairLip <= 0.0001) {
    float3 interiorRgb = clamp(
      uTint.rgb + blurCenter * (0.28 * (0.4 + 0.6 * innerGlowBand)),
      0.0,
      1.0
    );
    float finalAlpha = clamp(uTint.a, 0.0, 0.90) * shapeMask;
    return half4(half3(interiorRgb * finalAlpha), half(finalAlpha));
  }

  float chromaDelta = (1.6 * uChromatic + 0.8) * rimFactor;
  float3 blurR = evalOceanBackdrop(screenCoord - grad * (bendStrength - chromaDelta), uViewport, uAura1, uAura2);
  float3 blurB = evalOceanBackdrop(screenCoord - grad * (bendStrength + chromaDelta), uViewport, uAura1, uAura2);
  float3 refractedBackdrop = mix(blurCenter, float3(blurR.r, blurCenter.g, blurB.b), 0.35 * rimFactor);

  // Energia local do fundo azul nesta borda (zero no fundo preto, vibrante no azul)
  float backdropLuma = clamp(dot(blurCenter, float3(0.28, 0.65, 1.25)) * 1.45, 0.0, 1.0);

  // Iluminação anisotrópica limpa de cristal (catchlight sup-esq + brilho oposto discreto)
  float topLeftCatch = pow(max(dot(grad, normalize(float2(-0.56, -0.83))), 0.0), 1.75);
  float bottomRightCatch = pow(max(dot(grad, normalize(float2(0.56, 0.83))), 0.0), 2.5);
  float sideRefract = pow(1.0 - abs(grad.y), 2.6) * 0.24;

  // Mistura do interior: vidro escuro translúcido sobre o preto, leve frescor azulado no topo
  float3 interiorRgb = uTint.rgb + refractedBackdrop * (0.28 * (0.4 + 0.6 * innerGlowBand));

  // Refração nas bordas: onde o azul encosta na borda ela acende com o azul desfocado; onde é preto vira cristal neutro discreto
  float3 oceanRefractGlow = (refractedBackdrop * 1.65 + float3(0.24, 0.58, 0.96) * backdropLuma * 0.24)
    * (0.45 + 0.55 * topLeftCatch + 0.30 * bottomRightCatch + sideRefract);

  // Filete cristalino externo de 1.1dp (sempre elegante: branco-gelo sutil no preto, gelo-azul luminoso no azul)
  float3 crystalWhite = float3(0.86, 0.92, 1.0);
  float3 crystalBlue = mix(crystalWhite, float3(0.58, 0.86, 1.0), backdropLuma * 0.72);
  float lipIntensity = hairLip * (0.11 + 0.30 * topLeftCatch + 0.14 * bottomRightCatch + 0.18 * backdropLuma) * uHighlight;

  float3 rimGlow = oceanRefractGlow * rimFactor * (0.55 + 0.45 * backdropLuma) * uHighlight;
  float3 combinedRgb = clamp(interiorRgb + rimGlow + crystalBlue * lipIntensity, 0.0, 1.0);

  // Opacidade minimalista: borda sutil no preto (~0.18), mais nítida e luminosa na refração azul
  float borderAlpha = rimFactor * (0.10 + 0.34 * backdropLuma) + lipIntensity * 0.82;
  float finalAlpha = clamp(max(uTint.a, borderAlpha), 0.0, 0.90) * shapeMask;

  return half4(half3(combinedRgb * finalAlpha), half(finalAlpha));
}
`;

let cachedEffect: SkRuntimeEffect | null = null;
let compilationTried = false;

export function getThickGlassEffect(): SkRuntimeEffect | null {
  if (!compilationTried) {
    compilationTried = true;
    try {
      cachedEffect = Skia.RuntimeEffect.Make(THICK_GLASS_SKSL) ?? null;
    } catch {
      cachedEffect = null;
    }
  }
  return cachedEffect;
}

/**
 * Converte cor rgba()/hex em vetor normalizado [r, g, b, a] para uniforms SkSL.
 */
export function parseRgbaToVec4(
  color: string | undefined,
  fallback: [number, number, number, number] = [0.035, 0.065, 0.14, 0.42],
): [number, number, number, number] {
  if (!color) return fallback;
  const rgbaMatch = color.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (rgbaMatch) {
    return [
      Number(rgbaMatch[1]) / 255,
      Number(rgbaMatch[2]) / 255,
      Number(rgbaMatch[3]) / 255,
      rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1,
    ];
  }
  const hex = color.replace('#', '').trim();
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
      1,
    ];
  }
  return fallback;
}

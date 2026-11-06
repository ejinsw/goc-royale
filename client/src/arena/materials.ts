import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  NormalBlending,
  RedFormat,
  SRGBColorSpace,
  ShaderMaterial,
} from "three";
import { COLOR } from "../ui/core/tokens";

/**
 * Arena presentation layer (performance standard §3): the shared look of the
 * 3D arena. One toon ramp for map art, props and fighters; an ink outline
 * shell that also works on skinned meshes; a soft blob-shadow texture.
 *
 * Every resource made here or handed to `track` is released by `dispose()`,
 * so the arena can tear down completely before the menu scene returns
 * (docs/CODE-PRACTICES.md §7).
 */
export interface ArenaMaterials {
  /** Vertex-colored toon material shared by static map art and props. */
  toon: MeshToonMaterial;
  /** A separate toon material, e.g. one per fighter so hit flashes stay per fighter. */
  toonFor(opts?: { doubleSided?: boolean; transparent?: boolean }): MeshToonMaterial;
  /** Back-face ink shell inflated along normals by `thickness` model units. */
  outline(thickness: number): ShaderMaterial;
  /** Unlit material in a flat color, for decals and effects. */
  flat(color: number | string, opts?: { opacity?: number; doubleSided?: boolean; additive?: boolean }): MeshBasicMaterial;
  shadow: MeshBasicMaterial;
  track<T extends { dispose(): void }>(resource: T): T;
  dispose(): void;
}

/**
 * Inflates in model space before skinning, so the same shell works on static
 * props, the procedural rigs and skinned GLB fighters.
 */
const OUTLINE_VERTEX = /* glsl */ `
#include <skinning_pars_vertex>
uniform float thickness;
void main() {
  #include <skinbase_vertex>
  vec3 transformed = position + normalize(normal) * thickness;
  #include <skinning_vertex>
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}`;
const OUTLINE_FRAGMENT = /* glsl */ `
uniform vec3 tint;
void main() {
  gl_FragColor = vec4(tint, 1.0);
  #include <colorspace_fragment>
}`;

export function createArenaMaterials(): ArenaMaterials {
  const owned: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(r: T): T => {
    owned.push(r);
    return r;
  };
  // Same three-step ramp as the menu stage, so fighters read alike in both.
  const ramp = track(new DataTexture(new Uint8Array([70, 150, 255]), 3, 1, RedFormat));
  ramp.minFilter = ramp.magFilter = NearestFilter;
  ramp.needsUpdate = true;
  const toonFor: ArenaMaterials["toonFor"] = (opts = {}) =>
    track(
      new MeshToonMaterial({
        vertexColors: true,
        gradientMap: ramp,
        side: opts.doubleSided ? DoubleSide : FrontSide,
        transparent: !!opts.transparent,
      }),
    );
  const outlines = new Map<number, ShaderMaterial>();
  const outline = (thickness: number) => {
    let m = outlines.get(thickness);
    if (!m) {
      m = track(
        new ShaderMaterial({
          uniforms: { thickness: { value: thickness }, tint: { value: new Color(COLOR.ink) } },
          vertexShader: OUTLINE_VERTEX,
          fragmentShader: OUTLINE_FRAGMENT,
          side: BackSide,
        }),
      );
      outlines.set(thickness, m);
    }
    return m;
  };
  const flat: ArenaMaterials["flat"] = (color, opts = {}) =>
    track(
      new MeshBasicMaterial({
        color,
        transparent: opts.opacity !== undefined || !!opts.additive,
        opacity: opts.opacity ?? 1,
        depthWrite: opts.opacity === undefined && !opts.additive,
        side: opts.doubleSided ? DoubleSide : FrontSide,
        blending: opts.additive ? AdditiveBlending : NormalBlending,
        fog: false,
      }),
    );
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(10,24,22,0.5)");
    grad.addColorStop(0.6, "rgba(10,24,22,0.28)");
    grad.addColorStop(1, "rgba(10,24,22,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return track(t);
  })();
  const shadow = track(new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, fog: false }));
  return {
    toon: toonFor(),
    toonFor,
    outline,
    flat,
    shadow,
    track,
    dispose() {
      for (const r of owned.splice(0)) r.dispose();
      outlines.clear();
    },
  };
}

/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module 'excerpt' {
  function excerpt(text: string, phrase: string, radius?: number, ending?: string): string;
  export default excerpt;
}

type Unpromise<T extends Promise<any>> = T extends Promise<infer U> ? U : never;


declare module '*.glb';
declare module '*.png';

declare module 'meshline' {
  export const MeshLineGeometry: any;
  export const MeshLineMaterial: any;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      meshLineGeometry: any;
      meshLineMaterial: any;
    }
  }
}
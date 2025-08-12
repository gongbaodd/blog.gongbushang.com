/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module 'excerpt' {
  function excerpt(text: string, phrase: string, radius?: number, ending?: string): string;
  export default excerpt;
}
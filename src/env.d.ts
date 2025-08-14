/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module 'excerpt' {
  function excerpt(text: string, phrase: string, radius?: number, ending?: string): string;
  export default excerpt;
}

type Unpromise<T extends Promise<any>> = T extends Promise<infer U> ? U : never;

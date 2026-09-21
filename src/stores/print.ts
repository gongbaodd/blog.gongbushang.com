import { atom, onMount, onSet } from "nanostores";

export enum PRINT_SUPPORT_STATUS {
  TRUE,
  FALSE,
  UNKNOWN,
}

export const $isPrintSupported = atom(
  globalThis.print == undefined ? PRINT_SUPPORT_STATUS.FALSE : PRINT_SUPPORT_STATUS.UNKNOWN,
);
const $isPrintRequested = atom(false);

onMount($isPrintSupported, () => {
  if (import.meta.env.SSR) return;

  const printWindowOpened = () => {
    $isPrintSupported.set(PRINT_SUPPORT_STATUS.TRUE);
  };

  window.addEventListener("beforeprint", printWindowOpened);
  return () => {
    window.removeEventListener("beforeprint", printWindowOpened);
  };
});

onSet($isPrintRequested, (isPrintRequested) => {
  if (isPrintRequested) {
    setTimeout(() => {
      if ($isPrintSupported.get() !== PRINT_SUPPORT_STATUS.TRUE) {
        $isPrintSupported.set(PRINT_SUPPORT_STATUS.FALSE);
      }
    }, 500);
  }
});

export function requestPrint() {
  $isPrintRequested.set(true);
  globalThis.print?.();
}

const pdfLink = "/resume/pdfs/jian-gong-universal-en.pdf";
export function requestPDF(href: string = pdfLink) {
  location.href = href;
}

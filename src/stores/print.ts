import { atom, onMount, onSet } from "nanostores"

export enum PRINT_SUPPORT_STATUS {
    TRUE,
    FALSE,
    UNKNOWN
}   

export const $isPrintSupported = atom(globalThis.print == undefined? PRINT_SUPPORT_STATUS.FALSE : PRINT_SUPPORT_STATUS.UNKNOWN)
const $isPrintRequested = atom(false)

onMount($isPrintSupported, () => {
    const printWindowOpened = () => {
        $isPrintSupported.set(PRINT_SUPPORT_STATUS.TRUE)
    }

    window.addEventListener("beforeprint", printWindowOpened);
    return () => {
        window.removeEventListener("beforeprint", printWindowOpened)
    }
})

onSet($isPrintRequested, (isPrintRequested) => {
    if (isPrintRequested) {
        setTimeout(() => {
            if ($isPrintSupported.get() !== PRINT_SUPPORT_STATUS.TRUE) {
                $isPrintSupported.set(PRINT_SUPPORT_STATUS.FALSE)
            }
        }, 500)
    }
})


export function requestPrint() {
    $isPrintRequested.set(true)
    print()
}

const pdfLink = "https://res.cloudinary.com/dmq8ipket/image/upload/v1757748988/Resume_-_Jian_Gong_-_Web_Game_Dev_kkddqr.pdf"
export function requestPDF() {
    location.href = pdfLink
}
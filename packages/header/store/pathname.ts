import { atom, computed } from "nanostores";

export const $pathname = atom<string>("");

export const $pathnameNormalized = computed($pathname, (pathname) => {
    return normalizePath(pathname)
})

function normalizePath(path: string) {
  return path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
}
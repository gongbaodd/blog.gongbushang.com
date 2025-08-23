import { ROUTES } from "@/packages/consts";
import { atom } from "nanostores";

export const $links = atom< { label: string; href: string }[]>(ROUTES)
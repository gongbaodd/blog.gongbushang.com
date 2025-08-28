import { ROUTES } from "@/packages/consts";
import { atom } from "nanostores";

export interface ILink {
     label: string; href: string 
}

export const $links = atom< ILink[]>(ROUTES)
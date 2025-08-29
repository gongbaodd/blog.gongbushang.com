import { ROUTE_LABEL, ROUTES } from "@/packages/consts";
import { atom } from "nanostores";

export interface ILink {
     label: ROUTE_LABEL; href: string 
}

export const $links = atom< ILink[]>(ROUTES)
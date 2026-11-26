import { SITE_TITLE_NICK } from "@/src/consts";
import { atom } from "nanostores";

export const $title = atom<string>(SITE_TITLE_NICK);

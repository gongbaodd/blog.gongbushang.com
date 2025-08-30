import { ALL_ROUTE_HREF, ROUTE_HREF } from "@/packages/consts";
import { $pathnameNormalized } from "@/packages/header/store/pathname";
import { computed, map } from "nanostores";
import type { ReactNode } from "react";

const originMap = ALL_ROUTE_HREF.reduce((sum, href) => ({
    ...sum,
    [href]: null
}), {} as Record<ROUTE_HREF, null | ReactNode>)

export const $skeletons = map(originMap)

const originUseMap = ALL_ROUTE_HREF.reduce((sum, href) => ({
    ...sum,
    [href]: null
}), {} as Record<ROUTE_HREF, null | HTMLAnchorElement>)

export const $isInUse = map(originUseMap)

export const $skeletonsInPage = computed([$skeletons, $pathnameNormalized], (smap, path) => {
    return (Object.keys(smap) as (keyof typeof smap)[]).reduce((sum, key) => {
        if (key === path) return { ...sum }
        return { ...sum, [key]: smap[key] }
    }, {})
})

export const $skeletonsNotInUse = computed([$skeletonsInPage, $isInUse], (smap, useMap) => {
    return (Object.keys(smap) as (keyof typeof smap)[]).reduce((sum, key) => {
        if (!useMap[key]) return { ...sum, [key]: smap[key] }
        return { ...sum }
    }, {})
})


interface ISkeletons {
    home?: ReactNode
    blog?: ReactNode
    world?: ReactNode
    archive?: ReactNode
}

export function initSkeletons({ home, blog, world, archive }: ISkeletons) {
    $skeletons.setKey(ROUTE_HREF.Home, home)
    $skeletons.setKey(ROUTE_HREF.Blog, blog)
    $skeletons.setKey(ROUTE_HREF.World, world)
    $skeletons.setKey(ROUTE_HREF.Archive, archive)
}

export function occupySkeleton(applyer: HTMLAnchorElement, href: ROUTE_HREF) {
    const owner = $isInUse.get()[href]
    if (!owner) $isInUse.setKey(href, applyer)
}

export function releaseSkeleton(applyer: HTMLAnchorElement, href: ROUTE_HREF) {
    const owner = $isInUse.get()[href]
    if (owner == applyer) $isInUse.setKey(href, null)
}
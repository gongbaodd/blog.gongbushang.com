import { useStore } from "@nanostores/react"
import { useEffect, type ReactNode } from "react"
import { $skeletonsNotInUse, initSkeletons } from "../stores/skeletons"
import classes from "./TransitionSkeletons.module.css"

interface ISkeletons {
    home?: ReactNode
    blog?: ReactNode
    world?: ReactNode
    archive?: ReactNode
}

export function TransitionSkeletons(props: ISkeletons) {
    const skeletons = useStore($skeletonsNotInUse)    

    useEffect(() => {
        initSkeletons(props)
    }, [])

    return <>
        {(Object.keys(skeletons) as (keyof typeof skeletons)[]).map(key => {
            return (<div key={key} className={classes.container}>{skeletons[key]}</div>)
        })}
    </>
}
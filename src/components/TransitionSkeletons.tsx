import { useStore } from "@nanostores/react"
import { useEffect, type ReactNode } from "react"
import { $skeletonsNotInUse, initSkeletons } from "../stores/skeletons"

interface ISkeletons {
    home?: ReactNode
    blog?: ReactNode
    lab?: ReactNode
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
            return (<div key={key} style={{ width: 0, height: 0, position: "absolute", overflow: "hidden" }}>{skeletons[key]}</div>)
        })}
    </>
}
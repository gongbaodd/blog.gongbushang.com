import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Anchor, Popover, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { $isInUse, $skeletons, occupySkeleton, releaseSkeleton } from "../stores/skeletons";
import { $pathnameNormalized } from "@/packages/header/store/pathname";
import type { ROUTE_HREF } from "@/packages/consts";

interface IProps {
  href: ROUTE_HREF,
  render: ((opts: { isLoading: boolean, isCurrent: boolean }) => ReactNode),
}

export default function MantineAnchor({ href, render }: IProps) {
  const [opened, { close, open }] = useDisclosure(false)
  const skeletons = useStore($skeletons)
  const isInUse = useStore($isInUse)
  const { isLoading, onClickHandler, isCurrent } = usePreFetch(href)
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    if (opened || isLoading) {
      occupySkeleton(ref.current, href)
    } else {
      releaseSkeleton(ref.current, href)
    }
  }, [opened, isLoading])

  const { openState } = {
    get openState() {
      if (opened || isLoading) {
        return isInUse[href] == ref.current
      }
      return false
    }
  }

  return <CustomMantineProvider>
    {isCurrent ? render({isLoading, isCurrent}) :
      <Popover position="bottom" withArrow shadow="md" opened={openState}>
        <Popover.Target>
          <Anchor
            ref={ref}
            href={href}
            onMouseEnter={open} 
            onMouseLeave={close}
            onClick={onClickHandler}
          >
            {render({isLoading, isCurrent})}
          </Anchor>
        </Popover.Target>
        <Popover.Dropdown style={{ pointerEvents: 'none' }}>
          {skeletons[href]}
        </Popover.Dropdown>
      </Popover>
    }
  </CustomMantineProvider>
}

function usePreFetch(href: ROUTE_HREF) {
  const pathname = useStore($pathnameNormalized)
  const isCurrent = href === pathname
  const [isLoading, setIsLoading] = useState(false)
  const onClickHandler = useCallback(async (e: any) => {
    // do not stop loading in MPAs
    setIsLoading(true) 
    e.preventDefault()
    location.href = href
  }, [href])

  return {
    isCurrent,
    isLoading,
    onClickHandler,
  }
}

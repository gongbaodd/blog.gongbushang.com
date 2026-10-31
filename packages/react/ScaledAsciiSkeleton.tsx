import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AsciiSkeleton, type AsciiSkeletonProps } from "ascii-reveal";

/** A skeleton's glyph pattern has a fixed width of roughly this many px. */
const NATURAL_WIDTH = 900;

type IScaledAsciiSkeletonProps = Omit<AsciiSkeletonProps, "width" | "as">;

/** One skeleton stretched horizontally to fill its container, so there are no seams or gaps. */
export function ScaledAsciiSkeleton({ style, ...rest }: IScaledAsciiSkeletonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / NATURAL_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const inner: CSSProperties = {
    width: NATURAL_WIDTH,
    height: "100%",
    transformOrigin: "0 0",
    transform: `scaleX(${scale})`,
    ...style,
  };

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <AsciiSkeleton as="div" width={NATURAL_WIDTH} height="100%" style={inner} {...rest} />
    </div>
  );
}

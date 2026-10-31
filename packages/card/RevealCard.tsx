import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AsciiReveal } from "ascii-reveal";

/** Set by the server-rendered (hidden) card block, where no effect should run. */
export const AsciiPlaceholderContext = createContext(false);

// Cards that already played their reveal; masonry remounts cards on resize and views revisit them.
const revealed = new Set<string>();

interface IRevealCardProps {
  id: string;
  children: ReactNode;
  /** Also decode server-rendered content when it hydrates (carousel islands). */
  revealOnHydrate?: boolean;
}

/** Decodes a card into place through an ASCII grid, once per card id. */
export function RevealCard({ id, children, revealOnHydrate }: IRevealCardProps) {
  const placeholder = useContext(AsciiPlaceholderContext);
  const [first] = useState(() => !revealed.has(id));

  useEffect(() => {
    revealed.add(id);
  }, [id]);

  if (placeholder) return <>{children}</>;

  return (
    <AsciiReveal
      style={{ width: "100%" }}
      revealOnMount={first}
      revealOnHydrate={first && revealOnHydrate}
    >
      {children}
    </AsciiReveal>
  );
}

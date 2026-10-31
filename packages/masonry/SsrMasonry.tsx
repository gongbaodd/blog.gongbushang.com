import { useEffect, useState, type ReactNode } from "react";
import { Masonry } from "react-plock";
import classes from "./SsrMasonry.module.css";

interface ISsrMasonryProps<T> {
  items: T[];
  render: (item: T, index: number) => ReactNode;
}

const config = {
  columns: [1, 2, 3, 4, 5],
  gap: [48, 16, 32, 32, 32],
  media: [28, 48, 75, 88, 110].map((i) => i * 16),
};

/**
 * `react-plock` Masonry (cards flow left to right) that also puts the cards into the server HTML.
 * Masonry renders nothing until it knows the viewport, so until mount (server and first client
 * render, which must match) the cards are rendered flat and visually hidden; after mount the
 * normal masonry replaces them.
 */
export function SsrMasonry<T>({ items, render }: ISsrMasonryProps<T>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className={classes.ssr}>
        {items.map((item, i) => (
          <div key={i}>{render(item, i)}</div>
        ))}
      </div>
    );
  }

  return <Masonry items={items} config={config} render={render} />;
}

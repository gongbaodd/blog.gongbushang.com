const modules = import.meta.glob("./gallery/*.{jpg,jpeg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

export interface GalleryImage {
  name: string;
  url: string;
  path: string;
}

export function getGalleryImages(): GalleryImage[] {
  return Object.entries(modules)
    .map(([path, url]) => {
      const name = path.split("/").pop() ?? path;
      return { name, url: url as string, path };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

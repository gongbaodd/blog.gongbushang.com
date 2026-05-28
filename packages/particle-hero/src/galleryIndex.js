const modules = import.meta.glob('../gallery/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function getGalleryImages() {
  return Object.entries(modules)
    .map(([path, url]) => {
      const name = path.split('/').pop() ?? path;
      return { name, url, path };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

import { CATEGORY_COLORS } from "../postsData";
import { getGalleryImages } from "../galleryIndex";
import classes from "../ParticleHero.module.css";

export const POSTS_ITEM_ID = "posts";

export interface PickerItem {
  id: string;
  name: string;
  type: "posts" | "image";
  url?: string;
}

export function getPickerItems(): PickerItem[] {
  const gallery = getGalleryImages();
  return [
    { id: POSTS_ITEM_ID, name: "Posts", type: "posts" },
    ...gallery.map((g) => ({
      id: g.path,
      name: g.name,
      url: g.url,
      type: "image" as const,
    })),
  ];
}

interface IImagePickerProps {
  activeId: string;
  loading: boolean;
  onSelectPosts: () => Promise<void>;
  onSelectImage: (url: string, id: string) => Promise<void>;
}

export default function ImagePicker({
  activeId,
  loading,
  onSelectPosts,
  onSelectImage,
}: IImagePickerProps) {
  const items = getPickerItems();

  async function handleSelect(item: PickerItem) {
    if (item.id === activeId || loading) return;
    if (item.type === "posts") {
      await onSelectPosts();
    } else if (item.url) {
      await onSelectImage(item.url, item.id);
    }
  }

  return (
    <div className={classes.picker} aria-label="View picker">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={
            classes.pickerBtn +
            (activeId === item.id ? " " + classes.pickerBtnActive : "")
          }
          title={item.name}
          disabled={loading}
          onClick={() => handleSelect(item)}
        >
          {item.type === "posts" ? (
            <div className={classes.pickerPostsSwatch}>
              {Object.values(CATEGORY_COLORS).map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </div>
          ) : (
            <img src={item.url} alt={item.name} />
          )}
          <span className={classes.pickerLabel}>
            {item.name.replace(/\.[^.]+$/, "")}
          </span>
        </button>
      ))}
    </div>
  );
}

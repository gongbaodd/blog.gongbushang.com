import { getGalleryImages } from '../galleryIndex.js';
import { CATEGORY_COLORS } from '../postsData.js';

const POSTS_ITEM = {
  id: 'posts',
  name: 'Posts',
  type: 'posts',
};

const DEFAULT_IMAGE = {
  id: 'rhino',
  name: 'Rhino',
  url: '/images/rhino.png',
  type: 'image',
};

export function createImagePicker({ onSelectPosts, onSelectImage }) {
  const root = document.getElementById('picker');
  const gallery = getGalleryImages();
  const items = [
    POSTS_ITEM,
    DEFAULT_IMAGE,
    ...gallery.map((g) => ({ id: g.path, name: g.name, url: g.url, type: 'image' })),
  ];

  let activeId = POSTS_ITEM.id;

  function setActive(id) {
    activeId = id;
    root.querySelectorAll('.picker-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.id === id);
    });
  }

  function setLoading(loading) {
    const el = document.getElementById('loading');
    el.classList.toggle('hidden', !loading);
  }

  root.innerHTML = '';

  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'picker-btn';
    btn.dataset.id = item.id;
    btn.title = item.name;

    if (item.type === 'posts') {
      const swatch = document.createElement('div');
      swatch.className = 'picker-posts-swatch';
      for (const color of Object.values(CATEGORY_COLORS)) {
        const dot = document.createElement('span');
        dot.style.background = color;
        swatch.appendChild(dot);
      }
      btn.appendChild(swatch);
    } else {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = item.name;
      btn.appendChild(img);
    }

    const label = document.createElement('span');
    label.textContent = item.name.replace(/\.[^.]+$/, '');

    btn.append(label);
    btn.addEventListener('click', async () => {
      if (item.id === activeId) return;
      setLoading(true);
      try {
        if (item.type === 'posts') {
          await onSelectPosts();
        } else {
          await onSelectImage(item.url);
        }
        setActive(item.id);
      } finally {
        setLoading(false);
      }
    });

    root.appendChild(btn);
  }

  setActive(activeId);

  return {
    getDefaultImageId: () => DEFAULT_IMAGE.id,
    getDefaultImageUrl: () => DEFAULT_IMAGE.url,
    setActive,
    setLoading,
  };
}

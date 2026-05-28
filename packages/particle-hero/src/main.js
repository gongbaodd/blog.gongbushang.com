import App from './App.js';
import { createImagePicker } from './ui/imagePicker.js';
import { createLegendFilter } from './ui/legendFilter.js';
import { fetchPosts, getCategoryColor } from './postsData.js';

const container = document.getElementById('app');
const tooltip = document.getElementById('tooltip');
const app = new App(container);

let cachedPosts = null;
let legendFilter = null;
let lastHoveredId = null;

function applyFilter() {
  if (legendFilter) {
    app.setPostFilter(legendFilter.getState());
  }
}

function showTooltip(post, event) {
  if (!post) {
    tooltip.classList.add('hidden');
    tooltip.setAttribute('aria-hidden', 'true');
    lastHoveredId = null;
    return;
  }

  const label = post.category?.label ?? '';
  const color = getCategoryColor(label);

  if (post.id !== lastHoveredId) {
    lastHoveredId = post.id;
    tooltip.innerHTML = `
      <div class="tooltip-title">${post.title}</div>
      <span class="tooltip-category" style="background:${color}33;color:${color}">${label}</span>
    `;
    tooltip.classList.remove('hidden');
    tooltip.setAttribute('aria-hidden', 'false');
  }

  if (event?.intersectionData) {
    const canvas = app.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + event.intersectionData.uv.x * rect.width;
    const y = rect.top + (1 - event.intersectionData.uv.y) * rect.height;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
}

app.setHoverHandler(showTooltip);

const picker = createImagePicker({
  onSelectPosts: async () => {
    if (!cachedPosts) cachedPosts = await fetchPosts();
    await app.loadPosts(cachedPosts);
    applyFilter();
  },
  onSelectImage: async (url) => {
    if (!cachedPosts) cachedPosts = await fetchPosts();
    await app.loadImage(url, cachedPosts);
    applyFilter();
  },
});

async function init() {
  picker.setLoading(true);
  try {
    cachedPosts = await fetchPosts();
    legendFilter = createLegendFilter({
      posts: cachedPosts,
      onChange: (state) => app.setPostFilter(state),
    });
    await app.loadImage(picker.getDefaultImageUrl(), cachedPosts);
    applyFilter();
    picker.setActive(picker.getDefaultImageId());
  } finally {
    picker.setLoading(false);
  }
}

function animate() {
  requestAnimationFrame(animate);
  app.update();
  app.draw();
}

app.resize();
window.addEventListener('resize', () => app.resize());
init();
animate();

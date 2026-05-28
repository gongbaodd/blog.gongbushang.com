import { getCategoryColor, getFilterOptions } from '../postsData.js';

export function createLegendFilter({ posts, onChange }) {
  const root = document.getElementById('legend-filter');
  const { categories, years } = getFilterOptions(posts);

  let selectedCategory = 'all';
  let selectedYear = years[years.length - 1];

  root.innerHTML = '';
  root.className = 'legend-filter';
  root.setAttribute('aria-label', 'Category and year filter');

  const categoriesEl = document.createElement('div');
  categoriesEl.className = 'legend-categories';

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'legend-chip active';
  allChip.dataset.category = 'all';
  allChip.innerHTML = '<span class="legend-swatch legend-swatch-all"></span><span>All</span>';
  categoriesEl.appendChild(allChip);

  for (const category of categories) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'legend-chip';
    chip.dataset.category = category;
    const color = getCategoryColor(category);
    chip.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${category.toUpperCase()}</span>`;
    categoriesEl.appendChild(chip);
  }

  const yearsEl = document.createElement('div');
  yearsEl.className = 'legend-years';

  const yearLabel = document.createElement('div');
  yearLabel.className = 'legend-year-label';

  function updateYearLabel() {
    yearLabel.textContent =
      selectedYear === years[years.length - 1] ? 'All' : `≤ ${selectedYear}`;
  }

  updateYearLabel();

  const sliderRow = document.createElement('div');
  sliderRow.className = 'legend-slider-row';

  const minLabel = document.createElement('span');
  minLabel.className = 'legend-year-bound';
  minLabel.textContent = years[0];

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'legend-year-slider';
  slider.min = '0';
  slider.max = String(years.length - 1);
  slider.step = '1';
  slider.value = String(years.length - 1);
  slider.setAttribute('aria-label', 'Filter by year');

  const maxLabel = document.createElement('span');
  maxLabel.className = 'legend-year-bound';
  maxLabel.textContent = years[years.length - 1];

  sliderRow.append(minLabel, slider, maxLabel);
  yearsEl.append(yearLabel, sliderRow);
  root.append(categoriesEl, yearsEl);

  function emitChange() {
    onChange({ category: selectedCategory, year: selectedYear });
  }

  categoriesEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.legend-chip');
    if (!chip) return;
    selectedCategory = chip.dataset.category;
    categoriesEl.querySelectorAll('.legend-chip').forEach((el) => {
      el.classList.toggle('active', el.dataset.category === selectedCategory);
    });
    emitChange();
  });

  slider.addEventListener('input', () => {
    selectedYear = years[Number(slider.value)];
    updateYearLabel();
    emitChange();
  });

  return {
    getState: () => ({ category: selectedCategory, year: selectedYear }),
  };
}

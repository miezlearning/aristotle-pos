/**
 * Aristotle POS - Universal Material Design 3 Custom Select Component
 * Menggantikan seluruh <select> native browser menjadi custom dropdown menu
 * Material Design 3 yang responsif, beranimasi, dan konsisten di HP & Tablet.
 */

import { playClick } from './utils.js';

let activeOpenMenu = null;

/**
 * Tutup semua custom select yang sedang terbuka
 */
export function closeAllCustomSelects() {
  const openMenus = document.querySelectorAll('.m3-select-menu:not(.hidden)');
  openMenus.forEach(menu => {
    menu.classList.add('hidden');
    const wrapper = menu.closest('.m3-custom-select');
    if (wrapper) {
      const chevron = wrapper.querySelector('.m3-select-chevron');
      if (chevron) chevron.classList.remove('rotate-180');
      const trigger = wrapper.querySelector('.m3-select-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  });
  activeOpenMenu = null;
}

// Global click outside listener
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.m3-custom-select')) {
      closeAllCustomSelects();
    }
  }, { capture: true });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllCustomSelects();
    }
  });
}

/**
 * Sinkronkan tampilan custom select dengan state <select> asli
 * @param {HTMLSelectElement} selectEl 
 */
export function syncCustomSelect(selectEl) {
  if (!selectEl || !selectEl._m3Wrapper) return;
  const wrapper = selectEl._m3Wrapper;
  const trigger = wrapper.querySelector('.m3-select-trigger');
  const labelEl = wrapper.querySelector('.m3-select-label');
  const menuEl = wrapper.querySelector('.m3-select-menu');
  if (!trigger || !labelEl || !menuEl) return;

  const options = Array.from(selectEl.options || []);
  const selectedIndex = selectEl.selectedIndex >= 0 ? selectEl.selectedIndex : 0;
  const selectedOption = options[selectedIndex] || options[0];

  // Update label trigger
  if (selectedOption) {
    labelEl.textContent = selectedOption.textContent.trim();
  } else {
    labelEl.textContent = 'Pilih salah satu...';
  }

  // Update daftar menu popover
  menuEl.innerHTML = options.map((opt, idx) => {
    const isSelected = opt.value === selectEl.value || (selectEl.value === '' && idx === selectedIndex);
    const isIconCandidate = opt.value && (opt.value.includes('_') || opt.value.length < 25) && !opt.value.includes(' ');
    
    return `
      <div class="m3-select-option px-3.5 py-2.5 flex items-center justify-between text-xs sm:text-sm cursor-pointer transition select-none ${
        isSelected 
          ? 'font-black text-emerald-950 bg-emerald-50' 
          : 'font-medium text-stone-700 hover:bg-stone-50 hover:text-stone-900'
      }" data-value="${opt.value}" role="option" aria-selected="${isSelected}">
        <div class="flex items-center gap-2 min-w-0">
          <span class="truncate">${opt.textContent.trim()}</span>
        </div>
        ${isSelected ? '<span class="material-symbols-rounded text-sm text-emerald-700 shrink-0">check</span>' : ''}
      </div>
    `;
  }).join('');

  // Pasang listener klik ke setiap opsi
  menuEl.querySelectorAll('.m3-select-option').forEach(optEl => {
    optEl.onclick = (e) => {
      e.stopPropagation();
      const val = optEl.getAttribute('data-value');
      if (selectEl.value !== val) {
        selectEl.value = val;
        // Trigger event standar
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof selectEl.onchange === 'function') {
          selectEl.onchange.call(selectEl, new Event('change'));
        }
      }
      playClick('tap');
      closeAllCustomSelects();
      syncCustomSelect(selectEl);
    };
  });
}

/**
 * Ubah elemen <select> native menjadi Material Design 3 Custom Dropdown
 * @param {HTMLSelectElement} selectEl 
 */
export function enhanceSelectElement(selectEl) {
  if (!selectEl || selectEl._m3Wrapper || selectEl.dataset.noCustom === 'true') {
    if (selectEl && selectEl._m3Wrapper) {
      syncCustomSelect(selectEl);
    }
    return;
  }

  // Jangan sentuh select headless/hidden bawaan stubs
  if (selectEl.style.display === 'none' && !selectEl.id) return;
  if (selectEl.closest('[style*="display: none"]')) return;

  // Sembunyikan native select tapi tetap pertahankan di DOM untuk value & form
  selectEl.style.setProperty('display', 'none', 'important');
  selectEl.setAttribute('aria-hidden', 'true');
  selectEl.tabIndex = -1;

  // Cek apakah select berukuran kompak (misal di superadmin bar)
  const isCompact = selectEl.classList.contains('h-8') || selectEl.classList.contains('text-xs');

  // Buat wrapper Custom Select MD3
  const wrapper = document.createElement('div');
  wrapper.className = `m3-custom-select relative w-full text-left ${selectEl.className.includes('max-w') ? 'max-w-[200px]' : ''}`;
  if (selectEl.id) wrapper.dataset.enhancedId = selectEl.id;

  // Tombol trigger MD3
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = isCompact
    ? 'm3-select-trigger w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-white hover:border-stone-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/20 text-xs font-bold text-stone-800 shadow-2xs transition active:scale-[0.99] cursor-pointer'
    : 'm3-select-trigger w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white hover:border-emerald-600 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 text-xs sm:text-sm font-bold text-stone-900 shadow-2xs transition active:scale-[0.99] cursor-pointer';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const labelEl = document.createElement('span');
  labelEl.className = 'm3-select-label truncate';

  const chevronEl = document.createElement('span');
  chevronEl.className = 'material-symbols-rounded text-lg text-stone-400 shrink-0 transition-transform duration-200 m3-select-chevron';
  chevronEl.textContent = 'expand_more';

  trigger.appendChild(labelEl);
  trigger.appendChild(chevronEl);

  // Popover menu
  const menu = document.createElement('div');
  menu.className = 'm3-select-menu hidden absolute left-0 right-0 top-full mt-1.5 z-[80] bg-white rounded-2xl shadow-xl border border-stone-200/90 py-1.5 max-h-60 overflow-y-auto custom-scroll animate-in fade-in zoom-in-95';
  menu.setAttribute('role', 'listbox');

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);

  // Sisipkan wrapper tepat setelah select asli
  if (selectEl.nextSibling) {
    selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
  } else {
    selectEl.parentNode.appendChild(wrapper);
  }

  // Tautkan referensi ke selectEl
  selectEl._m3Wrapper = wrapper;

  // Toggle buka/tutup saat trigger ditekan
  trigger.onclick = (e) => {
    e.stopPropagation();
    const isOpen = !menu.classList.contains('hidden');
    if (isOpen) {
      closeAllCustomSelects();
    } else {
      closeAllCustomSelects();
      syncCustomSelect(selectEl);
      menu.classList.remove('hidden');
      chevronEl.classList.add('rotate-180');
      trigger.setAttribute('aria-expanded', 'true');
      activeOpenMenu = menu;
      playClick('pop');

      // Scroll selected option into view
      requestAnimationFrame(() => {
        const selectedOpt = menu.querySelector('[aria-selected="true"]');
        if (selectedOpt) {
          selectedOpt.scrollIntoView({ block: 'nearest' });
        }
      });
    }
  };

  // Setup MutationObserver agar jika <option> diubah secara dinamis oleh JS, custom select otomatis terupdate
  const observer = new MutationObserver(() => {
    syncCustomSelect(selectEl);
  });
  observer.observe(selectEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected', 'value'] });
  selectEl._m3Observer = observer;

  // Intercept setter selectEl.value agar update UI otomatis jika diubah secara terprogram
  const origDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  if (origDescriptor && !selectEl._hasValueProxy) {
    selectEl._hasValueProxy = true;
    Object.defineProperty(selectEl, 'value', {
      get: function() {
        return origDescriptor.get.call(this);
      },
      set: function(val) {
        origDescriptor.set.call(this, val);
        syncCustomSelect(this);
      },
      configurable: true
    });
  }

  // Inisialisasi awal
  syncCustomSelect(selectEl);
}

/**
 * Scan dan ubah semua elemen <select> dalam sebuah container atau dokumen
 * @param {HTMLElement|Document} root 
 */
export function initAllCustomSelects(root = document) {
  if (!root || !root.querySelectorAll) return;
  const selects = root.querySelectorAll('select:not([data-no-custom="true"])');
  selects.forEach(sel => {
    enhanceSelectElement(sel);
  });
}

// Pasang Global Auto-Observer untuk mendeteksi select baru yang dimasukkan ke DOM
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const autoObserver = new MutationObserver((mutations) => {
    let hasNewSelects = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'SELECT') {
            enhanceSelectElement(node);
          } else if (node.querySelectorAll) {
            const innerSelects = node.querySelectorAll('select:not([data-no-custom="true"])');
            if (innerSelects.length > 0) {
              innerSelects.forEach(s => enhanceSelectElement(s));
            }
          }
        }
      }
    }
  });

  if (document.body) {
    autoObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      autoObserver.observe(document.body, { childList: true, subtree: true });
    });
  }
}

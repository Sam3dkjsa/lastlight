(() => {
  'use strict';

  const STORAGE_KEY = 'lastlight-ledger-v1';
  const FACTOR_KEY = 'lastlight-demo-factor-v1';
  const DEFAULT_FACTOR = 1.8;
  const SUCCESS_SHARES = { repurpose: 0.90, staff: 0.85, discount: 0.70, donate: 0.80, compost: 0, dispose: 0 };
  const ACTIONS = [
    { value: '', label: 'Choose a route…' },
    { value: 'repurpose', label: 'Repurpose · 90% assumed' },
    { value: 'staff', label: 'Staff use · 85% assumed' },
    { value: 'discount', label: 'Discount · 70% assumed' },
    { value: 'donate', label: 'Donation · 80% assumed' },
    { value: 'compost', label: 'Compost · 0% food credit' },
    { value: 'dispose', label: 'Safe disposal · 0% food credit' }
  ];
  const CATEGORY = {
    produce: { title: 'Produce', icon: '◒', className: 'cat-produce', suggestion: 'repurpose' },
    bakery: { title: 'Bakery', icon: '♨', className: 'cat-bakery', suggestion: 'discount' },
    prepared: { title: 'Prepared food', icon: '◉', className: 'cat-prepared', suggestion: 'staff' },
    dairy: { title: 'Dairy & chilled', icon: '❄', className: 'cat-dairy', suggestion: 'staff' },
    other: { title: 'Other', icon: '✳', className: 'cat-other', suggestion: '' }
  };
  const ROUTE_ROWS = [
    { key: 'repurpose', label: 'Repurpose' },
    { key: 'staff', label: 'Staff use' },
    { key: 'discount', label: 'Discount' },
    { key: 'donate', label: 'Donation' },
    { key: 'endOfLife', label: 'Compost or safe disposal' },
    { key: 'unassigned', label: 'Not assigned' }
  ];
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const list = $('#inventory-list');
  let activeFilter = 'all';
  let toastTimer;

  function sampleData() {
    const now = Date.now();
    const after = (hours) => new Date(now + hours * 3600000).toISOString();
    return [
      { id: crypto.randomUUID(), name: 'Ripe strawberries', category: 'produce', quantity: 1.8, unit: 'kg', until: after(1.6), notes: 'Whole berries; check condition before using.', action: 'repurpose', completed: false },
      { id: crypto.randomUUID(), name: 'Sourdough loaves', category: 'bakery', quantity: 4, unit: 'item', until: after(3.2), notes: 'Offer while fresh, if your usual process allows.', action: 'discount', completed: false },
      { id: crypto.randomUUID(), name: 'Roasted vegetable soup', category: 'prepared', quantity: 1.2, unit: 'kg', until: after(8.5), notes: 'Chilled promptly; follow your local handling rules.', action: 'staff', completed: false },
      { id: crypto.randomUUID(), name: 'Herb bunches', category: 'produce', quantity: 6, unit: 'item', until: after(21), notes: 'A local partner may accept; confirm directly first.', action: 'donate', completed: false },
      { id: crypto.randomUUID(), name: 'Coffee-ground pucks', category: 'other', quantity: 900, unit: 'g', until: after(4.8), notes: 'For a local compost stream, if accepted.', action: 'compost', completed: false }
    ];
  }

  function safeRead(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.warn('LastLight could not read this browser’s saved demo data.', error);
      return fallback;
    }
  }

  let entries = safeRead(STORAGE_KEY, null);
  if (!Array.isArray(entries)) entries = sampleData();
  let impactFactor = Number(safeRead(FACTOR_KEY, DEFAULT_FACTOR));
  if (!Number.isFinite(impactFactor) || impactFactor < 0 || impactFactor > 10) impactFactor = DEFAULT_FACTOR;

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      localStorage.setItem(FACTOR_KEY, JSON.stringify(impactFactor));
    } catch (error) {
      notify('This browser could not save the local demo. Your current board may not persist.');
      console.warn('LastLight could not save this browser’s demo data.', error);
    }
  }

  function estimatedKg(entry) {
    const quantity = Number(entry.quantity) || 0;
    if (entry.unit === 'kg') return quantity;
    if (entry.unit === 'g') return quantity / 1000;
    if (entry.unit === 'portion') return quantity * 0.25;
    if (entry.unit === 'item') return quantity * 0.18;
    return 0;
  }

  function routeShare(action) {
    return Object.hasOwn(SUCCESS_SHARES, action) ? SUCCESS_SHARES[action] : 0;
  }

  function timeLeft(until) {
    const ms = new Date(until).getTime() - Date.now();
    if (!Number.isFinite(ms)) return { ms: Infinity, label: 'Time not set', level: 'soon' };
    const mins = Math.round(ms / 60000);
    if (mins < 0) {
      const overdueHours = Math.floor(Math.abs(mins) / 60);
      return { ms, label: overdueHours >= 1 ? `${overdueHours}h past window` : 'Past window', level: 'overdue' };
    }
    if (mins < 60) return { ms, label: `${Math.max(mins, 1)} min left`, level: 'urgent' };
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hours <= 4) return { ms, label: `${hours}h ${remainingMins}m left`, level: 'urgent' };
    if (hours < 12) return { ms, label: `${hours}h ${remainingMins}m left`, level: 'soon' };
    if (hours < 24) return { ms, label: `${hours}h left`, level: 'later' };
    const days = Math.floor(hours / 24);
    return { ms, label: `${days}d ${hours % 24}h left`, level: 'later' };
  }

  function formatQuantity(entry) {
    const value = Number(entry.quantity) || 0;
    const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
    const label = { kg: 'kg', g: 'g', portion: value === 1 ? 'portion' : 'portions', item: value === 1 ? 'item' : 'items' }[entry.unit] || entry.unit;
    return `${rounded} ${label}`;
  }

  function formatUntil(iso) {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return 'Window not set';
    return `Use by ${new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(date)}`;
  }

  function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function getFilteredSorted() {
    return entries
      .filter((entry) => activeFilter === 'all' || (activeFilter === 'done' ? entry.completed : !entry.completed))
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(a.until).getTime() - new Date(b.until).getTime();
      });
  }

  function updateRouteMix() {
    const counts = Object.fromEntries(ROUTE_ROWS.map((route) => [route.key, 0]));
    entries.forEach((entry) => {
      if (entry.action === 'compost' || entry.action === 'dispose') counts.endOfLife += 1;
      else if (Object.hasOwn(counts, entry.action)) counts[entry.action] += 1;
      else counts.unassigned += 1;
    });
    const busiest = Math.max(1, ...Object.values(counts));
    const assigned = entries.length - counts.unassigned;
    ROUTE_ROWS.forEach(({ key, label }) => {
      const value = counts[key];
      $(`#route-count-${key}`).textContent = String(value);
      $(`#route-bar-${key}`).style.setProperty('--bar-width', `${value ? Math.max(5, (value / busiest) * 100) : 0}%`);
      $(`#route-bar-${key}`).parentElement.setAttribute('aria-label', `${label}: ${value} ${value === 1 ? 'item' : 'items'}`);
    });
    $('#route-pulse-caption').textContent = entries.length
      ? `${assigned} of ${entries.length} ${entries.length === 1 ? 'item has' : 'items have'} a route. Bars compare counts with the busiest route.`
      : 'No items on the board yet. Bars will appear when a route is chosen.';
    $('#route-mix').setAttribute('aria-label', `${entries.length} items on board. ${ROUTE_ROWS.map(({ key, label }) => `${label}: ${counts[key]}`).join('; ')}.`);
  }

  function refreshLiveUrgency() {
    let urgent = 0;
    const open = entries.filter((entry) => !entry.completed);
    open.forEach((entry) => {
      const urgency = timeLeft(entry.until);
      if (urgency.level === 'urgent' || urgency.level === 'overdue') urgent += 1;
      const card = list.querySelector(`[data-entry-id="${CSS.escape(String(entry.id))}"]`);
      const badge = card && $('[data-urgency-badge]', card);
      if (!badge) return;
      Array.from(card.classList).filter((className) => className.startsWith('urgency-')).forEach((className) => card.classList.remove(className));
      card.classList.add(`urgency-${urgency.level}`);
      badge.innerHTML = `<span class="badge-dot"></span>${escapeHTML(urgency.label)}`;
      badge.setAttribute('aria-label', `${urgency.label}; ${formatUntil(entry.until)}`);
      badge.title = formatUntil(entry.until);
    });
    $('#urgent-count').textContent = `${urgent} need${urgent === 1 ? 's' : ''} a look soon`;
    $('#hero-guidance').textContent = urgent ? `${urgent} ${urgent === 1 ? 'item is' : 'items are'} closest to its use-by window.` : 'Every good plan starts with a clear count.';
  }

  function render() {
    const nowEntries = getFilteredSorted();
    list.innerHTML = nowEntries.map((entry) => {
      const category = CATEGORY[entry.category] || CATEGORY.other;
      const urgency = entry.completed ? { label: 'Workflow resolved', level: 'done' } : timeLeft(entry.until);
      const share = routeShare(entry.action);
      const scenarioKg = estimatedKg(entry) * share;
      const actionOptions = ACTIONS.map((option) => `<option value="${option.value}"${option.value === (entry.action || '') ? ' selected' : ''}>${option.label}</option>`).join('');
      const actionLabel = ACTIONS.find((option) => option.value === entry.action)?.label.split(' · ')[0] || 'no route selected';
      return `<article class="item-card urgency-${urgency.level}${entry.completed ? ' is-done' : ''}" data-entry-id="${escapeHTML(entry.id)}">
        <div class="item-top">
          <div class="item-identity"><span class="category-icon ${category.className}" aria-hidden="true">${category.icon}</span><div><h3 class="item-title">${escapeHTML(entry.name)}</h3><span class="item-subtitle">${escapeHTML(category.title)} · ${escapeHTML(formatUntil(entry.until))}</span></div></div>
          <div class="quantity-block"><span class="quantity-value">${escapeHTML(formatQuantity(entry))}</span><span class="quantity-estimate">≈ ${estimatedKg(entry).toFixed(2)} kg estimated mass</span></div>
          <span class="urgency-badge" data-urgency-badge aria-label="${escapeHTML(urgency.label)}; ${escapeHTML(formatUntil(entry.until))}" title="${escapeHTML(formatUntil(entry.until))}"><span class="badge-dot"></span>${escapeHTML(urgency.label)}</span>
        </div>
        ${entry.notes ? `<p class="item-notes">${escapeHTML(entry.notes)}</p>` : ''}
        <div class="item-controls"><label class="route-label" for="action-${escapeHTML(entry.id)}">ROUTE</label><select class="route-select" id="action-${escapeHTML(entry.id)}" data-action-select="${escapeHTML(entry.id)}" aria-label="Choose an action for ${escapeHTML(entry.name)}">${actionOptions}</select>
          ${entry.completed ? `<span class="item-complete-note">Closed as: ${escapeHTML(actionLabel)} · workflow only</span><button type="button" class="resolve-button undo" data-undo="${escapeHTML(entry.id)}">Reopen</button>` : `<span class="action-state">${entry.action ? `${scenarioKg.toFixed(2)} kg potential*` : 'Choose an action'}</span><button type="button" class="resolve-button" data-resolve="${escapeHTML(entry.id)}" ${entry.action ? '' : 'disabled title="Choose a route first"'}>Mark complete</button>`}
          <button type="button" class="delete-button" data-delete="${escapeHTML(entry.id)}" aria-label="Remove ${escapeHTML(entry.name)} from the board" title="Remove item">×</button>
        </div>
      </article>`;
    }).join('');
    $('#empty-state').hidden = nowEntries.length !== 0;
    list.hidden = nowEntries.length === 0;
    const open = entries.filter((entry) => !entry.completed);
    const done = entries.filter((entry) => entry.completed);
    const urgent = open.filter((entry) => timeLeft(entry.until).level === 'urgent' || timeLeft(entry.until).level === 'overdue').length;
    const scenarioFood = entries.reduce((sum, entry) => sum + estimatedKg(entry) * routeShare(entry.action), 0);
    const scenarioEmissions = scenarioFood * impactFactor;
    $('#metric-food').innerHTML = `${scenarioFood.toFixed(2)} <small>kg</small>`;
    $('#metric-co2').innerHTML = `${scenarioEmissions.toFixed(2)} <small>kg</small>`;
    $('#metric-done').textContent = String(done.length);
    $('#metric-done-caption').textContent = done.length === 1 ? 'workflow closed · not proof of recovery' : 'workflow status, not proof of recovery';
    $('#open-count').textContent = `${open.length} ${open.length === 1 ? 'item' : 'items'} still in play`;
    $('#urgent-count').textContent = `${urgent} need${urgent === 1 ? 's' : ''} a look soon`;
    $('#hero-guidance').textContent = urgent ? `${urgent} ${urgent === 1 ? 'item is' : 'items are'} closest to its use-by window.` : 'Every good plan starts with a clear count.';
    $('#filter-all-count').textContent = String(entries.length);
    $('#filter-open-count').textContent = String(open.length);
    $('#filter-done-count').textContent = String(done.length);
    $('#factor-input').value = impactFactor.toFixed(1);
    $('#today-label').textContent = `CAFÉ CLOSE · ${new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()).toUpperCase()}`;
    updateRouteMix();
  }

  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function closeDialog() {
    const dialog = $('#item-dialog');
    if (dialog.open) dialog.close();
  }

  function defaultLocalDateTime(hoursAhead = 4) {
    const date = new Date(Date.now() + hoursAhead * 3600000);
    date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  $$('[data-open-form]').forEach((button) => button.addEventListener('click', () => {
    $('#item-until').value = defaultLocalDateTime();
    $('#item-dialog').showModal();
    setTimeout(() => $('#item-name').focus(), 0);
  }));
  $$('[data-close-form]').forEach((button) => button.addEventListener('click', closeDialog));
  $('#item-dialog').addEventListener('click', (event) => { if (event.target === $('#item-dialog')) closeDialog(); });

  $('#item-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const category = String(data.get('category'));
    const entry = {
      id: crypto.randomUUID(), name: String(data.get('name')).trim(), category,
      quantity: Number(data.get('quantity')), unit: String(data.get('unit')),
      until: new Date(String(data.get('until'))).toISOString(), notes: String(data.get('notes')).trim(),
      action: CATEGORY[category]?.suggestion || '', completed: false
    };
    entries.unshift(entry);
    persist();
    activeFilter = 'all';
    $$('.filter-tab').forEach((tab) => { const selected = tab.dataset.filter === 'all'; tab.classList.toggle('active', selected); tab.setAttribute('aria-pressed', String(selected)); });
    form.reset();
    closeDialog();
    render();
    notify('Added to tonight’s ledger. Choose or change the suggested route.');
    document.querySelector('#board').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $$('.filter-tab').forEach((tab) => tab.addEventListener('click', () => {
    activeFilter = tab.dataset.filter;
    $$('.filter-tab').forEach((candidate) => { const selected = candidate === tab; candidate.classList.toggle('active', selected); candidate.setAttribute('aria-pressed', String(selected)); });
    render();
  }));

  list.addEventListener('change', (event) => {
    const select = event.target.closest('[data-action-select]');
    if (!select) return;
    const entry = entries.find((item) => item.id === select.dataset.actionSelect);
    if (!entry) return;
    entry.action = select.value;
    persist();
    render();
    notify(entry.action ? 'Route updated. The scenario estimate has been recalculated.' : 'Route cleared. No impact scenario is counted for this item.');
  });

  list.addEventListener('click', (event) => {
    const resolveButton = event.target.closest('[data-resolve]');
    const undoButton = event.target.closest('[data-undo]');
    const deleteButton = event.target.closest('[data-delete]');
    if (resolveButton) {
      const entry = entries.find((item) => item.id === resolveButton.dataset.resolve);
      if (entry?.action) {
        entry.completed = true;
        entry.completedAt = new Date().toISOString();
        persist();
        render();
        notify('Workflow closed. The scenario still isn’t a verified recovery measurement.');
      }
    } else if (undoButton) {
      const entry = entries.find((item) => item.id === undoButton.dataset.undo);
      if (entry) {
        entry.completed = false;
        delete entry.completedAt;
        persist();
        render();
        notify('Item reopened on the board.');
      }
    } else if (deleteButton) {
      entries = entries.filter((item) => item.id !== deleteButton.dataset.delete);
      persist();
      render();
      notify('Item removed from this browser’s board.');
    }
  });

  $('#factor-save').addEventListener('click', () => {
    const input = $('#factor-input');
    const candidate = Number(input.value);
    if (!Number.isFinite(candidate) || candidate < 0 || candidate > 10) {
      $('#factor-warning').textContent = 'Enter a demo factor from 0 to 10 kg CO₂e per kg. It remains a placeholder, not a verified source value.';
      input.focus();
      return;
    }
    impactFactor = Math.round(candidate * 10) / 10;
    persist();
    $('#factor-warning').textContent = 'Factor updated. This remains an illustrative placeholder—not a location-specific or independently sourced emissions factor.';
    render();
    notify('Illustrative factor applied to the scenario.');
  });

  $('#reset-demo').addEventListener('click', () => {
    entries = sampleData();
    activeFilter = 'all';
    impactFactor = DEFAULT_FACTOR;
    $$('.filter-tab').forEach((tab) => { const selected = tab.dataset.filter === 'all'; tab.classList.toggle('active', selected); tab.setAttribute('aria-pressed', String(selected)); });
    persist();
    render();
    notify('Sample café data restored on this device.');
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      entries = safeRead(STORAGE_KEY, []);
      if (!Array.isArray(entries)) entries = [];
      render();
    }
    if (event.key === FACTOR_KEY) {
      const nextFactor = Number(safeRead(FACTOR_KEY, DEFAULT_FACTOR));
      if (Number.isFinite(nextFactor) && nextFactor >= 0 && nextFactor <= 10) impactFactor = nextFactor;
      render();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshLiveUrgency();
  });
  window.setInterval(refreshLiveUrgency, 30_000);

  render();
})();

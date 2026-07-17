const defaults = { pages: [{ id: 'home', name: 'Home', links: [{ id: 'welcome', name: 'Welcome', url: 'https://www.google.com' }] }, { id: 'work', name: 'Work', links: [{ id: 'leetcode', name: 'leetcode.com', url: 'https://leetcode.com' }] }], activePage: 'work', background: { type: 'sky', source: '', overlay: 28 } };
let state;
let deletedPage;
let undoTimer;
const $ = (s) => document.querySelector(s);
const uid = () => crypto.randomUUID();

async function load() {
  const saved = await chrome.storage.local.get('clearspace');
  state = saved.clearspace || structuredClone(defaults);
  if (!Array.isArray(state.pages) || !state.pages.length) state.pages = structuredClone(defaults.pages);
  state.pages = state.pages.map(page => ({ id: page.id || uid(), name: String(page.name || 'New Page').slice(0, 32), links: Array.isArray(page.links) ? page.links.map(link => ({ id: link.id || uid(), name: String(link.name || 'Untitled').slice(0, 48), url: safeUrl(link.url) })).filter(link => link.url) : [] }));
  if (!state.pages.some(page => page.id === state.activePage)) state.activePage = state.pages[0].id;
  state.background = { ...structuredClone(defaults.background), ...(state.background || {}) };
  await save(); render();
}
async function save() { await chrome.storage.local.set({ clearspace: state }); }
function activePage() { return state.pages.find(p => p.id === state.activePage) || state.pages[0]; }
function safeUrl(url) { try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : ''; } catch { return ''; } }
function backgroundUrl(url) {
  const valid = safeUrl(url); if (!valid) return '';
  const parsed = new URL(valid);
  if (parsed.hostname.endsWith('pexels.com') && parsed.pathname.includes('/photo/')) {
    const id = parsed.pathname.match(/(\d+)\/?$/)?.[1];
    if (id) return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=2560`;
  }
  return valid;
}
function favicon(url) { try { return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(new URL(url).origin)}`; } catch { return ''; } }
function render() {
  const page = activePage();
  $('#page-tabs').innerHTML = state.pages.map(p => `<button class="tab ${p.id === page.id ? 'active' : ''}" data-page="${p.id}" title="Double-click to rename"><span class="tab-label">${escapeHtml(p.name)}</span></button>`).join('') + '<button id="new-page" class="new-page" title="Add an empty page" aria-label="Add an empty page">+</button>';
  const links = page.links.map(link => `<div class="bookmark-item"><a class="bookmark" data-id="${link.id}" href="${escapeHtml(link.url)}"><img class="favicon" data-url="${escapeHtml(link.url)}" src="${favicon(link.url)}" alt="" /><span>${escapeHtml(link.name)}</span></a><button class="edit-bookmark" data-edit-id="${link.id}" title="Edit ${escapeHtml(link.name)}" aria-label="Edit ${escapeHtml(link.name)}">✎</button></div>`).join('');
  $('#bookmark-section').innerHTML = `<div class="section-heading"><h1>${escapeHtml(page.name)}</h1><span class="page-actions"><button class="rename-page" title="Rename this page" aria-label="Rename this page">✎</button><button class="delete-page" title="Delete this page" aria-label="Delete this page" ${state.pages.length === 1 ? 'disabled' : ''}>⌫</button></span></div><div class="bookmark-list">${links}</div>${page.links.length ? '<button class="add-bookmark">+ Add bookmark</button>' : '<button class="add-bookmark empty-bookmark" aria-label="Add your first bookmark"><span>+</span>Add your first bookmark</button>'}`;
  document.querySelectorAll('.favicon').forEach(image => image.addEventListener('error', () => {
    if (!image.dataset.triedFallback) {
      image.dataset.triedFallback = 'true';
      try { image.src = `https://icons.duckduckgo.com/ip3/${new URL(image.dataset.url).hostname}.ico`; return; } catch { /* show text fallback below */ }
    }
    const fallback = document.createElement('span'); fallback.className = 'fallback'; fallback.textContent = '↗'; image.replaceWith(fallback);
  }));
  applyBackground();
}
function escapeHtml(value) { const el = document.createElement('span'); el.textContent = value; return el.innerHTML; }
function applyBackground() {
  const bg = state.background; const image = $('#background-image'), video = $('#background-video'); image.hidden = true; video.hidden = true; video.pause();
  const background = document.querySelector('.background'); background.classList.remove('preset-aurora', 'preset-sunset'); if (bg.preset && bg.preset !== 'sky') background.classList.add(`preset-${bg.preset}`);
  document.documentElement.style.setProperty('--overlay', bg.overlay / 100);
  if (bg.type === 'image' || (bg.type === 'upload' && !bg.isVideo)) { image.src = bg.source; image.hidden = !bg.source; }
  if (bg.type === 'video' || (bg.type === 'upload' && bg.isVideo)) { video.src = bg.source; video.hidden = !bg.source; if (bg.source) video.play().catch(() => {}); }
  $('#background-type').value = bg.type; $('#url-wrap').hidden = false; $('#upload-wrap').hidden = bg.type !== 'upload'; $('#background-url').value = bg.type === 'image' || bg.type === 'video' ? bg.source : ''; $('#overlay-range').value = bg.overlay; document.querySelectorAll('.preset').forEach(button => button.classList.toggle('selected', (bg.preset || 'sky') === button.dataset.preset));
}
function showDialog(link) { const page = activePage(); $('#bookmark-title').textContent = link ? 'Edit bookmark' : 'Add bookmark'; $('#bookmark-id').value = link?.id || ''; $('#bookmark-name').value = link?.name || ''; $('#bookmark-url').value = link?.url || ''; $('#delete-bookmark').hidden = !link; $('#bookmark-dialog').showModal(); $('#bookmark-name').focus(); }
function beginTabRename(tab) {
  const label = tab.querySelector('.tab-label'); if (!label) return;
  const original = label.textContent; label.contentEditable = 'true'; label.focus(); document.getSelection().selectAllChildren(label);
  const finish = async (cancel = false) => { const page = state.pages.find(p => p.id === tab.dataset.page); const name = label.textContent.trim().slice(0, 32); if (page && !cancel && name) page.name = name; label.contentEditable = 'false'; await save(); render(); };
  label.addEventListener('blur', () => finish(), { once: true });
  label.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); label.blur(); } if (event.key === 'Escape') { label.textContent = original; finish(true); } });
}

$('#page-tabs').addEventListener('click', async e => {
  if (e.target.closest('#new-page')) { const page = { id: uid(), name: 'New Page', links: [] }; state.pages.push(page); state.activePage = page.id; await save(); render(); beginTabRename(document.querySelector(`.tab[data-page="${page.id}"]`)); return; }
  if (e.target.closest('.tab-label[contenteditable="true"]')) return;
  const tab = e.target.closest('.tab'), id = tab?.dataset.page; if (!id || id === state.activePage) return; state.activePage = id; await save(); render();
});
$('#page-tabs').addEventListener('dblclick', e => {
  const label = e.target.closest('.tab-label'), tab = e.target.closest('.tab'); if (!label || !tab) return;
  e.preventDefault(); e.stopPropagation(); beginTabRename(tab);
});
$('#bookmark-section').addEventListener('click', e => {
  if (e.target.closest('.add-bookmark')) { e.preventDefault(); showDialog(); return; }
  const edit = e.target.closest('.edit-bookmark'); if (edit) { showDialog(activePage().links.find(link => link.id === edit.dataset.editId)); return; }
  const link = e.target.closest('.bookmark'); if (link && e.shiftKey) { e.preventDefault(); showDialog(activePage().links.find(x => x.id === link.dataset.id)); }
});
$('#bookmark-section').addEventListener('click', e => {
  if (!e.target.closest('.rename-page')) return;
  const heading = $('#bookmark-section h1'), original = heading.textContent;
  heading.contentEditable = 'true'; heading.classList.add('page-heading-editing'); heading.focus(); document.getSelection().selectAllChildren(heading);
  const finish = async (cancel = false) => { const name = heading.textContent.trim().slice(0, 32); if (!cancel && name) activePage().name = name; heading.contentEditable = 'false'; heading.classList.remove('page-heading-editing'); await save(); render(); };
  heading.addEventListener('blur', () => finish(), { once:true });
  heading.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); heading.blur(); } if (event.key === 'Escape') { heading.textContent = original; finish(true); } });
});
$('#bookmark-section').addEventListener('click', async e => {
  if (!e.target.closest('.delete-page') || state.pages.length === 1) return;
  const position = state.pages.findIndex(page => page.id === state.activePage);
  deletedPage = { page: state.pages[position], position };
  state.pages.splice(position, 1);
  state.activePage = state.pages[Math.max(0, position - 1)].id;
  await save(); render(); showUndo();
});
$('#edit-page').addEventListener('click', () => alert('Tip: hold Shift while clicking a bookmark to edit it.'));
$('#bookmark-form').addEventListener('submit', async e => { e.preventDefault(); const url = safeUrl($('#bookmark-url').value); if (!url) return $('#bookmark-url').setCustomValidity('Enter a complete URL, including https://'), $('#bookmark-url').reportValidity(); const page = activePage(), id = $('#bookmark-id').value, link = { id: id || uid(), name: $('#bookmark-name').value.trim(), url }; const index = page.links.findIndex(x => x.id === id); index < 0 ? page.links.push(link) : page.links[index] = link; await save(); $('#bookmark-dialog').close(); render(); });
$('#delete-bookmark').addEventListener('click', async () => { const id = $('#bookmark-id').value; activePage().links = activePage().links.filter(x => x.id !== id); await save(); $('#bookmark-dialog').close(); render(); });
$('#search-form').addEventListener('submit', e => { e.preventDefault(); const q = $('#search-input').value.trim(); if (q) location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`; });
$('#open-settings').addEventListener('click', () => { $('#settings').classList.add('open'); $('#settings').setAttribute('aria-hidden','false'); });
document.addEventListener('click', e => { const close = e.target.dataset.close; if (!close) return; if (close === 'settings') { $('#settings').classList.remove('open'); $('#settings').setAttribute('aria-hidden','true'); } else $( '#' + close).close(); });
$('#background-type').addEventListener('change', async e => { const type = e.target.value; state.background = { ...state.background, type, source: '', isVideo: false, preset: 'sky' }; $('#background-feedback').hidden = true; await save(); applyBackground(); });
document.querySelectorAll('.preset').forEach(button => button.addEventListener('click', async () => { state.background = { ...structuredClone(defaults.background), preset: button.dataset.preset }; $('#background-feedback').hidden = true; await save(); applyBackground(); }));
$('#apply-url').addEventListener('click', async () => { const source = backgroundUrl($('#background-url').value); if (!source) return; const selected = $('#background-type').value; const isVideo = selected === 'video' || /\.(mp4|webm|ogg)(?:[?#]|$)/i.test(source); state.background = { ...state.background, type: isVideo ? 'video' : 'image', source, isVideo: false }; $('#background-feedback').hidden = true; await save(); applyBackground(); });
$('#background-upload').addEventListener('change', e => { const file = e.target.files[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) return alert('Please choose a file smaller than 5 MB.'); const reader = new FileReader(); reader.onload = async () => { state.background = { ...state.background, type:'upload', source:reader.result, isVideo:file.type.startsWith('video/'), preset:'sky' }; await save(); applyBackground(); }; reader.readAsDataURL(file); });
$('#overlay-range').addEventListener('input', async e => { state.background.overlay = Number(e.target.value); applyBackground(); await save(); });
$('#reset-background').addEventListener('click', async () => { state.background = structuredClone(defaults.background); await save(); applyBackground(); });
$('#background-image').addEventListener('load', () => { $('#background-feedback').textContent = 'Background applied.'; $('#background-feedback').style.color = '#347b51'; $('#background-feedback').hidden = false; });
$('#background-image').addEventListener('error', async event => {
  const image = event.currentTarget;
  const isCurrentImage = state.background.type === 'image' || (state.background.type === 'upload' && !state.background.isVideo);
  if (!isCurrentImage || !state.background.source || image.src !== state.background.source) return;
  image.hidden = true; image.removeAttribute('src'); state.background = structuredClone(defaults.background); await save(); applyBackground(); $('#background-feedback').textContent = 'That address is not a direct image. Paste an image file URL, a standard Pexels photo link, or upload a file.'; $('#background-feedback').style.color = ''; $('#background-feedback').hidden = false;
});
$('#background-video').addEventListener('loadeddata', () => { $('#background-feedback').textContent = 'Background applied.'; $('#background-feedback').style.color = '#347b51'; $('#background-feedback').hidden = false; });
$('#background-video').addEventListener('error', async event => {
  const video = event.currentTarget;
  const isCurrentVideo = state.background.type === 'video' || (state.background.type === 'upload' && state.background.isVideo);
  if (!isCurrentVideo || !state.background.source || video.src !== state.background.source) return;
  video.hidden = true; video.removeAttribute('src'); state.background = structuredClone(defaults.background); await save(); applyBackground(); $('#background-feedback').textContent = 'That address is not a playable video. Use a direct .mp4/.webm link or upload a video.'; $('#background-feedback').style.color = ''; $('#background-feedback').hidden = false;
});
function showUndo() {
  clearTimeout(undoTimer); const toast = $('#toast'); toast.innerHTML = 'Page deleted. <button id="undo-delete">Undo</button>'; toast.hidden = false;
  undoTimer = setTimeout(() => { toast.hidden = true; deletedPage = undefined; }, 6000);
}
$('#toast').addEventListener('click', async event => {
  if (!event.target.closest('#undo-delete') || !deletedPage) return;
  clearTimeout(undoTimer); state.pages.splice(deletedPage.position, 0, deletedPage.page); state.activePage = deletedPage.page.id; deletedPage = undefined; $('#toast').hidden = true; await save(); render();
});
$('#export-data').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ clearspace: state }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'clearspace-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
$('#import-data').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', event => {
  const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = async () => { try { const backup = JSON.parse(reader.result); if (!backup.clearspace || !Array.isArray(backup.clearspace.pages)) throw new Error(); state = backup.clearspace; await load(); $('#background-feedback').textContent = 'Backup imported.'; $('#background-feedback').style.color = '#347b51'; $('#background-feedback').hidden = false; } catch { $('#background-feedback').textContent = 'This is not a valid Clearspace backup.'; $('#background-feedback').style.color = ''; $('#background-feedback').hidden = false; } }; reader.readAsText(file); event.target.value = '';
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { $('#settings').classList.remove('open'); $('#settings').setAttribute('aria-hidden', 'true'); if ($('#bookmark-dialog').open) $('#bookmark-dialog').close(); } });
load();

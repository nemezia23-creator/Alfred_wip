// File upload — drag-and-drop + file input. Phase 6.
// MIME whitelist + max size guard. Emits FILE_UPLOADED with { file: File, raw }.

import { bus, EVT } from '../core/event-bus.js';
import { getSetting } from '../core/settings.js';
import { toast } from '../ui/toast.js';
import { createLogger } from '../core/logger.js';
import { ALLOWED_MIME, ALLOWED_EXT, inferExt } from './file-schema.js';

const log = createLogger('file-upload');

function maxBytes() {
  const mb = Number(getSetting('files.maxSizeMB') || 20);
  return mb * 1024 * 1024;
}

function accept(file) {
  const ext = inferExt(file.name, file.type);
  if (!ext || !ALLOWED_EXT.includes(ext)) {
    return { ok: false, reason: `Type non supporté: ${file.name}` };
  }
  if (file.size > maxBytes()) {
    return { ok: false, reason: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo > ${getSetting('files.maxSizeMB') || 20} Mo)` };
  }
  return { ok: true, ext };
}

/**
 * Mount drag-and-drop on a zone + bind a file input.
 * onFile(file, ext) is called for each accepted file.
 */
export function mountFileUpload(zone, { onFile } = {}) {
  if (!zone) return () => {};

  // Create hidden input + visible button
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = Object.keys(ALLOWED_MIME).concat(ALLOWED_EXT.map((e) => '.' + e)).join(',');
  input.style.display = 'none';
  zone.appendChild(input);

  function dispatch(files) {
    for (const f of files) {
      const v = accept(f);
      if (!v.ok) { toast(v.reason, { type: 'error', duration: 4000 }); continue; }
      bus.emit(EVT.FILE_UPLOADED, { name: f.name, size: f.size, mime: f.type, ext: v.ext });
      try { onFile?.(f, v.ext); } catch (e) { log.error('onFile handler error', e); }
    }
  }

  input.addEventListener('change', () => {
    if (input.files?.length) dispatch([...input.files]);
    input.value = '';
  });

  let depth = 0;
  function onEnter(e) {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    depth++;
    zone.classList.add('is-dragover');
  }
  function onOver(e) {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function onLeave() { depth = Math.max(0, depth - 1); if (!depth) zone.classList.remove('is-dragover'); }
  function onDrop(e) {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    depth = 0;
    zone.classList.remove('is-dragover');
    dispatch([...e.dataTransfer.files]);
  }

  zone.addEventListener('dragenter', onEnter);
  zone.addEventListener('dragover', onOver);
  zone.addEventListener('dragleave', onLeave);
  zone.addEventListener('drop', onDrop);

  function pick() { input.click(); }

  return { pick, destroy() {
    zone.removeEventListener('dragenter', onEnter);
    zone.removeEventListener('dragover', onOver);
    zone.removeEventListener('dragleave', onLeave);
    zone.removeEventListener('drop', onDrop);
    input.remove();
  }};
}

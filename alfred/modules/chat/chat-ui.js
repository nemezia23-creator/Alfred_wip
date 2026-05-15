// Chat UI — assembles input bar, message list, toolbar.
// Vanilla DOM, no framework. Mounted by app.js after boot.

import {
  loadChat, listMessages, addMessage, updateMessage, deleteMessage,
  truncateAfter, resetChat, buildContext, approxTokens,
} from './chat-manager.js';
import { streamMistral, ChatStreamError } from './chat-stream.js';
import { renderMarkdown, bindCodeCopy } from './chat-renderer.js';
import { copyText, exportChat } from './chat-actions.js';
import { escapeHtml } from '../ui/sanitize.js';
import { toast } from '../ui/toast.js';
import { getSetting, setSetting } from '../core/settings.js';
import { hasApiKey } from '../core/api-bridge.js';
import { bus, EVT } from '../core/event-bus.js';
import { createLogger } from '../core/logger.js';
import { getActiveId, maybeAutoTitle, touchActive } from '../tabs/tab-engine.js';
import { getTab, setTabAgent } from '../tabs/tab-engine.js';
import { getAgent, listAgents, noteAgentUsed } from '../agents/agent-manager.js';
import { buildSystemPrompt } from '../agents/agent-prompt-builder.js';
import { fillAgentSelect, attachMentionDropdown, openAgentManager } from '../agents/agent-ui.js';
import { addMemory, buildMemoryContext, applyMemoryDirectives, MEMORY_TOOLS_INSTRUCTIONS } from '../memory/memory-manager.js';
import { openMemoryManager } from '../memory/memory-ui.js';
import { mountFileUpload } from '../files/file-upload.js';
import { ingestFile } from '../files/file-pipeline.js';
import { applyAgentDirectives, AGENT_TOOLS_INSTRUCTIONS, buildAgentDirectory } from '../agents/agent-tools.js';

const log = createLogger('chat-ui');

const MODELS = [
  'mistral-large-latest',
  'mistral-medium-latest',
  'mistral-small-latest',
];

let root, listEl, inputEl, sendBtn, stopBtn, modelSel, tokenInfo, attachWrap;
let abortCtrl = null;
let streamingMsgId = null;
// Phase 8 — track which chat the current stream belongs to, so switching
// conversations no longer aborts an in-flight response.
let streamingChatId = null;
// Phase 7 — pending file attachments to attach to the next user message
let pendingFiles = [];

export async function mountChat(container) {
  root = container;
  root.innerHTML = `
    <div class="chat-toolbar">
      <select class="chat-model" aria-label="Modèle"></select>
      <select class="chat-agent-select" aria-label="Agent"></select>
      <button class="chat-btn" data-action="manage-agents" type="button" title="Gérer les agents">◈ Agents</button>
      <button class="chat-btn" data-action="manage-memory" type="button" title="Gérer la mémoire">⬡ Mémoire</button>
      <span class="chat-spacer"></span>
      <button class="chat-btn" data-action="export-md" type="button" title="Export markdown">⤓ .md</button>
      <button class="chat-btn" data-action="export-txt" type="button" title="Export texte">⤓ .txt</button>
      <button class="chat-btn chat-btn--danger" data-action="reset" type="button" title="Nouveau chat">⟲ Nouveau</button>
    </div>
    <div class="chat-list" role="log" aria-live="polite" aria-label="Conversation"></div>
    <div class="chat-scroll-actions" aria-hidden="true">
      <button class="chat-scroll-btn" data-action="scroll-top" type="button" title="Aller en haut de la conversation">▲</button>
      <button class="chat-scroll-btn" data-action="scroll-bottom" type="button" title="Aller en bas de la conversation">▼</button>
    </div>
    <div class="chat-input-bar">
      <textarea class="chat-input" rows="1" placeholder="Écrivez à Alfred…  (Entrée pour envoyer · Maj+Entrée pour saut de ligne · glissez un fichier ici)" aria-label="Message"></textarea>
      <div class="chat-attachments" id="chat-attachments" aria-label="Pièces jointes en attente"></div>
      <div class="chat-input-actions">
        <span class="chat-token-info">0 car · ~0 tok</span>
        <button class="chat-btn" data-action="attach" type="button" title="Joindre un fichier (txt/md/csv/json/pdf/docx)">📎</button>
        <button class="chat-btn chat-btn--stop" data-action="stop" type="button" hidden>■ Stop</button>
        <button class="chat-btn chat-btn--send" data-action="send" type="button">Envoyer ▸</button>
      </div>
    </div>
    <div class="chat-file-status" id="chat-file-status" aria-live="polite"></div>
  `;

  listEl = root.querySelector('.chat-list');
  inputEl = root.querySelector('.chat-input');
  sendBtn = root.querySelector('[data-action="send"]');
  stopBtn = root.querySelector('[data-action="stop"]');
  modelSel = root.querySelector('.chat-model');
  tokenInfo = root.querySelector('.chat-token-info');
  attachWrap = root.querySelector('#chat-attachments');
  const agentSel = root.querySelector('.chat-agent-select');

  // Model selector
  for (const m of MODELS) {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    modelSel.appendChild(opt);
  }
  modelSel.value = getSetting('chat.model') || MODELS[0];
  modelSel.addEventListener('change', () => setSetting('chat.model', modelSel.value));

  // Agent selector (per-tab)
  function refreshAgentSel() {
    const tab = getTab(getActiveId());
    fillAgentSelect(agentSel, tab?.agentId || '');
  }
  refreshAgentSel();
  agentSel.addEventListener('change', async () => {
    await setTabAgent(getActiveId(), agentSel.value || null);
  });
  bus.on('agents:changed', refreshAgentSel);
  bus.on(EVT.TAB_SWITCHED, refreshAgentSel);
  bus.on(EVT.TAB_UPDATED, refreshAgentSel);

  root.querySelector('[data-action="manage-agents"]').addEventListener('click', () => openAgentManager());
  root.querySelector('[data-action="manage-memory"]').addEventListener('click', () => openMemoryManager());

  // Toolbar actions
  root.querySelector('[data-action="export-md"]').addEventListener('click', () => exportChat('md'));
  root.querySelector('[data-action="export-txt"]').addEventListener('click', () => exportChat('txt'));
  root.querySelector('[data-action="reset"]').addEventListener('click', async () => {
    if (!confirm('Effacer toute la conversation ?')) return;
    await resetChat();
    rerender();
  });

  // Input
  inputEl.addEventListener('input', () => {
    autoResize();
    const len = inputEl.value.length;
    tokenInfo.textContent = `${len} car · ~${approxTokens(inputEl.value)} tok`;
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  sendBtn.addEventListener('click', send);
  stopBtn.addEventListener('click', () => abortCtrl?.abort());

  // Phase 6/7 — file upload (drag-drop on input bar + 📎 button)
  const inputBar = root.querySelector('.chat-input-bar');
  const fileStatus = root.querySelector('#chat-file-status');
  function setFileStatus(msg, state = 'info') {
    if (!fileStatus) return;
    fileStatus.textContent = msg || '';
    fileStatus.dataset.state = state;
  }
  const uploader = mountFileUpload(inputBar, {
    onFile: async (f) => {
      // Phase 7 — by default, attach to the chat instead of auto-ingesting.
      if (getSetting('files.attachToChat') !== false) {
        pendingFiles.push(f);
        renderAttachments();
        setFileStatus(`📎 ${f.name} joint au message — cliquez « Envoyer » ou « Mémoriser ».`);
        setTimeout(() => setFileStatus(''), 3500);
        return;
      }
      try {
        await ingestFile(f, { onStatus: (m) => setFileStatus(m) });
        setFileStatus(`✓ ${f.name} ingéré.`, 'ok');
        setTimeout(() => setFileStatus(''), 4000);
      } catch {
        setFileStatus(`✗ échec ${f.name}`, 'error');
      }
    },
  });
  root.querySelector('[data-action="attach"]').addEventListener('click', () => uploader.pick?.());
  attachWrap.addEventListener('click', onAttachClick);

  // Phase 8 — scroll up/down floating buttons
  root.querySelector('[data-action="scroll-top"]').addEventListener('click', () => {
    listEl.scrollTo({ top: 0, behavior: 'smooth' });
  });
  root.querySelector('[data-action="scroll-bottom"]').addEventListener('click', () => {
    listEl.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' });
  });

  // @ mention dropdown
  attachMentionDropdown(inputEl, async (agent) => {
    await setTabAgent(getActiveId(), agent.id);
    refreshAgentSel();
  });

  // Delegated message actions
  listEl.addEventListener('click', onListClick);

  await loadChat(getActiveId());
  rerender();
  inputEl.focus();

  // React to tab switching / closing → reload current chat
  // Phase 8 fix : NE PLUS interrompre une réponse en cours quand on change
  // d'onglet. La réponse continue en arrière-plan ; updateMessage écrit dans
  // le bon chatId via le placeholder déjà persisté.
  bus.on(EVT.TAB_SWITCHED, async () => {
    await loadChat(getActiveId());
    rerender();
  });
  bus.on(EVT.TAB_CLOSED, async (payload) => {
    // Si l'onglet fermé est celui en train de streamer, on annule pour
    // éviter d'écrire dans une conversation supprimée.
    if (payload?.id && payload.id === streamingChatId && abortCtrl) abortCtrl.abort();
    await loadChat(getActiveId());
    rerender();
  });
}

function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 240) + 'px';
}

function fmtSize(n) {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

function renderAttachments() {
  if (!attachWrap) return;
  attachWrap.innerHTML = pendingFiles.map((f, i) => `
    <span class="chat-attach" data-i="${i}">
      <span class="chat-attach__name" title="${escapeHtml(f.name)}">📎 ${escapeHtml(f.name)}</span>
      <span class="chat-attach__size">${fmtSize(f.size)}</span>
      <button type="button" class="chat-attach__btn chat-attach__btn--mem" data-attach-action="memorize" title="Mémoriser ce fichier (extraction + résumé via API)">✦ Mémoriser</button>
      <button type="button" class="chat-attach__btn chat-attach__btn--del" data-attach-action="remove" title="Retirer">✕</button>
    </span>
  `).join('');
}

async function onAttachClick(e) {
  const btn = e.target.closest('[data-attach-action]');
  if (!btn) return;
  const span = btn.closest('[data-i]');
  const i = Number(span?.dataset.i);
  if (Number.isNaN(i) || !pendingFiles[i]) return;
  const action = btn.dataset.attachAction;
  if (action === 'remove') {
    pendingFiles.splice(i, 1);
    renderAttachments();
    return;
  }
  if (action === 'memorize') {
    const f = pendingFiles[i];
    const fileStatus = root.querySelector('#chat-file-status');
    btn.disabled = true;
    try {
      // Phase 8 fix : si pas de clé API, on stocke quand même une mémoire à
      // partir du texte extrait. L'ancien chemin "ingestFile" silenciait
      // l'échec quand `summarizeFile` n'avait pas de clé.
      if (!hasApiKey('mistral')) {
        if (fileStatus) fileStatus.textContent = `📥 ${f.name} : extraction…`;
        const { parseFile } = await import('../files/file-parser.js');
        const { text: extracted, ext } = await parseFile(f);
        const snippet = extracted.length > 8000 ? extracted.slice(0, 8000) + `\n…(+${extracted.length - 8000} car tronqués)` : extracted;
        await addMemory({
          content: `[${f.name}]\n${snippet}`,
          source: 'file', type: 'document', owner: 'global',
          confidence: 0.7, tags: ['file', ext || 'doc'],
        });
        toast(`✓ ${f.name} mémorisé (sans résumé · pas de clé API).`, { type: 'success' });
      } else {
        const rec = await ingestFile(f, { onStatus: (m) => { if (fileStatus) fileStatus.textContent = m; } });
        if (!rec.memoryIds || rec.memoryIds.length === 0) {
          // Garde-fou : aucune mémoire créée par le pipeline → on en crée une basique.
          const { parseFile } = await import('../files/file-parser.js');
          const { text: extracted, ext } = await parseFile(f);
          const snippet = extracted.length > 8000 ? extracted.slice(0, 8000) + '…' : extracted;
          await addMemory({
            content: `[${f.name}]\n${snippet}`,
            source: 'file', type: 'document', owner: 'global',
            confidence: 0.6, tags: ['file', ext || 'doc'],
          });
        }
      }
      pendingFiles.splice(i, 1);
      renderAttachments();
      if (fileStatus) { fileStatus.textContent = `✓ ${f.name} mémorisé.`; setTimeout(() => fileStatus.textContent = '', 4000); }
    } catch (err) {
      btn.disabled = false;
      toast(`Échec : ${err.message}`, { type: 'error' });
      if (fileStatus) fileStatus.textContent = `✗ échec ${f.name} : ${err.message}`;
    }
  }
}

function rerender() {
  const msgs = listMessages();
  if (msgs.length === 0) {
    listEl.innerHTML = `<div class="chat-empty">Conversation vide. Posez une question pour commencer.</div>`;
    return;
  }
  listEl.innerHTML = msgs.map(renderMsg).join('');
  listEl.querySelectorAll('.chat-msg-body').forEach((el) => bindCodeCopy(el));
  scrollToBottom();
}

function renderMsg(m) {
  const role = m.role;
  const label = role === 'user' ? 'Vous' : role === 'assistant' ? 'Alfred' : role;
  const stars = renderStars(m.rating || 0, m.id);
  const body = role === 'assistant' ? renderMarkdown(m.content) : `<p class="md-p">${escapeHtml(m.content).replace(/\\n/g, '<br>')}</p>`;
  const editable = role === 'user';
  return `
    <article class="chat-msg chat-msg--${role}" data-id="${m.id}">
      <header class="chat-msg-head">
        <span class="chat-msg-role">${label}</span>
        <span class="chat-msg-meta">${new Date(m.ts).toLocaleTimeString()}${m.model ? ' · ' + escapeHtml(m.model) : ''}</span>
      </header>
      <div class="chat-msg-body">${body}${renderMsgFiles(m)}</div>
      <footer class="chat-msg-actions">
        <button class="chat-msg-btn" data-msg-action="copy" title="Copier">⧉</button>
        ${editable ? '<button class="chat-msg-btn" data-msg-action="edit" title="Éditer">✎</button>' : ''}
        ${role === 'assistant' ? '<button class="chat-msg-btn" data-msg-action="regen" title="Regénérer">↻</button>' : ''}
        <button class="chat-msg-btn" data-msg-action="memorize" title="Mémoriser">⬡</button>
        <button class="chat-msg-btn" data-msg-action="del" title="Supprimer">✕</button>
        <span class="chat-msg-stars">${stars}</span>
      </footer>
    </article>
  `;
}

function renderStars(rating, id) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<button class="chat-star ${i <= rating ? 'on' : ''}" data-msg-action="rate" data-rate="${i}" aria-label="Note ${i}">★</button>`;
  }
  return html;
}

function renderMsgFiles(m) {
  if (!m.files || !m.files.length) return '';
  return `<div class="chat-msg-files">${m.files.map((f) => `
    <span class="chat-attach"><span class="chat-attach__name">📎 ${escapeHtml(f.name)}</span><span class="chat-attach__size">${fmtSize(f.size || 0)}</span></span>
  `).join('')}</div>`;
}

function scrollToBottom() {
  const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120;
  if (nearBottom) listEl.scrollTop = listEl.scrollHeight;
}

async function onListClick(e) {
  const btn = e.target.closest('[data-msg-action]');
  if (!btn) return;
  const article = btn.closest('.chat-msg');
  const id = article?.dataset.id;
  if (!id) return;
  const action = btn.dataset.msgAction;
  const msg = listMessages().find((m) => m.id === id);
  if (!msg) return;

  switch (action) {
    case 'copy':
      if (await copyText(msg.content)) toast('Copié.', { type: 'success', duration: 1500 });
      break;
    case 'del':
      if (confirm('Supprimer ce message ?')) { await deleteMessage(id); rerender(); }
      break;
    case 'memorize': {
      const tab = getTab(getActiveId());
      const owner = tab?.agentId || 'global';
      const tags = tab?.agentId ? (getAgent(tab.agentId)?.tags || []) : [];
      try {
        const m = await addMemory({
          content: msg.content,
          source: 'conversation',
          type: msg.role === 'assistant' ? 'summary' : 'fact',
          owner,
          confidence: msg.role === 'assistant' ? 0.5 : 1,
          tags,
        });
        toast(`Mémorisé (${m.type}).`, { type: 'success', duration: 2000 });
      } catch (err) {
        toast(`Échec mémorisation : ${err.message}`, { type: 'error' });
      }
      break;
    }
    case 'rate': {
      const r = Number(btn.dataset.rate) || 0;
      await updateMessage(id, { rating: msg.rating === r ? 0 : r });
      rerender();
      break;
    }
    case 'edit': {
      const next = prompt('Éditer le message (la suite de la conversation sera supprimée) :', msg.content);
      if (next === null || next.trim() === '' || next === msg.content) return;
      await updateMessage(id, { content: next });
      await truncateAfter(id);
      rerender();
      await runAssistant();
      break;
    }
    case 'regen': {
      // Find the user message just before this assistant message
      const msgs = listMessages();
      const idx = msgs.findIndex((m) => m.id === id);
      if (idx <= 0) return;
      // Truncate from this assistant message onwards
      await deleteMessage(id);
      // delete subsequent
      for (const m of msgs.slice(idx + 1)) await deleteMessage(m.id);
      rerender();
      await runAssistant();
      break;
    }
  }
}

async function send() {
  const text = inputEl.value.trim();
  // Phase 8.1 — comportement fichier joint :
  //  - texte vide + aucun fichier → no-op
  //  - texte vide + fichier(s) joint(s) → on poste le(s) fichier(s) dans la
  //    conversation (référencés + contenu inliné dans le message), MAIS on
  //    NE déclenche PAS la réponse de l'agent. L'utilisateur doit envoyer
  //    un prompt textuel ensuite pour obtenir une réponse.
  //  - texte non vide → comportement standard, fichiers inlinés + appel API.
  if (abortCtrl) return;
  if (!text && pendingFiles.length === 0) return;
  const fileOnly = !text && pendingFiles.length > 0;
  if (!fileOnly && !hasApiKey('mistral')) {
    toast('Configurez votre clé Mistral via ⚙ Réglages.', { type: 'error' });
    return;
  }
  // Inline pending files into the user message (parsed text)
  let composed = text;
  let attachedMeta = [];
  if (pendingFiles.length) {
    const { parseFile } = await import('../files/file-parser.js');
    for (const f of pendingFiles) {
      try {
        const { text: extracted, ext } = await parseFile(f);
        const snippet = extracted.length > 8000 ? extracted.slice(0, 8000) + `\n…(+${extracted.length - 8000} car tronqués)` : extracted;
        composed += `\n\n--- Fichier joint : ${f.name} (${ext}, ${fmtSize(f.size)}) ---\n${snippet}\n--- fin du fichier ---`;
        attachedMeta.push({ name: f.name, size: f.size, ext });
      } catch (e) {
        toast(`Lecture impossible : ${f.name} (${e.message})`, { type: 'error' });
      }
    }
    pendingFiles = [];
    renderAttachments();
  }
  if (!composed.trim()) return;
  const activeId = getActiveId();
  const isFirst = listMessages().filter((m) => m.role === 'user').length === 0;
  await addMessage({ role: 'user', content: composed, files: attachedMeta.length ? attachedMeta : undefined });
  if (isFirst) await maybeAutoTitle(activeId, text || attachedMeta[0]?.name || 'fichier');
  await touchActive();
  inputEl.value = '';
  autoResize();
  tokenInfo.textContent = '0 car · ~0 tok';
  rerender();
  if (fileOnly) {
    // Fichier déposé seul : on l'expose dans la conversation, mais l'agent
    // ne répond que lorsqu'un prompt textuel suit.
    toast('Fichier ajouté à la conversation. Écrivez une consigne pour obtenir une réponse.', { type: 'info', duration: 3500 });
    return;
  }
  await runAssistant(activeId);
}

async function runAssistant(originChatId = getActiveId()) {
  abortCtrl = new AbortController();
  streamingChatId = originChatId;
  setStreaming(true);

  const tab = getTab(originChatId);
  const agent = tab?.agentId ? getAgent(tab.agentId) : null;
  const sysExtra = (getSetting('chat.system_prompt') || '').trim();

  // Phase 5 : injection mémoire (si activée — défaut: oui)
  const memInjectEnabled = getSetting('memory.inject') !== false;
  const lastUser = [...listMessages()].reverse().find((m) => m.role === 'user');
  const memCtx = memInjectEnabled
    ? buildMemoryContext({ agent, query: lastUser?.content || '' })
    : { items: [], block: '' };
  // Phase 6 : outils d'écriture mémoire pour les agents (création/édition/suppression)
  const memToolsEnabled = getSetting('memory.tools') !== false;
  const toolsBlock = memToolsEnabled ? MEMORY_TOOLS_INSTRUCTIONS : '';
  // Phase 7 : outils de gestion d'agents (création/édition/archivage)
  const agentToolsEnabled = getSetting('agents.tools') !== false;
  const agentBlock = agentToolsEnabled ? `${buildAgentDirectory()}\n\n${AGENT_TOOLS_INSTRUCTIONS}`.trim() : '';
  const sysExtraFull = [sysExtra, memCtx.block, toolsBlock, agentBlock].filter(Boolean).join('\n\n');

  const sysPrompt = buildSystemPrompt(agent, { extraSystem: sysExtraFull });
  const model = (agent?.modelPref) || modelSel.value;
  const temperature = agent ? Number(agent.temperature) : (Number(getSetting('chat.temperature')) || 0.7);
  const maxTokens = agent ? Number(agent.maxTokens) : undefined;

  // Insert placeholder assistant message — épinglé sur l'onglet d'origine
  const placeholder = await addMessage({ role: 'assistant', content: '', model, agentId: agent?.id || null, chatId: originChatId });
  streamingMsgId = placeholder.id;
  rerender();
  if (memCtx.items.length) log.info(`memory injected: ${memCtx.items.length} item(s)`);

  try {
    const baseMsgs = buildContext().filter((m) => m.content !== '' || m.role === 'system');
    // Replace any leading system from buildContext with agent-built system
    const withoutSys = baseMsgs.filter((m) => m.role !== 'system');
    const finalMsgs = sysPrompt ? [{ role: 'system', content: sysPrompt }, ...withoutSys] : withoutSys;

    const result = await streamMistral({
      model,
      messages: finalMsgs,
      temperature,
      maxTokens,
      signal: abortCtrl.signal,
      onDelta: (_chunk, full) => {
        // Live-update placeholder DOM SEULEMENT si on est encore sur l'onglet d'origine
        if (originChatId === getActiveId()) {
          const article = listEl.querySelector(`[data-id="${streamingMsgId}"] .chat-msg-body`);
          if (article) {
            article.innerHTML = renderMarkdown(full);
            bindCodeCopy(article);
            scrollToBottom();
          }
        }
        bus.emit(EVT.CHAT_STREAMING, { id: streamingMsgId, full });
      },
    });
    // Apply memory write directives emitted by the agent (create/update/delete).
    let finalContent = result.content;
    try {
      const { cleanedContent, results: memResults } = await applyMemoryDirectives(finalContent);
      finalContent = cleanedContent;
      if (memResults.length) {
        const ok = memResults.filter((r) => r.ok).length;
        const ko = memResults.length - ok;
        if (ok) toast(`Mémoire : ${ok} opération(s) appliquée(s)${ko ? ` · ${ko} échec(s)` : ''}.`, { type: ko ? 'info' : 'success', duration: 2500 });
        else if (ko) toast(`Mémoire : ${ko} échec(s).`, { type: 'error' });
        log.info(`memory directives applied: ${ok} ok, ${ko} ko`);
      }
    } catch (e) {
      log.warn('memory directives error', e.message);
    }
    // Phase 7 — apply agent management directives (create/update/archive/delete).
    try {
      const { cleanedContent, results: agentResults } = await applyAgentDirectives(finalContent);
      finalContent = cleanedContent;
      if (agentResults.length) {
        const ok = agentResults.filter((r) => r.ok).length;
        const ko = agentResults.length - ok;
        if (ok) toast(`Agents : ${ok} opération(s) appliquée(s)${ko ? ` · ${ko} échec(s)` : ''}.`, { type: ko ? 'info' : 'success', duration: 2500 });
        else if (ko) toast(`Agents : ${ko} échec(s).`, { type: 'error' });
        log.info(`agent directives applied: ${ok} ok, ${ko} ko`);
      }
    } catch (e) {
      log.warn('agent directives error', e.message);
    }
    await updateMessage(streamingMsgId, {
      content: finalContent,
      tokens: result.usage ? { in: result.usage.prompt_tokens, out: result.usage.completion_tokens } : undefined,
    });
    if (agent) await noteAgentUsed(agent.id);
  } catch (err) {
    if (err.name === 'AbortError') {
      toast('Génération interrompue.', { type: 'info', duration: 2000 });
      // keep partial content already saved via onDelta — persist what we have in DOM
      const article = listEl.querySelector(`[data-id="${streamingMsgId}"] .chat-msg-body`);
      const partial = article?.innerText || '';
      await updateMessage(streamingMsgId, { content: partial + '\n\n_[interrompu]_' });
    } else {
      const msg = err instanceof ChatStreamError ? err.message : `Erreur: ${err.message}`;
      toast(msg, { type: 'error', duration: 6000 });
      await updateMessage(streamingMsgId, { content: `⚠ ${msg}` });
      bus.emit(EVT.CHAT_ERROR, err);
      log.error('stream failed', err);
    }
  } finally {
    abortCtrl = null;
    streamingMsgId = null;
    const wasActive = (streamingChatId === getActiveId());
    streamingChatId = null;
    setStreaming(false);
    if (wasActive) rerender();
  }
}

function setStreaming(on) {
  sendBtn.disabled = on;
  stopBtn.hidden = !on;
  inputEl.disabled = on;
}

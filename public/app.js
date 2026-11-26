const $ = selector => document.querySelector(selector);
const state = { user: null, checked: new Set(), provisional: false, admin: false, accountAuthenticated: false, accountEditor: false, editor: false, openStep: null, pendingStep: null, saving: false, editingSectionId: null, manualVersion: 0, stepDraft: null, stepDraftIndex: 0, stepPhotoBusy: false, coverSectionId: null, coverBusy: false, detailEditIndex: null, detailPhotoTarget: null, detailBusy: false };
let sections = [];
let guides = {};
let userChoices = [];
let steps = sections.flatMap(section => section.steps);
let totalItems = steps.reduce((sum, step) => sum + step.items.length, 0);
let stepMeta = new Map(sections.flatMap(section => section.steps.map((step, index) => [step.id, { step, section, index }])));
let publishedVideos = new Map();
let navDrag = null;
let navReorderBusy = false;
const itemKey = (stepId, index) => `${stepId}:${index}`;
const progressIndex = (step, index) => step.progressIndices?.[index] ?? index;
// Keep checklist progress tied to its original saved item when steps are combined or reordered.
const progressRef = (step, index) => step.progressRefs?.[index] ?? [step.id, progressIndex(step, index)];
const checkedCount = step => step.items.filter((_, index) => state.checked.has(itemKey(...progressRef(step, index)))).length;
const isComplete = step => step.items.length > 0 && checkedCount(step) === step.items.length;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const sectionImages = section => Array.isArray(section.covers) ? section.covers : section.cover ? [section.cover] : [];
const MAX_IMAGE_BYTES = 8_000_000;
// Local layout trial only. No video is registered in the manual database.
const localVideoPreviewId = location.hostname === "127.0.0.1" || location.hostname === "localhost" ? "djwp3DyxSOw" : null;

function renderLocalVideoPreview() {
  if (!localVideoPreviewId) return;
  let preview = $("#localVideoPreview");
  if (!preview) {
    preview = document.createElement("section");
    preview.id = "localVideoPreview";
    preview.className = "local-video-preview";
    preview.innerHTML = '<div class="local-video-preview-heading"><strong>作業動画</strong><span>配置確認用のサンプル動画</span></div><div class="local-video-preview-player"><iframe title="配置確認用のYouTube動画" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe></div><a target="_blank" rel="noopener noreferrer">YouTubeで開く ↗</a>';
    $("#dialogDescription").after(preview);
  }
  const frame = preview.querySelector("iframe");
  const visible = !!localVideoPreviewId && state.openStep === "plate-center";
  preview.hidden = !visible;
  if (!visible) {
    frame.removeAttribute("src");
    return;
  }
  const src = `https://www.youtube-nocookie.com/embed/${localVideoPreviewId}`;
  if (frame.getAttribute("src") !== src) frame.src = src;
  preview.querySelector("a").href = `https://youtu.be/${localVideoPreviewId}`;
}

function decorateLockedImages(root) {
  if (!state.provisional) return;
  for (const img of root.querySelectorAll('img[src="/manual-locked.svg"]')) {
    const frame = img.closest(".needed-image, .step-card-photo, .dialog-photo, .detail-inline-photo");
    if (!frame || frame.querySelector(".approval-image-button")) continue;
    frame.classList.add("approval-image-frame");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "approval-image-button";
    button.dataset.approvalInfo = "";
    button.textContent = "管理者承認後に閲覧可能";
    frame.append(button);
  }
}

async function openApprovalDialog() {
  let dialog = $("#approvalDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "approvalDialog";
    dialog.className = "approval-dialog";
    dialog.innerHTML = '<button type="button" class="approval-close" aria-label="閉じる">×</button><span class="approval-eyebrow">ACCOUNT APPROVAL</span><h2>画像の閲覧について</h2><p>画像を閲覧するには、下記の管理者アカウントに連絡し、承認操作を行ってもらってください。</p><div class="approval-contacts" role="status">管理者の連絡先を確認しています…</div><button type="button" class="approval-done">閉じる</button>';
    document.body.append(dialog);
    dialog.querySelectorAll(".approval-close, .approval-done").forEach(button => button.addEventListener("click", () => dialog.close()));
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  }
  dialog.showModal();
  const contacts = dialog.querySelector(".approval-contacts");
  contacts.textContent = "管理者の連絡先を確認しています…";
  try {
    const { admins } = await api("/api/admin/contacts");
    if (!dialog.open) return;
    contacts.replaceChildren();
    if (!admins.length) { contacts.textContent = "管理者が登録されていません。職場の担当者へ連絡してください。"; return; }
    for (const admin of admins) {
      const row = document.createElement("div");
      row.className = "approval-contact";
      const name = document.createElement("strong");
      name.textContent = admin.name;
      const email = document.createElement("a");
      email.href = `mailto:${encodeURIComponent(admin.email)}`;
      email.textContent = admin.email;
      row.append(name, email);
      contacts.append(row);
    }
  } catch { contacts.textContent = "連絡先を取得できませんでした。時間をおいて再度お試しください。"; }
}

document.addEventListener("click", event => {
  if (!event.target.closest("[data-approval-info]")) return;
  event.preventDefault();
  event.stopPropagation();
  openApprovalDialog();
}, true);

function setManual(nextSections, version) {
  sections = nextSections;
  state.manualVersion = version;
  steps = sections.flatMap(section => section.steps);
  totalItems = steps.reduce((sum, step) => sum + step.items.length, 0);
  stepMeta = new Map(sections.flatMap(section => section.steps.map((step, index) => [step.id, { step, section, index }])));
  renderNav();
  renderSections();
  renderProgress();
}

async function saveManual(nextSections) {
  const result = await api("/api/manual", { method: "PUT", body: JSON.stringify({ sections: nextSections, version: state.manualVersion }) });
  setManual(result.sections, result.version);
  toast("マニュアルを保存しました");
}

async function api(path, options) {
  let response;
  try { response = await fetch(path, { ...options, signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json", ...options?.headers } }); }
  catch (error) { throw new Error(error?.name === "TimeoutError" ? "通信が時間内に完了しませんでした。画面を更新して結果を確認してください。" : "サーバーに接続できませんでした。通信状態を確認して、もう一度お試しください。"); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `処理に失敗しました（HTTP ${response.status}）。少し待ってから再試行してください。`);
  return result;
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message || /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message)) return "通信に失敗しました。インターネット接続を確認して、もう一度お試しください。";
  if (/Unexpected token|JSON\.parse|not valid JSON/i.test(message)) return "サーバーから正しい応答を受け取れませんでした。少し待ってから再試行してください。";
  return message;
}

function toast(message, error = false) {
  const element = $("#toast");
  element.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  element.append(text);
  element.classList.toggle("error", error);
  element.setAttribute("role", error ? "alert" : "status");
  if (error) {
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "エラー表示を閉じる");
    close.addEventListener("click", () => element.classList.remove("show"));
    element.append(close);
  }
  element.classList.add("show");
  clearTimeout(toast.timer);
  if (!error) toast.timer = setTimeout(() => element.classList.remove("show"), 3000);
}

function showError(error, photo = false) {
  const message = friendlyError(error);
  toast(message, true);
  const inline = $("#dialogUploadError");
  if (photo && $("#checkDialog").open) {
    inline.textContent = message;
    inline.hidden = false;
  }
  return message;
}

function clearUploadError() {
  const inline = $("#dialogUploadError");
  inline.textContent = "";
  inline.hidden = true;
  $("#saveState").classList.remove("save-error");
}

function renderNav() {
  const nav = $("#sectionNav");
  const activeId = nav.querySelector(".nav-link.active")?.dataset.nav || state.editingSectionId || sections[0]?.id;
  nav.replaceChildren();
  for (const section of sections) {
    const row = document.createElement("div");
    row.className = "nav-row";
    row.dataset.sectionId = section.id;
    const a = document.createElement("a");
    a.href = `#${section.id}`;
    a.className = `nav-link${section.id === activeId ? " active" : ""}`;
    a.dataset.nav = section.id;
    a.innerHTML = `<span class="nav-num">${escapeHtml(section.number)}</span><span class="nav-title">${escapeHtml(section.title)}</span><span class="nav-badge" data-nav-count="${escapeHtml(section.id)}"></span>`;
    row.append(a);
    if (state.editor) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "nav-drag-handle";
      handle.dataset.dragSection = section.id;
      handle.setAttribute("aria-label", `${section.title}の順番を変更。ドラッグまたは上下キーで移動`);
      handle.setAttribute("title", "ドラッグして順番を変更");
      handle.innerHTML = `<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>`;
      row.append(handle);
    }
    nav.append(row);
  }
  const videoLink = document.createElement("a");
  videoLink.href = "/manual/videos";
  videoLink.target = "_top";
  videoLink.className = "nav-link video-library-nav";
  videoLink.innerHTML = '<span class="nav-title">▶ 動画マニュアル一覧</span>';
  nav.append(videoLink);
  if (!nav.querySelector(".nav-link.active")) nav.querySelector("a")?.classList.add("active");
}

function renderSections() {
  const container = $("#sections");
  container.replaceChildren();
  for (const section of sections) {
    const block = document.createElement("section");
    const editing = state.editor && state.editingSectionId === section.id;
    block.className = `process-section${section.id === "plate" ? " process-section--plate" : ""}${editing ? " editing" : ""}`;
    block.id = section.id;
    const images = sectionImages(section);
    const cover = images.length || editing ? `<div class="needed-items"><div class="needed-items-header"><h4>必要なもの</h4>${editing ? `<button type="button" class="cover-edit-button" data-cover="${section.id}">＋ 画像を追加</button>` : ""}</div>${images.length ? `<div class="needed-items-grid${images.length === 1 ? " single" : ""}">${images.map((image, index) => `<div class="needed-image"><img src="${escapeHtml(image)}" alt="${escapeHtml(section.title)}に必要なもの ${index + 1}" loading="lazy">${editing ? `<div class="needed-image-actions"><label>差し替え<input type="file" accept="image/jpeg,image/png,image/webp" data-replace-cover="${section.id}" data-cover-index="${index}" aria-label="画像 ${index + 1} を差し替え"></label><button type="button" data-delete-cover="${section.id}" data-cover-index="${index}" aria-label="画像 ${index + 1} を削除">削除</button></div>` : ""}</div>`).join("")}</div>` : `<p class="needed-items-empty">画像はまだありません</p>`}${editing ? `<button type="button" class="needed-dropzone" data-cover="${section.id}">画像をここにドラッグ＆ドロップ、またはクリックして追加</button><p class="needed-upload-status" data-cover-status="${section.id}" role="status"></p>` : ""}</div>` : "";
    const caution = section.caution ? `<div class="process-caution"><strong>注意点</strong><p>${escapeHtml(section.caution)}</p></div>` : "";
    block.innerHTML = `${cover}<div class="process-heading"><div class="process-icon" aria-hidden="true">${section.icon === "pen" ? "✎" : section.icon === "layers" ? "▧" : "✳"}</div><div class="process-heading-copy"><span>STEP ${section.number}</span><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.subtitle)}</p></div>${caution}<div class="process-heading-actions">${state.editor ? `<button type="button" class="section-edit-button${editing ? " active" : ""}" data-edit-section="${section.id}">${editing ? "編集を終了" : "編集する"}</button>` : ""}<span class="section-progress" data-section-count="${section.id}"></span></div></div><div class="step-grid"></div>`;
    const grid = block.querySelector(".step-grid");
    const addButton = index => {
      const controls = document.createElement("div");
      controls.className = "editor-insert-controls";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editor-add-button";
      button.dataset.addStep = section.id;
      button.dataset.insertIndex = String(index);
      button.textContent = "+";
      button.setAttribute("aria-label", `${section.title}の${index + 1}番目に工程を追加`);
      controls.append(button);
      grid.append(controls);
    };
    for (const [index, step] of section.steps.entries()) {
      if (editing) addButton(index);
      const card = document.createElement("div");
      card.className = `step-card${step.image ? " has-photo" : ""}`;
      card.dataset.stepCard = step.id;
      card.innerHTML = `<button type="button" class="step-main" data-step="${step.id}" aria-label="${escapeHtml(step.title)}のスキルチェックを開く"><span class="step-index">${String(index + 1).padStart(2, "0")}</span><span class="step-text"><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.description)}</small></span><span class="step-check" aria-hidden="true"></span></button>${editing ? `<button type="button" class="step-edit-action" data-edit-step="${step.id}" aria-label="${escapeHtml(step.title)}を編集"><img src="/edit-icon.svg" alt=""></button><button type="button" class="step-delete-action" data-delete-step="${step.id}" aria-label="${escapeHtml(step.title)}を削除"><img src="/trash-icon.svg" alt=""></button>` : `<button type="button" class="step-help" data-help="${step.id}" aria-label="${escapeHtml(step.title)}の詳しいマニュアルを開く" title="詳しいマニュアル"><img src="/help-icon.svg" alt="" aria-hidden="true"></button>`}${step.image ? `<div class="step-card-photo" data-photo-drop="${step.id}"><img src="${escapeHtml(step.image)}" alt="${escapeHtml(step.imageAlt || `${step.title}の参考写真`)}" loading="lazy">${editing ? `<div class="step-card-photo-actions"><label>差し替え<input type="file" accept="image/jpeg,image/png,image/webp" data-step-photo="${step.id}" aria-label="${escapeHtml(step.title)}の写真を差し替え"></label><button type="button" data-remove-step-photo="${step.id}" aria-label="${escapeHtml(step.title)}の写真を削除">削除</button></div>` : ""}</div>` : ""}`;
      if (editing) {
        const camera = document.createElement("label");
        camera.className = "editor-step-photo-button";
        camera.dataset.photoDrop = step.id;
        camera.title = `${step.title}の写真を${step.image ? "差し替え" : "追加"}`;
        camera.innerHTML = `<img src="/camera-icon.svg" alt=""><input type="file" accept="image/jpeg,image/png,image/webp" data-step-photo="${step.id}" aria-label="${escapeHtml(step.title)}の写真を${step.image ? "差し替え" : "追加"}">`;
        card.prepend(camera);
      }
      grid.append(card);
    }
    if (editing) addButton(section.steps.length);
    container.append(block);
  }
  decorateLockedImages(container);
}

function renderProgress() {
  const completeSteps = steps.filter(isComplete).length;
  const completeItems = steps.reduce((sum, step) => sum + checkedCount(step), 0);
  const percent = steps.length ? Math.round(completeSteps / steps.length * 100) : 0;
  $("#progressPercent").innerHTML = `${percent}<span>%</span>`;
  $("#progressFill").style.width = `${percent}%`;
  $("#completedSteps").innerHTML = `${completeSteps} <small>/ ${steps.length}</small>`;
  $("#completedItems").innerHTML = `${completeItems} <small>/ ${totalItems}</small>`;
  for (const section of sections) {
    const count = section.steps.filter(isComplete).length;
    $(`[data-section-count="${section.id}"]`).textContent = `${count} / ${section.steps.length} 完了`;
    $(`[data-nav-count="${section.id}"]`).textContent = `${count}/${section.steps.length}`;
    for (const step of section.steps) {
      const button = $(`[data-step="${step.id}"]`);
      $(`[data-step-card="${step.id}"]`).classList.toggle("complete", isComplete(step));
      button.querySelector(".step-check").textContent = isComplete(step) ? "✓" : "";
      button.setAttribute("aria-label", `${step.title}、${checkedCount(step)}/${step.items.length}完了。スキルチェックを開く`);
    }
  }
  if (state.openStep) renderCheckDialog();
}

function renderCheckDialog() {
  const { step, section, index } = stepMeta.get(state.openStep);
  const editing = state.editor && state.editingSectionId === section.id;
  const dialog = $("#checkDialog");
  dialog.classList.toggle("detail-editing", editing);
  $("#dialogCategory").textContent = `${section.title.toUpperCase()} / SKILL CHECK`;
  $("#dialogStepNumber").textContent = `STEP ${section.number} — ${String(index + 1).padStart(2, "0")}`;
  $("#dialogTitle").textContent = step.title;
  $("#dialogDescription").textContent = step.description;
  renderLocalVideoPreview();
  const photo = $("#dialogPhoto");
  const photoImage = $("#dialogPhotoImage");
  photo.hidden = !step.image && !editing;
  photoImage.hidden = !step.image;
  $("#dialogPhotoPlaceholder").hidden = !!step.image;
  $("#detailPhotoButton").hidden = !editing;
  $("#detailPhotoMenu").hidden = true;
  $("#removeDetailPhoto").hidden = !step.image;
  if (step.image) {
    photoImage.src = step.image;
    photoImage.alt = step.imageAlt || `${step.title}の参考写真`;
  } else {
    photoImage.removeAttribute("src");
    photoImage.alt = "";
  }
  const count = checkedCount(step);
  $("#dialogCount").textContent = count === step.items.length ? `${count}/${step.items.length} 完了しました` : `${count}/${step.items.length} 完了しています`;
  $("#dialogProgressFill").style.width = `${count / step.items.length * 100}%`;
  $("#saveState").textContent = "変更は自動保存されます";
  const list = $("#checkItems");
  list.replaceChildren();
  const photoMenu = (parent, target, replace) => {
    if (!editing || state.detailPhotoTarget !== target) return;
    const menu = document.createElement("div");
    menu.className = "detail-inline-photo-menu";
    menu.innerHTML = `<label>写真を撮る<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-detail-photo-input="camera"></label><label>ギャラリーから選択<input type="file" accept="image/jpeg,image/png,image/webp" ${replace ? "" : "multiple"} data-detail-photo-input="gallery"></label>${replace ? '<button type="button" data-detail-photo-remove>写真を削除</button>' : ""}`;
    parent.append(menu);
  };
  const itemCamera = index => {
    const wrap = document.createElement("div");
    wrap.className = "detail-item-camera-wrap";
    const camera = document.createElement("button");
    camera.type = "button";
    camera.className = "detail-insert-camera";
    camera.dataset.detailPhotoPosition = String(index);
    camera.setAttribute("aria-label", `${index + 1}番目に写真を追加`);
    camera.innerHTML = '<img src="/camera-icon.svg" alt="">';
    wrap.append(camera);
    photoMenu(wrap, `insert:${index}`, false);
    return wrap;
  };
  const addButton = index => {
    if (editing) {
      const actions = document.createElement("div");
      actions.className = "detail-insert-actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "detail-add-button";
      button.dataset.detailAdd = String(index);
      button.textContent = "+";
      button.setAttribute("aria-label", `${index + 1}番目にチェック項目を追加`);
      actions.append(button);
      if (index === step.items.length) actions.append(itemCamera(index));
      list.append(actions);
    }
    if (state.detailInsertIndex === index) {
      const input = document.createElement("input");
      input.className = "detail-inline-input detail-insert-input";
      input.dataset.detailInsertInput = String(index);
      input.maxLength = 500;
      input.placeholder = "新しいチェック項目を入力してEnter";
      input.setAttribute("aria-label", "新しいチェック項目");
      list.append(input);
    }
    const photos = (step.detailImages || []).filter(image => image.position === index);
    if (!photos.length) return;
    const gallery = document.createElement("div");
    gallery.className = "detail-inline-photos";
    for (const [photoIndex, image] of photos.entries()) {
      const figure = document.createElement("figure");
      figure.className = "detail-inline-photo";
      const img = document.createElement("img");
      img.src = image.url;
      img.alt = `${step.title}の手順写真 ${photoIndex + 1}`;
      img.loading = "lazy";
      figure.append(img);
      if (editing) {
        const camera = document.createElement("button");
        camera.type = "button";
        camera.className = "detail-inline-photo-edit";
        camera.dataset.detailPhotoId = image.id;
        camera.setAttribute("aria-label", `手順写真 ${photoIndex + 1} を変更または削除`);
        camera.innerHTML = '<img src="/camera-icon.svg" alt="">';
        figure.append(camera);
        photoMenu(figure, `replace:${image.id}`, true);
      }
      gallery.append(figure);
    }
    list.append(gallery);
  };
  step.items.forEach((label, index) => {
    addButton(index);
    const [storedStepId, storedIndex] = progressRef(step, index);
    const checked = state.checked.has(itemKey(storedStepId, storedIndex));
    const button = document.createElement("button");
    button.type = "button";
    button.className = `check-item${checked ? " checked" : ""}`;
    button.dataset.progressStepId = storedStepId;
    button.dataset.itemIndex = String(storedIndex);
    button.setAttribute("role", "checkbox");
    button.setAttribute("aria-checked", String(checked));
    const box = document.createElement("span");
    box.className = "item-check";
    box.setAttribute("aria-hidden", "true");
    box.textContent = checked ? "✓" : "";
    const text = document.createElement("span");
    text.textContent = label;
    button.append(box, text);
    if (!state.user) button.disabled = true;
    if (!editing) { list.append(button); return; }
    const row = document.createElement("div");
    row.className = "detail-item-row";
    row.append(itemCamera(index));
    row.append(button);
    if (state.detailEditIndex === index) {
      button.classList.add("label-editing");
      const input = document.createElement("input");
      input.className = "detail-inline-input";
      input.dataset.detailEditInput = String(index);
      input.maxLength = 500;
      input.value = label;
      input.setAttribute("aria-label", `チェック項目 ${index + 1} の名前`);
      row.append(input);
    }
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "detail-item-action";
    edit.dataset.detailEdit = String(index);
    edit.setAttribute("aria-label", `チェック項目 ${index + 1} を編集`);
    edit.innerHTML = '<img src="/edit-icon.svg" alt="">';
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "detail-item-action detail-item-delete";
    remove.dataset.detailDelete = String(index);
    remove.setAttribute("aria-label", `チェック項目 ${index + 1} を削除`);
    remove.innerHTML = '<img src="/trash-icon.svg" alt="">';
    row.append(edit, remove);
    list.append(row);
  });
  addButton(step.items.length);
  decorateLockedImages(dialog);
}

function openCheckDialog(stepId, trigger) {
  state.openStep = stepId;
  clearUploadError();
  state.detailEditIndex = null;
  state.detailInsertIndex = null;
  state.detailPhotoTarget = null;
  renderCheckDialog();
  const dialog = $("#checkDialog");
  dialog.showModal();
  if (window.innerWidth > 760 && trigger) {
    const rect = trigger.getBoundingClientRect();
    const left = Math.min(rect.right + 13, window.innerWidth - dialog.getBoundingClientRect().width - 12);
    const top = Math.max(15, Math.min(rect.top - 60, window.innerHeight - Math.min(dialog.offsetHeight, 690) - 15));
    dialog.style.left = `${Math.max(12, left)}px`;
    dialog.style.top = `${top}px`;
  }
  dialog.querySelector(".check-item")?.focus();
  refreshCurrentUser();
}

async function refreshCurrentUser() {
  const userId = state.user?.id;
  if (!userId) return;
  try {
    const { progress } = await api(`/api/progress?userId=${userId}`);
    if (state.user?.id !== userId) return;
    state.checked = new Set(progress.map(row => itemKey(row.step_id, row.item_index)));
    renderProgress();
  } catch (error) { showError(error); }
}

function closeCheckDialog() { $("#checkDialog").close(); state.openStep = null; state.detailEditIndex = null; state.detailInsertIndex = null; state.detailPhotoTarget = null; }

function detailEditingEnabled() {
  const meta = stepMeta.get(state.openStep);
  return !!meta && state.editor && state.editingSectionId === meta.section.id;
}

async function saveDetailChange(change, photo = false) {
  if (!detailEditingEnabled() || state.detailBusy) return;
  const next = structuredClone(sections);
  const detail = next.flatMap(section => section.steps).find(step => step.id === state.openStep);
  if (!detail) return;
  change(detail);
  detail.edited = true;
  state.detailBusy = true;
  $("#saveState").textContent = "保存中…";
  try {
    await saveManual(next);
    state.detailEditIndex = null;
    state.detailInsertIndex = null;
    state.detailPhotoTarget = null;
    renderCheckDialog();
    $("#saveState").textContent = "保存しました";
    $("#saveState").classList.remove("save-error");
  } catch (error) {
    $("#saveState").textContent = "保存できませんでした";
    $("#saveState").classList.add("save-error");
    showError(error, photo);
  } finally { state.detailBusy = false; }
}

async function commitDetailInput(input) {
  if (!input || !detailEditingEnabled() || state.detailBusy) return;
  const value = input.value.trim();
  if (!value || value.length > 500) { toast("チェック項目を1〜500文字で入力してください"); input.focus(); return; }
  const editIndex = input.dataset.detailEditInput;
  if (editIndex !== undefined) {
    const index = Number(editIndex);
    if (stepMeta.get(state.openStep).step.items[index] === value) {
      state.detailEditIndex = null;
      renderCheckDialog();
      return;
    }
    await saveDetailChange(step => { step.items[index] = value; });
    return;
  }
  const index = Number(input.dataset.detailInsertInput);
  if (stepMeta.get(state.openStep).step.items.length >= 50) { toast("チェック項目は50件までです"); return; }
  await saveDetailChange(step => {
    step.items.splice(index, 0, value);
    step.progressRefs.splice(index, 0, [`item-${crypto.randomUUID()}`, 0]);
    step.detailImages?.forEach(image => { if (image.position >= index) image.position++; });
  });
}

function openHelpDialog(stepId) {
  const meta = stepMeta.get(stepId);
  if (!meta) return;
  const guide = meta.step.edited || !guides[stepId]
    ? { lead: meta.step.description, points: meta.step.items, note: "作業内容はマニュアル編集画面で更新できます。" }
    : guides[stepId];
  $("#helpCategory").textContent = `${meta.section.title} / STEP ${String(meta.index + 1).padStart(2, "0")}`;
  $("#helpTitle").textContent = meta.step.title;
  $("#helpLead").textContent = guide.lead;
  $("#helpNote").textContent = guide.note;
  const list = $("#helpPoints");
  list.replaceChildren();
  for (const point of guide.points) {
    const item = document.createElement("li");
    item.textContent = point;
    list.append(item);
  }
  $("#helpDialog").showModal();
  renderPublishedVideo(stepId);
  $("#closeHelpDialog").focus();
}

function renderPublishedVideo(stepId) {
  let container = $("#publishedHelpVideo");
  if (!container) {
    container = document.createElement("section");
    container.id = "publishedHelpVideo";
    container.className = "local-video-preview";
    $("#helpLead").after(container);
    $("#helpDialog").addEventListener("close", () => container.replaceChildren());
  }
  container.replaceChildren();
  const video = publishedVideos.get(stepId);
  if (!video) { container.hidden = true; return; }
  container.hidden = false;
  const heading = document.createElement("strong"); heading.textContent = "作業動画";
  const player = document.createElement("div"); player.className = "local-video-preview-player";
  const frame = document.createElement("iframe"); frame.src = video.embedUrl; frame.title = `${video.title}の動画`;
  frame.allow = "encrypted-media; picture-in-picture; web-share"; frame.allowFullscreen = true;
  player.append(frame);
  const links = document.createElement("div"); links.className = "published-video-links";
  const youtube = document.createElement("a"); youtube.href = video.youtubeUrl; youtube.target = "_blank"; youtube.rel = "noopener noreferrer"; youtube.textContent = "YouTubeで開く ↗";
  const page = document.createElement("a"); page.href = video.pageUrl; page.target = "_top"; page.textContent = "動画を別ページで見る →";
  links.append(youtube,page); container.append(heading,player,links);
}

async function selectUser(user) {
  try {
    if (!Number.isInteger(user.id)) {
      const lookup = await api("/api/users", { method: "POST", body: JSON.stringify({ name: user.name }) });
      user = lookup.user;
    }
    const { progress } = await api(`/api/progress?userId=${user.id}`);
    if (state.user?.id !== user.id) state.editingSectionId = null;
    state.user = user;
    state.checked = new Set(progress.map(row => itemKey(row.step_id, row.item_index)));
    localStorage.setItem("asobe-skill-user-id", String(user.id));
    localStorage.setItem("asobe-skill-user-name", user.name);
    $("#userName").textContent = user.name;
    $("#userAvatar").textContent = user.name.slice(0, 1);
    applyEditorPermission();
    if ($("#userDialog").open) $("#userDialog").close();
    if (state.pendingStep) {
      const stepId = state.pendingStep;
      state.pendingStep = null;
      openCheckDialog(stepId, $(`[data-step="${stepId}"]`));
    }
  } catch (error) { $("#userError").textContent = friendlyError(error); }
}

function applyEditorPermission() {
  state.editor = state.accountEditor;
  if (!state.editor) state.editingSectionId = null;
  $("#adminDenied").hidden = true;
  const addSectionButton = $("#addSectionButton");
  if (addSectionButton) addSectionButton.hidden = !state.editor;
  renderNav();
  renderSections();
  renderProgress();
}

function openUserDialog() {
  $("#userError").textContent = "";
  closeUserChoices();
  $("#userDialog").showModal();
  $("#newUserName").focus();
}

function closeUserChoices() {
  $("#userNameChoices").hidden = true;
  $("#userNameToggle").setAttribute("aria-expanded", "false");
}

function renderUserChoices(filterInput = true) {
  const list = $("#userNameChoices");
  const query = filterInput ? $("#newUserName").value.trim().toLocaleLowerCase("ja-JP") : "";
  const matches = userChoices.filter(user => user.name.toLocaleLowerCase("ja-JP").includes(query));
  list.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.textContent = userChoices.length ? "一致する利用者はいません" : "登録された利用者はいません";
    list.append(empty);
    return;
  }
  for (const user of matches) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = user.name;
    button.addEventListener("click", () => {
      $("#newUserName").value = user.name;
      closeUserChoices();
      $("#newUserName").focus();
    });
    list.append(button);
  }
}

async function openUserChoices() {
  const list = $("#userNameChoices");
  list.hidden = false;
  $("#userNameToggle").setAttribute("aria-expanded", "true");
  list.textContent = "読み込み中…";
  try {
    const result = await api("/api/users/list");
    if (list.hidden) return;
    userChoices = result.users;
    renderUserChoices(false);
  } catch (error) {
    list.textContent = friendlyError(error);
  }
}

async function loadAdminStatus() {
  try {
    const status = await api("/api/admin/session");
    state.admin = status.admin;
    state.accountAuthenticated = status.authenticated;
    state.accountEditor = status.editor;
    state.linkedUserId = status.userId;
    $("#adminSignIn").hidden = status.authenticated;
    $("#adminSettings").hidden = !status.editor;
    $("#permissionTutorial").hidden = !status.admin;
    $("#adminSignOut").hidden = !status.authenticated;
    $("#userButton").hidden = !status.editor;
    applyEditorPermission();
  } catch {
    state.admin = false;
    state.accountAuthenticated = false;
    state.accountEditor = false;
    applyEditorPermission();
    $("#adminSignIn").hidden = false;
    $("#adminSettings").hidden = true;
    $("#permissionTutorial").hidden = true;
    $("#adminSignOut").hidden = true;
    $("#adminDenied").hidden = true;
  }
}

function openAdminDialog() {
  if (sessionStorage.getItem("skill-permission-tutorial") === "settings") sessionStorage.setItem("skill-permission-tutorial", "accounts-tab");
  window.top.location.href = "/passkey";
}

function showPermissionTutorial() {
  const backdrop = document.createElement("div");
  backdrop.className = "skill-permission-intro-backdrop";
  backdrop.innerHTML = `<section class="skill-permission-intro" role="dialog" aria-modal="true" aria-labelledby="skill-permission-title">
    <button type="button" class="skill-permission-close" aria-label="説明を閉じる">×</button>
    <span class="skill-permission-eyebrow">USER ACCESS</span>
    <h2 id="skill-permission-title">権限変更について</h2>
    <p>ChatGPTで初めてサインインした人は「承認待ち利用者」として登録されます。管理者が本人確認と利用者記録の紐付けを行うと、利用者として使えます。</p>
    <ul>
      <li><strong>利用者：</strong>自分のスキルチェックの進捗を見て、チェックを記録できます。</li>
      <li><strong>職員：</strong>利用者の進捗を確認・記録し、利用者記録を作成できます。パスキーで本人確認すると、工程・マニュアル・写真を15分間編集できます。</li>
      <li><strong>管理者：</strong>職員の操作に加え、アカウントの区分・有効状態・利用者記録との紐付けを変更し、操作記録を確認できます。</li>
    </ul>
    <p>設定画面の「アカウント管理」で承認待ちの人を利用者として登録できます。職員・管理者の設定には、別画面で管理者パスキーによる確認が必要です。</p>
    <div class="skill-permission-actions"><button type="button" class="skill-permission-cancel">閉じる</button><button type="button" class="skill-permission-next">次へ</button></div>
  </section>`;
  const close = () => { backdrop.remove(); window.removeEventListener("keydown", onKey); };
  const onKey = event => { if (event.key === "Escape") close(); };
  backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
  backdrop.querySelector(".skill-permission-close").addEventListener("click", close);
  backdrop.querySelector(".skill-permission-cancel").addEventListener("click", close);
  backdrop.querySelector(".skill-permission-next").addEventListener("click", () => {
    close();
    sessionStorage.setItem("skill-permission-tutorial", "settings");
    showSettingsSpotlight();
  });
  window.addEventListener("keydown", onKey);
  document.body.append(backdrop);
}

function showSettingsSpotlight() {
  const target = $("#adminSettings");
  const rect = target.getBoundingClientRect();
  target.classList.add("skill-tutorial-highlight");
  const layer = document.createElement("div");
  layer.className = "skill-tutorial-layer";
  layer.innerHTML = `<div class="skill-tutorial-mask"></div><div class="skill-tutorial-mask"></div><div class="skill-tutorial-mask"></div><div class="skill-tutorial-mask"></div><div class="skill-tutorial-bubble" role="dialog"><button type="button" aria-label="チュートリアルを終了">×</button><strong>権限変更について</strong><p>「設定」を押します。次の画面で「アカウント管理」に切り替えます。</p><small>指定された箇所以外を押すか、×で終了します。</small></div>`;
  const masks = layer.querySelectorAll(".skill-tutorial-mask");
  masks[0].style.cssText = `top:0;left:0;width:100vw;height:${rect.top - 5}px`;
  masks[1].style.cssText = `top:${rect.bottom + 5}px;left:0;width:100vw;bottom:0`;
  masks[2].style.cssText = `top:${rect.top - 5}px;left:0;width:${rect.left - 5}px;height:${rect.height + 10}px`;
  masks[3].style.cssText = `top:${rect.top - 5}px;left:${rect.right + 5}px;right:0;height:${rect.height + 10}px`;
  const bubble = layer.querySelector(".skill-tutorial-bubble");
  bubble.style.top = `${Math.min(rect.bottom + 14, innerHeight - 145)}px`;
  bubble.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - 340))}px`;
  const close = () => { layer.remove(); target.classList.remove("skill-tutorial-highlight"); sessionStorage.removeItem("skill-permission-tutorial"); window.removeEventListener("keydown", onKey); };
  const onKey = event => { if (event.key === "Escape") close(); };
  masks.forEach(mask => mask.addEventListener("click", close));
  bubble.addEventListener("click", close);
  window.addEventListener("keydown", onKey);
  document.body.append(layer);
}

function openStepEditor(sectionId, index, step = null) {
  if (!state.editor) return;
  state.stepDraftSectionId = sectionId;
  state.stepDraftIndex = index;
  state.stepDraftIsNew = !step;
  state.stepDraft = step ? structuredClone(step) : {
    id: `custom-${crypto.randomUUID()}`,
    title: "",
    description: "",
    items: [""],
    progressRefs: [[`item-${crypto.randomUUID()}`, 0]],
  };
  $("#stepEditHeading").textContent = step ? "工程を編集" : "工程を追加";
  $("#stepEditTitle").value = state.stepDraft.title;
  $("#stepEditDescription").value = state.stepDraft.description;
  $("#stepEditError").textContent = "";
  updateStepImagePreview();
  renderEditorItems();
  $("#stepEditDialog").showModal();
  $("#stepEditTitle").focus();
}

function updateStepImagePreview() {
  const preview = $("#stepImagePreview");
  preview.hidden = !state.stepDraft.image;
  if (state.stepDraft.image) preview.src = state.stepDraft.image;
  else preview.removeAttribute("src");
  $("#removeStepImage").hidden = !state.stepDraft.image;
}

function syncDraftItems() {
  $("#editItemList").querySelectorAll("[data-edit-item]").forEach(input => {
    state.stepDraft.items[Number(input.dataset.editItem)] = input.value;
  });
}

function renderEditorItems() {
  const list = $("#editItemList");
  list.replaceChildren();
  const addButton = index => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-add-button";
    button.dataset.addItem = String(index);
    button.textContent = "+";
    button.setAttribute("aria-label", `${index + 1}番目にチェック項目を追加`);
    list.append(button);
  };
  state.stepDraft.items.forEach((label, index) => {
    addButton(index);
    const row = document.createElement("div");
    row.className = "edit-item-row";
    const input = document.createElement("textarea");
    input.rows = 2;
    input.maxLength = 500;
    input.required = true;
    input.dataset.editItem = String(index);
    input.value = label;
    input.setAttribute("aria-label", `チェック項目 ${index + 1}`);
    const focus = document.createElement("button");
    focus.type = "button";
    focus.dataset.focusItem = String(index);
    focus.textContent = "✎";
    focus.setAttribute("aria-label", `チェック項目 ${index + 1} を編集`);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "editor-trash";
    remove.dataset.removeItem = String(index);
    remove.innerHTML = '<img src="/trash-icon.svg" alt="">';
    remove.setAttribute("aria-label", `チェック項目 ${index + 1} を削除`);
    row.append(input, focus, remove);
    list.append(row);
  });
  addButton(state.stepDraft.items.length);
}

async function uploadImage(file) {
  validateCoverFiles([file]);
  const form = new FormData();
  form.set("image", file);
  let response;
  try { response = await fetch("/api/manual/images", { method: "POST", body: form, signal: AbortSignal.timeout(30000) }); }
  catch (error) { throw new Error(error?.name === "TimeoutError" ? "画像の送信が時間内に完了しませんでした。画面を更新して結果を確認してください。" : "画像を送信できませんでした。通信状態を確認し、再度お試しください。"); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 413) throw new Error(`画像「${file.name}」がサーバーの容量制限を超えました。8 MB以下に縮小して再試行してください。`);
    if (response.status === 401 || response.status === 403) throw new Error("画像を保存する権限がありません。編集できる利用者を選択し、必要に応じて再ログインしてください。");
    if (response.status === 429) throw new Error("画像の送信が集中しています。少し待ってから再試行してください。");
    if (response.status >= 500) throw new Error("画像の保存先でエラーが発生しました。少し待ってから再試行してください。続く場合は管理者に連絡してください。");
    throw new Error(result.error || `画像を保存できませんでした（HTTP ${response.status}）。ファイルを確認して再試行してください。`);
  }
  if (!result.url) throw new Error("画像の保存結果を確認できませんでした。少し待ってから再試行してください。");
  return result.url;
}

async function updateStepPhoto(stepId, file) {
  const meta = stepMeta.get(stepId);
  if (!state.editor || state.stepPhotoBusy || !meta || state.editingSectionId !== meta.section.id) return;
  state.stepPhotoBusy = true;
  try {
    if (file) validateCoverFiles([file]);
    const url = file ? await uploadImage(file) : "";
    const next = structuredClone(sections);
    const step = next.find(section => section.id === meta.section.id).steps.find(entry => entry.id === stepId);
    step.image = url;
    step.imageAlt = url ? `${step.title}の参考写真` : "";
    await saveManual(next);
  } catch (error) { showError(error); }
  finally { state.stepPhotoBusy = false; }
}

function openCoverEditor(sectionId) {
  if (!state.editor) return;
  state.coverSectionId = sectionId;
  const section = sections.find(entry => entry.id === sectionId);
  $("#coverTitle").textContent = `${section.title}の必要なもの`;
  $("#coverError").textContent = "";
  renderCoverPreview();
  $("#coverDialog").showModal();
}

function renderCoverPreview() {
  const section = sections.find(entry => entry.id === state.coverSectionId);
  const images = section ? sectionImages(section) : [];
  $("#coverPreview").innerHTML = images.length ? images.map((image, index) => `<div class="needed-preview-item"><img src="${escapeHtml(image)}" alt="追加済みの画像 ${index + 1}"><div class="needed-preview-actions"><label>差し替え<input type="file" accept="image/jpeg,image/png,image/webp" data-replace-cover="${section.id}" data-cover-index="${index}" aria-label="画像 ${index + 1} を差し替え"></label><button type="button" data-remove-cover="${index}" aria-label="画像 ${index + 1} を削除">削除</button></div></div>`).join("") : `<p>追加済みの画像はありません</p>`;
}

function setCoverStatus(sectionId, message, error = false) {
  const inline = document.querySelector(`[data-cover-status="${sectionId}"]`);
  if (inline) { inline.textContent = message; inline.classList.toggle("upload-error", error); }
  if ($("#coverDialog").open && state.coverSectionId === sectionId) $("#coverError").textContent = message;
}

async function editCoverImages(sectionId, message, makeImages) {
  if (!state.editor || state.coverBusy) return;
  state.coverBusy = true;
  setCoverStatus(sectionId, message);
  try {
    const current = sections.find(section => section.id === sectionId);
    if (!current) throw new Error("工程が見つかりません");
    const images = await makeImages([...sectionImages(current)]);
    const next = structuredClone(sections);
    const target = next.find(section => section.id === sectionId);
    target.covers = images;
    target.cover = "";
    await saveManual(next);
    if ($("#coverDialog").open && state.coverSectionId === sectionId) renderCoverPreview();
    setCoverStatus(sectionId, "");
  } catch (error) { setCoverStatus(sectionId, showError(error), true); }
  finally { state.coverBusy = false; }
}

function validateCoverFiles(files) {
  for (const file of files) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error(`「${file.name}」は対応していない形式です。JPEG・PNG・WebP画像を選んでください。`);
    }
    if (file.size < 1) throw new Error(`「${file.name}」は空のファイルです。別の画像を選んでください。`);
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`「${file.name}」は${(file.size / 1_000_000).toFixed(1)} MBあり、上限の8 MBを超えています。画像を縮小または圧縮してから再試行してください。`);
    }
  }
}

async function addCoverImages(sectionId, files) {
  if (!files.length) return;
  await editCoverImages(sectionId, `${files.length}枚の画像を保存中…`, async images => {
    validateCoverFiles(files);
    if (images.length + files.length > 40) throw new Error("画像は40枚まで追加できます");
    const urls = [];
    for (const file of files) urls.push(await uploadImage(file));
    return [...images, ...urls];
  });
}

async function replaceCoverImage(sectionId, index, file) {
  if (!file) return;
  await editCoverImages(sectionId, "画像を差し替え中…", async images => {
    validateCoverFiles([file]);
    if (!images[index]) throw new Error("差し替える画像が見つかりません");
    images[index] = await uploadImage(file);
    return images;
  });
}

async function removeCoverImage(sectionId, index) {
  await editCoverImages(sectionId, "画像を削除中…", images => {
    if (!images[index]) throw new Error("削除する画像が見つかりません");
    return images.filter((_, imageIndex) => imageIndex !== index);
  });
}

$("#sectionNav").addEventListener("click", event => {
  const target = event.target.closest("a");
  if (!target) return;
  $("#sectionNav").querySelectorAll("a").forEach(a => a.classList.toggle("active", a === target));
});

function updateNavNumbers() {
  $("#sectionNav").querySelectorAll(".nav-num").forEach((number, index) => {
    number.textContent = String(index + 1).padStart(2, "0");
  });
}

async function persistSectionOrder(orderIds, focusId) {
  if (navReorderBusy) return;
  navReorderBusy = true;
  const nav = $("#sectionNav");
  nav.classList.add("nav-saving");
  const sectionById = new Map(sections.map(section => [section.id, section]));
  const next = orderIds.map((id, index) => ({ ...sectionById.get(id), number: String(index + 1).padStart(2, "0") }));
  try {
    await saveManual(next);
    nav.querySelector(`[data-drag-section="${focusId}"]`)?.focus();
  } catch (error) {
    renderNav();
    renderProgress();
    showError(error);
  } finally {
    navReorderBusy = false;
    nav.classList.remove("nav-saving");
  }
}

const sectionNav = $("#sectionNav");
sectionNav.addEventListener("pointerdown", event => {
  const handle = event.target.closest("[data-drag-section]");
  if (!handle || !state.editor || navReorderBusy || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault();
  handle.focus();
  sectionNav.setPointerCapture(event.pointerId);
  navDrag = { pointerId: event.pointerId, id: handle.dataset.dragSection, row: handle.closest(".nav-row"), startX: event.clientX, startY: event.clientY, moved: false };
  navDrag.row.classList.add("nav-row-dragging");
});
sectionNav.addEventListener("pointermove", event => {
  if (!navDrag || event.pointerId !== navDrag.pointerId) return;
  if (!navDrag.moved && Math.hypot(event.clientX - navDrag.startX, event.clientY - navDrag.startY) < 5) return;
  navDrag.moved = true;
  event.preventDefault();
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".nav-row");
  if (!target || target.parentElement !== sectionNav || target === navDrag.row) return;
  const rows = [...sectionNav.children];
  if (rows.indexOf(navDrag.row) < rows.indexOf(target)) target.after(navDrag.row);
  else target.before(navDrag.row);
  updateNavNumbers();
});
sectionNav.addEventListener("pointerup", event => {
  if (!navDrag || event.pointerId !== navDrag.pointerId) return;
  const drag = navDrag;
  navDrag = null;
  drag.row.classList.remove("nav-row-dragging");
  const orderIds = [...sectionNav.children].map(row => row.dataset.sectionId);
  if (orderIds.some((id, index) => id !== sections[index].id)) void persistSectionOrder(orderIds, drag.id);
});
function cancelNavDrag() {
  if (!navDrag) return;
  navDrag = null;
  renderNav();
  renderProgress();
}
sectionNav.addEventListener("pointercancel", cancelNavDrag);
sectionNav.addEventListener("lostpointercapture", cancelNavDrag);
window.addEventListener("blur", cancelNavDrag);
sectionNav.addEventListener("keydown", event => {
  const handle = event.target.closest("[data-drag-section]");
  if (!handle || !state.editor || navReorderBusy || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const from = sections.findIndex(section => section.id === handle.dataset.dragSection);
  const to = from + (event.key === "ArrowUp" ? -1 : 1);
  if (to < 0 || to >= sections.length) return;
  const orderIds = sections.map(section => section.id);
  orderIds.splice(to, 0, orderIds.splice(from, 1)[0]);
  void persistSectionOrder(orderIds, handle.dataset.dragSection);
});

$("#addSectionButton")?.addEventListener("click", () => {
  if (!state.editor) return;
  if (sections.length >= 30) { toast("大工程は30件まで追加できます"); return; }
  $("#sectionAddForm").reset();
  $("#sectionAddError").textContent = "";
  $("#sectionAddDialog").showModal();
  $("#sectionAddName").focus();
});

$("#sectionAddForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!state.editor) return;
  const title = $("#sectionAddName").value.trim();
  const subtitle = $("#sectionAddDescription").value.trim();
  if (!title || !subtitle) { $("#sectionAddError").textContent = "工程名と説明を入力してください"; return; }
  if (sections.length >= 30) { $("#sectionAddError").textContent = "大工程は30件まで追加できます"; return; }
  const id = `section-${crypto.randomUUID()}`;
  const next = [...structuredClone(sections), { id, number: String(sections.length + 1).padStart(2, "0"), title, subtitle, icon: "sparkle", steps: [] }];
  const button = $("#saveSectionAdd");
  button.disabled = true;
  try {
    await saveManual(next);
    state.editingSectionId = id;
    renderSections();
    renderProgress();
    $("#sectionAddDialog").close();
    $("#sectionNav").querySelectorAll("a").forEach(a => a.classList.toggle("active", a.dataset.nav === id));
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { $("#sectionAddError").textContent = friendlyError(error); }
  finally { button.disabled = false; }
});
$("#closeSectionAddDialog")?.addEventListener("click", () => $("#sectionAddDialog").close());
$("#cancelSectionAdd")?.addEventListener("click", () => $("#sectionAddDialog").close());
$("#sectionAddDialog")?.addEventListener("click", event => { if (event.target === event.currentTarget) event.currentTarget.close(); });

$("#sections").addEventListener("click", async event => {
  const sectionButton = event.target.closest("[data-edit-section]");
  if (sectionButton && state.editor) {
    state.editingSectionId = state.editingSectionId === sectionButton.dataset.editSection ? null : sectionButton.dataset.editSection;
    renderSections(); renderProgress();
    return;
  }
  const deleteCover = event.target.closest("[data-delete-cover]");
  if (deleteCover && state.editor) {
    await removeCoverImage(deleteCover.dataset.deleteCover, Number(deleteCover.dataset.coverIndex));
    return;
  }
  const removeStepPhoto = event.target.closest("[data-remove-step-photo]");
  if (removeStepPhoto && state.editor) {
    await updateStepPhoto(removeStepPhoto.dataset.removeStepPhoto, null);
    return;
  }
  const coverButton = event.target.closest("[data-cover]");
  if (coverButton && state.editor) { openCoverEditor(coverButton.dataset.cover); return; }
  const addButton = event.target.closest("[data-add-step]");
  if (addButton && state.editor) { openStepEditor(addButton.dataset.addStep, Number(addButton.dataset.insertIndex)); return; }
  const editButton = event.target.closest("[data-edit-step]");
  if (editButton && state.editor) {
    const meta = stepMeta.get(editButton.dataset.editStep);
    openStepEditor(meta.section.id, meta.index, meta.step);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-step]");
  if (deleteButton && state.editor) {
    const meta = stepMeta.get(deleteButton.dataset.deleteStep);
    if (!confirm(`「${meta.step.title}」を削除しますか？`)) return;
    const next = structuredClone(sections);
    next.find(section => section.id === meta.section.id).steps.splice(meta.index, 1);
    try { await saveManual(next); } catch (error) { showError(error); }
    return;
  }
  const help = event.target.closest("[data-help]");
  if (help) { openHelpDialog(help.dataset.help); return; }
  const button = event.target.closest("[data-step]");
  if (!button) return;
  if (!state.user && state.provisional) { openCheckDialog(button.dataset.step, button); return; }
  if (!state.user && !state.editor) { state.pendingStep = button.dataset.step; openUserDialog(); return; }
  if (!state.user && state.editor && state.editingSectionId !== stepMeta.get(button.dataset.step)?.section.id) { state.pendingStep = button.dataset.step; openUserDialog(); return; }
  openCheckDialog(button.dataset.step, button);
});

$("#sections").addEventListener("change", async event => {
  const stepPhoto = event.target.closest("input[data-step-photo]");
  if (stepPhoto && state.editor) {
    const file = stepPhoto.files?.[0];
    if (file) await updateStepPhoto(stepPhoto.dataset.stepPhoto, file);
    stepPhoto.value = "";
    return;
  }
  const input = event.target.closest("input[data-replace-cover]");
  if (!input || !state.editor) return;
  const file = input.files?.[0];
  await replaceCoverImage(input.dataset.replaceCover, Number(input.dataset.coverIndex), file);
  input.value = "";
});

$("#sections").addEventListener("dragover", event => {
  const zone = event.target.closest("[data-photo-drop]");
  if (!zone || !state.editor || !Array.from(event.dataTransfer?.types || []).includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  zone.classList.add("drag-over");
});
$("#sections").addEventListener("dragleave", event => {
  const zone = event.target.closest("[data-photo-drop]");
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
});
$("#sections").addEventListener("drop", async event => {
  const zone = event.target.closest("[data-photo-drop]");
  if (!zone || !state.editor) return;
  event.preventDefault();
  zone.classList.remove("drag-over");
  const file = event.dataTransfer?.files?.[0];
  if (file) await updateStepPhoto(zone.dataset.photoDrop, file);
});

$("#editItemList").addEventListener("click", event => {
  const add = event.target.closest("[data-add-item]");
  const remove = event.target.closest("[data-remove-item]");
  const focus = event.target.closest("[data-focus-item]");
  if (focus) { $("#editItemList").querySelector(`[data-edit-item="${focus.dataset.focusItem}"]`)?.focus(); return; }
  if (!add && !remove) return;
  syncDraftItems();
  if (add) {
    const index = Number(add.dataset.addItem);
    state.stepDraft.items.splice(index, 0, "");
    state.stepDraft.progressRefs.splice(index, 0, [`item-${crypto.randomUUID()}`, 0]);
    state.stepDraft.detailImages?.forEach(image => { if (image.position >= index) image.position++; });
    renderEditorItems();
    $("#editItemList").querySelector(`[data-edit-item="${index}"]`)?.focus();
  } else {
    if (state.stepDraft.items.length === 1) { toast("チェック項目は1つ以上必要です"); return; }
    const index = Number(remove.dataset.removeItem);
    state.stepDraft.items.splice(index, 1);
    state.stepDraft.progressRefs.splice(index, 1);
    state.stepDraft.detailImages?.forEach(image => { if (image.position > index) image.position--; });
    renderEditorItems();
  }
});

$("#stepEditForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!state.editor || !state.stepDraft) return;
  syncDraftItems();
  const draft = state.stepDraft;
  draft.title = $("#stepEditTitle").value.trim();
  draft.description = $("#stepEditDescription").value.trim();
  draft.items = draft.items.map(item => item.trim());
  if (!draft.title || !draft.description || draft.items.some(item => !item)) {
    $("#stepEditError").textContent = "工程名、説明、チェック項目を入力してください";
    return;
  }
  draft.edited = true;
  const next = structuredClone(sections);
  const target = next.find(section => section.id === state.stepDraftSectionId);
  if (state.stepDraftIsNew) target.steps.splice(state.stepDraftIndex, 0, draft);
  else target.steps[state.stepDraftIndex] = draft;
  const button = $("#saveStepEdit");
  button.disabled = true;
  try {
    await saveManual(next);
    $("#stepEditDialog").close();
    state.stepDraft = null;
  } catch (error) { $("#stepEditError").textContent = friendlyError(error); }
  finally { button.disabled = false; }
});

for (const id of ["stepImageCamera", "stepImageGallery"]) {
  $(`#${id}`).addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file || !state.stepDraft) return;
    $("#stepEditError").textContent = "画像を保存中…";
    try {
      state.stepDraft.image = await uploadImage(file);
      state.stepDraft.imageAlt = `${$("#stepEditTitle").value || "工程"}の参考写真`;
      updateStepImagePreview();
      $("#stepEditError").textContent = "";
    } catch (error) { $("#stepEditError").textContent = showError(error); }
    event.target.value = "";
  });
}
$("#removeStepImage").addEventListener("click", () => { state.stepDraft.image = ""; updateStepImagePreview(); });
for (const id of ["coverCamera", "coverGallery"]) {
  $(`#${id}`).addEventListener("change", async event => {
    const files = [...(event.target.files || [])];
    if (!files.length || !state.coverSectionId) return;
    await addCoverImages(state.coverSectionId, files);
    event.target.value = "";
  });
}

$("#coverPreview").addEventListener("click", async event => {
  const button = event.target.closest("[data-remove-cover]");
  if (button && state.coverSectionId) await removeCoverImage(state.coverSectionId, Number(button.dataset.removeCover));
});

$("#coverPreview").addEventListener("change", async event => {
  const input = event.target.closest("input[data-replace-cover]");
  if (!input) return;
  await replaceCoverImage(input.dataset.replaceCover, Number(input.dataset.coverIndex), input.files?.[0]);
  input.value = "";
});

$("#coverDropzone")?.addEventListener("click", () => $("#coverGallery").click());
for (const container of [$("#sections"), $("#coverDialog")]) {
  container.addEventListener("dragover", event => {
    const zone = event.target.closest(".needed-dropzone");
    if (!zone || !state.editor || !Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    zone.classList.add("drag-over");
  });
  container.addEventListener("dragleave", event => {
    const zone = event.target.closest(".needed-dropzone");
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
  });
  container.addEventListener("drop", async event => {
    const zone = event.target.closest(".needed-dropzone");
    if (!zone || !state.editor) return;
    event.preventDefault();
    zone.classList.remove("drag-over");
    const sectionId = zone.dataset.cover || state.coverSectionId;
    if (sectionId) await addCoverImages(sectionId, [...(event.dataTransfer?.files || [])]);
  });
}

$("#checkItems").addEventListener("click", async event => {
  if (detailEditingEnabled()) {
    const addPhoto = event.target.closest("[data-detail-photo-position]");
    const editPhoto = event.target.closest("[data-detail-photo-id]");
    const removePhoto = event.target.closest("[data-detail-photo-remove]");
    if (addPhoto || editPhoto) {
      const target = addPhoto ? `insert:${addPhoto.dataset.detailPhotoPosition}` : `replace:${editPhoto.dataset.detailPhotoId}`;
      state.detailPhotoTarget = state.detailPhotoTarget === target ? null : target;
      renderCheckDialog();
      return;
    }
    if (removePhoto && state.detailPhotoTarget?.startsWith("replace:") && !state.detailBusy) {
      const id = state.detailPhotoTarget.slice(8);
      await saveDetailChange(step => { step.detailImages = (step.detailImages || []).filter(image => image.id !== id); });
      return;
    }
    const add = event.target.closest("[data-detail-add]");
    const edit = event.target.closest("[data-detail-edit]");
    const remove = event.target.closest("[data-detail-delete]");
    if (add || edit) {
      state.detailInsertIndex = add ? Number(add.dataset.detailAdd) : null;
      state.detailEditIndex = edit ? Number(edit.dataset.detailEdit) : null;
      renderCheckDialog();
      $("#checkItems .detail-inline-input")?.focus();
      return;
    }
    if (remove && !state.detailBusy) {
      const index = Number(remove.dataset.detailDelete);
      const step = stepMeta.get(state.openStep).step;
      if (step.items.length <= 1) { toast("チェック項目は1つ以上必要です"); return; }
      if (!confirm("「" + step.items[index] + "」を削除しますか？")) return;
      await saveDetailChange(draft => {
        draft.items.splice(index, 1);
        draft.progressRefs.splice(index, 1);
        draft.detailImages?.forEach(image => { if (image.position > index) image.position--; });
      });
      return;
    }
  }
  const button = event.target.closest("[data-progress-step-id]");
  if (!button || state.saving || !state.user || !state.openStep) return;
  const index = Number(button.dataset.itemIndex);
  const stepId = button.dataset.progressStepId;
  const key = itemKey(stepId, index);
  const checked = !state.checked.has(key);
  const userId = state.user.id;
  state.saving = true;
  $("#saveState").textContent = "保存中…";
  if (checked) state.checked.add(key); else state.checked.delete(key);
  renderProgress();
  $(`#checkItems [data-progress-step-id="${stepId}"][data-item-index="${index}"]`)?.focus();
  try {
    await api("/api/progress", { method: "PUT", body: JSON.stringify({ userId, stepId, itemIndex: index, checked }) });
    $("#saveState").textContent = "保存しました";
  } catch (error) {
    if (checked) state.checked.delete(key); else state.checked.add(key);
    renderProgress();
    $("#saveState").textContent = "保存できませんでした";
    showError(error);
  } finally { state.saving = false; }
});

$("#checkItems").addEventListener("change", async event => {
  if (!event.target.matches("[data-detail-photo-input]") || !detailEditingEnabled() || state.detailBusy) return;
  const target = state.detailPhotoTarget;
  const files = [...(event.target.files || [])];
  if (!target || !files.length) return;
  const stepId = state.openStep;
  const current = stepMeta.get(stepId).step;
  const replacing = target.startsWith("replace:");
  if (!replacing && (current.detailImages?.length || 0) + files.length > 100) {
    showError(new Error("手順写真は1工程につき100枚までです。不要な写真を削除してから追加してください。"), true);
    return;
  }
  state.detailBusy = true;
  clearUploadError();
  $("#saveState").classList.remove("save-error");
  $("#saveState").textContent = "画像を保存中…";
  try {
    validateCoverFiles(replacing ? files.slice(0, 1) : files);
    const urls = await Promise.all((replacing ? files.slice(0, 1) : files).map(uploadImage));
    state.detailBusy = false;
    if (state.openStep !== stepId || !detailEditingEnabled()) return;
    await saveDetailChange(step => {
      if (replacing) {
        const image = step.detailImages?.find(photo => photo.id === target.slice(8));
        if (image) image.url = urls[0];
      } else {
        const position = Number(target.slice(7));
        step.detailImages ||= [];
        step.detailImages.push(...urls.map(url => ({ id: crypto.randomUUID(), position, url })));
      }
    }, true);
  } catch (error) {
    $("#saveState").textContent = "画像を保存できませんでした";
    $("#saveState").classList.add("save-error");
    showError(error, true);
  } finally {
    state.detailBusy = false;
    event.target.value = "";
  }
});

$("#checkItems").addEventListener("keydown", async event => {
  const input = event.target.closest(".detail-inline-input");
  if (!input) return;
  if (event.key === "Escape") {
    state.detailEditIndex = null;
    state.detailInsertIndex = null;
    renderCheckDialog();
  } else if (event.key === "Enter") {
    event.preventDefault();
    await commitDetailInput(input);
  }
});

$("#detailPhotoButton").addEventListener("click", () => {
  if (!detailEditingEnabled()) return;
  const menu = $("#detailPhotoMenu");
  menu.hidden = !menu.hidden;
});
for (const id of ["detailPhotoCamera", "detailPhotoGallery"]) {
  document.getElementById(id).addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file || !detailEditingEnabled() || state.detailBusy) return;
    state.detailBusy = true;
    clearUploadError();
    $("#saveState").classList.remove("save-error");
    $("#saveState").textContent = "画像を保存中…";
    try {
      const url = await uploadImage(file);
      state.detailBusy = false;
      await saveDetailChange(step => {
        step.image = url;
        step.imageAlt = step.title + "の参考写真";
      }, true);
    } catch (error) {
      $("#saveState").textContent = "画像を保存できませんでした";
      $("#saveState").classList.add("save-error");
      showError(error, true);
    } finally { state.detailBusy = false; event.target.value = ""; }
  });
}
$("#removeDetailPhoto").addEventListener("click", async () => {
  if (!detailEditingEnabled() || state.detailBusy) return;
  await saveDetailChange(step => { step.image = ""; step.imageAlt = ""; });
});

$("#closeDialog").addEventListener("click", closeCheckDialog);
$("#dialogDone").addEventListener("click", closeCheckDialog);
$("#checkDialog").addEventListener("close", () => { state.openStep = null; $("#localVideoPreview iframe")?.removeAttribute("src"); });
$("#checkDialog").addEventListener("click", event => { if (event.target === event.currentTarget) closeCheckDialog(); });
$("#closeHelpDialog").addEventListener("click", () => $("#helpDialog").close());
$("#helpDone").addEventListener("click", () => $("#helpDialog").close());
$("#helpDialog").addEventListener("click", event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
try {
  const result = await api("/api/manual/videos");
  publishedVideos = new Map(result.videos.filter(video => video.stepId).map(video => [video.stepId, video]));
} catch { publishedVideos = new Map(); }
$("#userButton").addEventListener("click", openUserDialog);
$("#userNameToggle").addEventListener("click", () => {
  if (!$("#userNameChoices").hidden) closeUserChoices();
  else openUserChoices();
});
$("#newUserName").addEventListener("input", () => {
  if (!$("#userNameChoices").hidden) renderUserChoices();
});
$("#newUserName").addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("#userNameChoices").hidden) {
    event.stopPropagation();
    closeUserChoices();
  }
});
$("#userDialog").addEventListener("click", event => {
  if (!event.target.closest(".user-name-picker")) closeUserChoices();
});
$("#adminSettings").addEventListener("click", openAdminDialog);
$("#permissionTutorial").addEventListener("click", showPermissionTutorial);
$("#closeCoverDialog").addEventListener("click", () => $("#coverDialog").close());
$("#closeStepEditDialog").addEventListener("click", () => $("#stepEditDialog").close());
$("#cancelStepEdit").addEventListener("click", () => $("#stepEditDialog").close());
$("#closeUserDialog").addEventListener("click", () => $("#userDialog").close());
$("#userDialog").addEventListener("click", event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$("#userDialog").addEventListener("close", closeUserChoices);
$("#userForm").addEventListener("submit", async event => {
  event.preventDefault();
  closeUserChoices();
  const input = $("#newUserName");
  const name = input.value.trim();
  if (!name) return;
  try {
    const { user, existed } = await api("/api/users", { method: "POST", body: JSON.stringify({ name }) });
    input.value = "";
    await selectUser(user);
    if (existed) toast("同じ名前の利用者に切り替えました");
  } catch (error) { $("#userError").textContent = friendlyError(error); }
});

try {
  const manual = await api("/api/manual");
  state.provisional = manual.imageAccess === "locked";
  document.body.classList.toggle("approval-pending", state.provisional);
  if (state.provisional) {
    const banner = document.createElement("section");
    banner.className = "approval-banner";
    banner.innerHTML = '<strong>管理者の承認をお待ちください</strong><p>工程の文章を閲覧できます。画像と進捗の記録は承認後に利用できます。画像上のボタンから管理者の連絡先を確認してください。</p>';
    $(".overview").before(banner);
  }
  guides = manual.guides ?? {};
  setManual(manual.sections, manual.version);
} catch (error) {
  renderNav(); renderSections(); renderProgress();
  showError(new Error(`マニュアルを読み込めませんでした。${friendlyError(error)}`));
}
await loadAdminStatus();
if (state.accountAuthenticated && !state.accountEditor && !state.provisional) {
  try {
    const { users } = await api("/api/users/list");
    if (users[0]) await selectUser(users[0]);
    else showError(new Error("アカウントに利用者記録が紐付いていません。職員に登録を依頼してください。"));
  } catch (error) { showError(error); }
} else if (state.accountEditor) {
  const savedId = Number(localStorage.getItem("asobe-skill-user-id"));
  const savedName = localStorage.getItem("asobe-skill-user-name");
  if (Number.isInteger(savedId) && savedId > 0 && savedName) {
    await selectUser({ id: savedId, name: savedName });
  }
}
const requestedStep = new URLSearchParams(location.search).get("step");
if (requestedStep) {
  if (!stepMeta.has(requestedStep)) toast("指定された工程が見つかりません");
  else if (state.user || state.provisional) openCheckDialog(requestedStep, $(`[data-step="${requestedStep}"]`));
  else { state.pendingStep = requestedStep; openUserDialog(); }
}

'use strict';
const $ = id => document.getElementById(id);
const video = $('video');
const STORAGE_KEY = 'local-video-player.v1';
let state = {};
try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_) {}
if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
state.progress = state.progress && typeof state.progress === 'object' && !Array.isArray(state.progress) ? state.progress : {};
const rates = [...$('speed').options].map(o => Number(o.value));
state.rate = rates.includes(state.rate) ? state.rate : 1;
state.volume = Number.isFinite(state.volume) ? Math.max(0, Math.min(1, state.volume)) : 0.8;
state.auto = state.auto !== false;
state.scope = state.scope === 'all' ? 'all' : 'course';
let library, all = [], byId = new Map(), current = null, browseCourse = '', ready = false;
let appTitle = '本地视频放映室';
let pendingPosition = 0, lastSave = 0, toastTimer, storageFailed = false;

function time(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return n >= 3600 ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
function progressFor(id) {
  const item = state.progress[id];
  return item && typeof item === 'object' ? item : {};
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (_) {
    if (!storageFailed) toast('浏览器未能保存进度；请检查站点存储空间或隐私设置。');
    storageFailed = true;
    $('saveStatus').textContent = '进度保存失败';
  }
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}
function saveProgress(completed = false) {
  if (!current || !ready || !Number.isFinite(video.duration) || video.duration <= 0) return;
  const previous = progressFor(current.id);
  state.progress[current.id] = {position: video.currentTime, duration: video.duration, done: completed || previous.done === true};
  state.last = current.id;
  persist();
  if (!storageFailed) $('saveStatus').textContent = `已保存到 ${time(video.currentTime)}`;
  updateProgress();
}
function updateProgress() {
  if (!current) return;
  const courseVideos = all.filter(v => v.course.id === current.course.id);
  const completed = courseVideos.filter(v => progressFor(v.id).done).length;
  $('progressSummary').textContent = `本课程已看完 ${completed} / ${courseVideos.length} 集`;
  const row = document.querySelector(`[data-video-id="${current.id}"] .lesson-state`);
  if (row) row.textContent = progressFor(current.id).done ? '已看完 · 当前课时' : `当前课时 · ${time(video.currentTime)}`;
}
function queue() { return current ? (state.scope === 'all' ? all : all.filter(v => v.course.id === current.course.id)) : []; }
function adjacent(offset) {
  const list = queue();
  const index = list.findIndex(v => v.id === current?.id);
  return index >= 0 ? list[index + offset] : undefined;
}
function updateNext() {
  const next = adjacent(1);
  $('previous').disabled = !adjacent(-1);
  $('next').disabled = $('playNext').disabled = !next;
  $('nextTitle').textContent = next?.title || (current ? '已是最后一集' : '暂无视频');
  $('nextChapter').textContent = next ? `${next.course.title} / ${next.chapter.title}` : '可以从左侧选择其他课程继续学习';
}
function navigate(offset) {
  const target = adjacent(offset);
  if (target) selectVideo(target.id, true, false);
}
async function play() {
  if (!current) return;
  try { await video.play(); }
  catch (error) {
    if (error.name === 'AbortError') return;
    if (error.name === 'NotAllowedError') {
      $('startOverlay').hidden = false;
      toast('点击画面即可继续播放');
    }
  }
}
function selectVideo(id, start = true, resume = true) {
  const selected = byId.get(id);
  if (!selected) return;
  saveProgress();
  ready = false;
  video.pause();
  current = selected;
  browseCourse = selected.course.id;
  $('course').value = browseCourse;
  state.last = id;
  const saved = progressFor(id);
  pendingPosition = resume && !saved.done && Number.isFinite(saved.position) ? saved.position : 0;
  $('lessonTitle').textContent = selected.title;
  $('breadcrumb').textContent = `${selected.course.title} / ${selected.chapter.title}`;
  const courseVideos = all.filter(v => v.course.id === selected.course.id);
  $('lessonNumber').textContent = `${courseVideos.findIndex(v => v.id === id) + 1} / ${courseVideos.length} 集`;
  document.title = `${selected.title} · ${appTitle}`;
  $('startTitle').textContent = pendingPosition > 2 ? '继续上次学习' : '开始这一课';
  $('startHint').textContent = pendingPosition > 2 ? `上次看到 ${time(pendingPosition)} · 点击继续` : '点击播放，进度会自动保存';
  $('startOverlay').hidden = start;
  $('videoError').hidden = true;
  video.src = `/media/${id}`;
  video.load();
  video.playbackRate = state.rate;
  renderChapters();
  updateNext();
  updateProgress();
  persist();
  if (start) play();
}
function lessonButton(item, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lesson' + (item.id === current?.id ? ' active' : '');
  button.dataset.videoId = item.id;
  button.title = item.title;
  if (item.id === current?.id) button.setAttribute('aria-current', 'true');
  const number = document.createElement('span');
  number.className = 'num';
  const progress = progressFor(item.id);
  number.textContent = item.id === current?.id ? '▶' : progress.done ? '✓' : String(index + 1).padStart(2, '0');
  const copy = document.createElement('span');
  copy.className = 'lesson-copy';
  const title = document.createElement('span');
  title.className = 'lesson-title';
  title.textContent = item.title;
  copy.append(title);
  if (item.id === current?.id || progress.position > 2 || progress.done) {
    const status = document.createElement('span');
    status.className = 'lesson-state';
    status.textContent = progress.done ? '已看完' : progress.position > 2 ? `看到 ${time(progress.position)}` : '当前课时';
    copy.append(status);
  }
  button.append(number, copy);
  button.addEventListener('click', () => selectVideo(item.id));
  return button;
}
function renderChapters() {
  if (!library) return;
  const query = $('search').value.trim().toLocaleLowerCase();
  const nav = $('chapters');
  const scrollTop = nav.scrollTop;
  nav.replaceChildren();
  let matches = 0, chapters = 0;
  const courses = query ? library.courses : library.courses.filter(c => c.id === browseCourse);
  for (const course of courses) {
    const courseFragment = document.createDocumentFragment();
    let courseMatches = 0;
    for (const chapter of course.chapters) {
      const videos = chapter.videos.filter(v => !query || `${course.title} ${chapter.title} ${v.title}`.toLocaleLowerCase().includes(query));
      if (!videos.length) continue;
      const details = document.createElement('details');
      details.className = 'chapter';
      details.open = !!query || chapter.id === current?.chapter.id || (course.id !== current?.course.id && course.chapters[0].id === chapter.id);
      const summary = document.createElement('summary');
      const title = document.createElement('span');
      title.className = 'chapter-name';
      title.textContent = chapter.title;
      const count = document.createElement('small');
      count.textContent = `${videos.length} 集`;
      summary.append(title, count);
      details.append(summary);
      videos.forEach(v => details.append(lessonButton(byId.get(v.id), chapter.videos.findIndex(x => x.id === v.id))));
      courseFragment.append(details);
      matches += videos.length;
      courseMatches += videos.length;
      chapters++;
    }
    if (courseMatches && query) {
      const heading = document.createElement('h3');
      heading.className = 'search-course';
      heading.textContent = course.title;
      nav.append(heading);
    }
    nav.append(courseFragment);
  }
  $('courseCount').textContent = query ? `找到 ${matches} 个课时` : `${chapters} 个章节 · ${matches} 个课时`;
  if (!matches) {
    const message = document.createElement('p');
    message.className = 'empty';
    message.textContent = query ? '没有匹配的课时，试试其他关键词。' : '请将视频放入包内「videos」文件夹，或修改「video-directory.txt」指定已有目录后重新启动。';
    nav.append(message);
  }
  nav.scrollTop = scrollTop;
}
async function loadLibrary(refresh = false) {
  $('refresh').disabled = true;
  try {
    const response = await fetch(`/api/library${refresh ? '?refresh=1' : ''}`);
    if (!response.ok) throw new Error('目录读取失败');
    library = await response.json();
    appTitle = '本地视频放映室';
    $('brandTitle').textContent = appTitle;
    $('brandSubtitle').textContent = '打开自己的视频，按自己的节奏观看';
    $('sourceHint').textContent = '视频目录默认为包内 videos。也可修改 video-directory.txt 指定已有目录；修改后停止并重新Start Player.cmd。';
    all = [];
    for (const course of library.courses) for (const chapter of course.chapters) for (const item of chapter.videos) all.push({...item, course, chapter});
    byId = new Map(all.map(v => [v.id, v]));
    $('libraryCount').textContent = `${library.courses.length} 门 · ${library.videoCount} 集`;
    $('course').replaceChildren(...library.courses.map(c => {
      const option = document.createElement('option');
      option.value = c.id; option.textContent = c.title; return option;
    }));
    if (current && byId.has(current.id)) {
      current = byId.get(current.id);
      if (!library.courses.some(c => c.id === browseCourse)) browseCourse = current.course.id;
      $('course').value = browseCourse;
      renderChapters(); updateNext();
    } else if (all.length) {
      selectVideo(byId.has(state.last) ? state.last : all[0].id, false);
    } else {
      saveProgress(); ready = false; current = null; video.pause(); video.removeAttribute('src'); video.load();
      $('startOverlay').hidden = true;
      $('lessonTitle').textContent = '还没有视频，请先添加自己的视频';
      $('lessonNumber').textContent = ''; $('breadcrumb').textContent = '本地课程';
      renderChapters(); updateNext();
    }
    $('pageError').hidden = true;
    if (refresh) toast('课程目录已更新');
  } catch (_) {
    $('pageError').textContent = '无法读取课程目录。请重新双击「Start Player.cmd」，再刷新此页面。';
    $('pageError').hidden = false;
  } finally { $('refresh').disabled = false; }
}

video.volume = state.volume;
video.muted = state.muted === true;
$('speed').value = String(state.rate);
$('autoplay').checked = state.auto;
$('scope').value = state.scope;
video.addEventListener('loadedmetadata', () => {
  ready = true;
  if (Number.isFinite(video.duration) && pendingPosition > 0) video.currentTime = Math.min(pendingPosition, Math.max(0, video.duration - 1));
  pendingPosition = 0;
  video.playbackRate = state.rate;
});
video.addEventListener('play', () => { $('startOverlay').hidden = true; });
video.addEventListener('pause', () => saveProgress());
video.addEventListener('seeked', () => saveProgress());
video.addEventListener('timeupdate', () => {
  if (Date.now() - lastSave > 2500) { saveProgress(); lastSave = Date.now(); }
});
video.addEventListener('ended', () => {
  saveProgress(true);
  if (state.auto && adjacent(1)) navigate(1);
  else { renderChapters(); toast(adjacent(1) ? '本集已结束' : '本课程已播放完毕'); }
});
video.addEventListener('volumechange', () => { state.volume = video.volume; state.muted = video.muted; persist(); });
video.addEventListener('ratechange', () => {
  // A fresh source may briefly reset playbackRate before metadata arrives.
  if (!ready) return;
  state.rate = video.playbackRate;
  $('speed').value = String(state.rate); persist();
});
video.addEventListener('error', () => {
  if (!current || !video.getAttribute('src')) return;
  $('startOverlay').hidden = true;
  $('videoError').hidden = false;
  $('errorText').textContent = video.error?.code === 4 || video.error?.code === 3
    ? '此视频可能使用了 浏览器不支持的编码，或文件不完整。可先选择其他课时；原文件：' + current.file
    : '视频读取失败，请检查文件是否仍在资料文件夹，或重新Start Player.cmd后重试。';
});
$('startOverlay').addEventListener('click', play);
$('retry').addEventListener('click', () => current && selectVideo(current.id));
$('previous').addEventListener('click', () => navigate(-1));
$('next').addEventListener('click', () => navigate(1));
$('playNext').addEventListener('click', () => navigate(1));
$('speed').addEventListener('change', () => { state.rate = Number($('speed').value); video.playbackRate = state.rate; persist(); });
$('autoplay').addEventListener('change', () => { state.auto = $('autoplay').checked; persist(); });
$('scope').addEventListener('change', () => { state.scope = $('scope').value; persist(); updateNext(); });
$('course').addEventListener('change', () => { browseCourse = $('course').value; $('search').value = ''; renderChapters(); $('chapters').scrollTop = 0; });
$('search').addEventListener('input', renderChapters);
$('locate').addEventListener('click', () => {
  if (!current) return;
  browseCourse = current.course.id; $('course').value = browseCourse; $('search').value = ''; renderChapters();
  document.querySelector('.lesson.active')?.scrollIntoView({block: 'nearest'});
});
$('refresh').addEventListener('click', () => loadLibrary(true));
function toggleWide() {
  const enabled = document.body.classList.toggle('wide');
  $('wide').setAttribute('aria-pressed', String(enabled));
  $('wide').textContent = enabled ? '▭ 退出宽屏' : '▭ 宽屏';
}
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('playerShell').requestFullscreen(); }
  catch (_) { toast('无法进入全屏，请使用视频右下角的全屏按钮'); }
}
$('wide').addEventListener('click', toggleWide);
$('fullscreen').addEventListener('click', fullscreen);
$('pip').hidden = !document.pictureInPictureEnabled;
$('pip').addEventListener('click', async () => {
  try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); }
  catch (_) { toast('请先加载并播放视频，再开启画中画'); }
});
$('help').addEventListener('click', () => $('helpDialog').showModal());
$('closeHelp').addEventListener('click', () => $('helpDialog').close());
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || $('helpDialog').open || /INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY|A/.test(event.target.tagName) || event.target.isContentEditable) return;
  const key = event.key.toLowerCase();
  if (![' ', 'k', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'f', 't', 'm', '[', ']', '/'].includes(key)) return;
  event.preventDefault();
  // Intercept before native browser media controls handle the same key.
  event.stopPropagation();
  if (event.repeat && [' ', 'k', 'f', 't', 'm'].includes(key)) return;
  if (key === ' ' || key === 'k') { if (video.paused) play(); else video.pause(); }
  if (key === 'arrowleft' || key === 'arrowright') {
    const direction = key === 'arrowleft' ? -1 : 1;
    if (event.shiftKey) navigate(direction);
    else if (ready && Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + direction * 5));
  }
  if (key === 'arrowup' || key === 'arrowdown') video.volume = Math.max(0, Math.min(1, video.volume + (key === 'arrowup' ? 0.05 : -0.05)));
  if (key === 'f') fullscreen();
  if (key === 't') toggleWide();
  if (key === 'm') video.muted = !video.muted;
  if (key === '/') $('search').focus();
  if (key === '[' || key === ']') {
    const index = Math.max(0, rates.indexOf(state.rate));
    state.rate = rates[Math.max(0, Math.min(rates.length - 1, index + (key === ']' ? 1 : -1)))];
    video.playbackRate = state.rate; $('speed').value = String(state.rate); persist(); toast(`播放速度 ${state.rate}×`);
  }
}, {capture: true});
window.addEventListener('pagehide', () => saveProgress());
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
loadLibrary();

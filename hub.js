/* KM-Crew 허브 — 10개 아이디어를 한 창에서 목록 → 상세(체험 + 기획) 로 본다.
   체험 화면은 같은 사이트(km-crew.github.io/<저장소>/)를 iframe으로 넣어 새 창을 열지 않는다.
   회의 점수는 이 기기(localStorage)에만 저장된다. */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const ALLOW = 'camera; microphone; geolocation; clipboard-write; fullscreen; web-share; screen-wake-lock; autoplay';

const SCORE_KEYS = [['fun', '재미'], ['use', '쓸모'], ['doable', '완성 가능성']];
function getScores() { try { return JSON.parse(localStorage.getItem('hub-scores') || '{}'); } catch (e) { return {}; } }
function setScores(s) { try { localStorage.setItem('hub-scores', JSON.stringify(s)); } catch (e) { /* 저장 불가 */ } }
const total = sc => sc ? SCORE_KEYS.reduce((a, [k]) => a + (sc[k] || 0), 0) : 0;
const appUrl = repo => `/${repo}/`;
const award = a => a.endsWith('상') ? a : a + '상';

function route() {
  const hash = location.hash.slice(1) || '/';
  document.body.classList.remove('noscroll');
  window.scrollTo(0, 0);
  if (hash.startsWith('/p/')) return detail(hash.slice(3));
  if (hash === '/compare') return compare();
  return home();
}

/* ---------- 목록 ---------- */
function home() {
  const scores = getScores();
  app.className = '';
  app.innerHTML = `
    <section class="intro">
      <h1>공모전 후보 10개,<br>직접 눌러 보고 하나 고르기</h1>
      <p class="muted">하입소문 서비스 공모전(접수 마감 11/30 23:59, 계정당 1개 제출)에 낼 서비스를 고르기 위한 프로토타입 모음이에요. 카드를 누르면 같은 창에서 체험 화면과 기획서가 열려요.</p>
    </section>
    <section class="grid">${IDEAS.map(i => {
      const t = total(scores[i.repo]);
      return `<a class="tile" href="#/p/${i.repo}" style="--c:${i.color}">
        <div class="tno">${String(i.no).padStart(2, '0')}</div>
        <div class="temoji">${i.emoji}</div>
        <div class="ttitle">${esc(i.title)}</div>
        <div class="tone">${esc(i.one)}</div>
        <div class="tmeta"><span>난이도 ${esc(i.level)}</span>${i.awards.map(a => `<span>${esc(award(a))}</span>`).join('')}${t ? `<span class="mine">내 점수 ${t}/15</span>` : ''}</div>
      </a>`;
    }).join('')}</section>
    <p class="muted small center">KM-Crew 프로토타입 · 회의 점수는 이 기기에만 저장돼요</p>`;
}

/* ---------- 상세 ---------- */
function detail(repo) {
  const k = IDEAS.findIndex(i => i.repo === repo);
  if (k < 0) { location.hash = '#/'; return; }
  const i = IDEAS[k], prev = IDEAS[(k + IDEAS.length - 1) % IDEAS.length], next = IDEAS[(k + 1) % IDEAS.length];
  const sc = getScores()[repo] || {};
  app.className = 'wide';
  app.innerHTML = `
    <nav class="crumbs"><a href="#/">← 목록</a><span class="grow"></span><a href="#/p/${prev.repo}">‹ ${esc(prev.title)}</a><a href="#/p/${next.repo}">${esc(next.title)} ›</a></nav>
    <header class="dhead" style="--c:${i.color}">
      <div class="demoji">${i.emoji}</div>
      <div class="grow">
        <div class="dno">아이디어 #${i.no}</div>
        <h1>${esc(i.title)}</h1>
        <p class="done">${esc(i.one)}</p>
        <p class="dorig">원안: “${esc(i.idea)}”</p>
      </div>
    </header>
    <div class="dgrid">
      <section class="phonecol">
        <div class="viewbar"><div class="seg" id="seg"><button data-m="mobile">📱 모바일</button><button data-m="pc">🖥 PC</button></div>
          <span class="grow"></span><button class="btn" id="reload">↻ 처음부터</button><button class="btn primary" id="gofull">⛶ 크게 체험</button></div>
        <div class="stagebox" id="stagebox">
          <div class="fullbar"><button id="fullclose">← 상세로 돌아가기</button><span>${esc(i.title)}</span><span class="grow"></span><span class="muted small">Esc</span></div>
          <div class="chrome"><i></i><i></i><i></i><span class="url">km-crew.github.io/${esc(i.repo)}/</span></div>
          <div class="vp" id="vp"></div>
        </div>
      </section>
      <section class="infocol">
        <div class="facts">
          <div><b>난이도</b><span>${esc(i.level)}</span></div>
          <div><b>노릴 상</b><span>${i.awards.map(a => esc(award(a))).join(', ')}</span></div>
          <div><b>외부 의존</b><span>${esc(i.deps)}</span></div>
          <div><b>걸리는 점</b><span>${esc(i.risk)}</span></div>
        </div>
        <div class="card score">
          <b>회의 점수 (이 기기에만 저장)</b>
          ${SCORE_KEYS.map(([key, label]) => `<div class="srow"><span>${label}</span><div class="stars" data-k="${key}">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}" class="${(sc[key] || 0) >= n ? 'on' : ''}" aria-label="${label} ${n}점">★</button>`).join('')}</div></div>`).join('')}
          <textarea id="memo" rows="2" placeholder="회의 메모">${esc(sc.memo || '')}</textarea>
        </div>
        <div class="plan card"><div class="plantitle">기획서 <span class="muted small">(${esc(i.repo)}/PLAN.md)</span></div><div id="plan" class="md">불러오는 중…</div></div>
        <p class="small muted">코드 저장소: <a href="https://github.com/KM-Crew/${esc(i.repo)}" target="_top">github.com/KM-Crew/${esc(i.repo)}</a></p>
      </section>
    </div>`;
  // 체험 화면(iframe). iframe을 DOM에서 옮기면 새로 로드되므로, 틀의 크기·모양만 바꿔
  // 모바일 ↔ PC ↔ 크게 보기를 전환한다(진행 중인 상태 유지). 앱은 iframe 폭으로 PC/모바일 배치를 고름.
  const frame = document.createElement('iframe');
  frame.src = appUrl(repo);
  frame.title = i.title + ' 체험 화면';
  frame.allow = ALLOW;
  frame.setAttribute('allowfullscreen', '');
  $('#vp').append(frame);
  setMode(getMode());
  $$('#seg button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  $('#gofull').onclick = () => setFull(true);
  $('#fullclose').onclick = () => setFull(false);
  $('#reload').onclick = () => { frame.src = appUrl(repo) + '?r=' + Date.now(); };
  // 점수
  const save = () => { const all = getScores(); all[repo] = sc; setScores(all); };
  $$('.stars').forEach(row => $$('button', row).forEach(b => b.onclick = () => {
    const key = row.dataset.k, n = Number(b.dataset.n);
    sc[key] = sc[key] === n ? 0 : n; save();
    $$('button', row).forEach(x => x.classList.toggle('on', Number(x.dataset.n) <= sc[key]));
  }));
  $('#memo').oninput = e => { sc.memo = e.target.value; save(); };
  // 기획서
  fetch(`/${repo}/PLAN.md`, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(md => {
    const cut = md.indexOf('\n## 공통 조건');
    const body = (cut > 0 ? md.slice(0, cut) : md).replace(/^# .*\n/, '').replace(/^> .*\n/m, '');
    $('#plan').innerHTML = window.marked ? marked.parse(body, { mangle: false, headerIds: false }) : `<pre>${esc(body)}</pre>`;
    $$('#plan a').forEach(a => { a.target = '_top'; });
  }).catch(() => { $('#plan').innerHTML = `<p class="muted">기획서를 불러오지 못했어요. 저장소의 PLAN.md를 확인하세요.</p>`; });
}

/* ---------- 체험 틀: 모바일 / PC / 크게 보기 ---------- */
const PC_W = 1280, PC_H = 800;
function getMode() {
  try { const m = localStorage.getItem('hub-view'); if (m === 'pc' || m === 'mobile') return m; } catch (e) { /* 무시 */ }
  return innerWidth >= 1100 ? 'pc' : 'mobile';
}
function setMode(m) {
  try { localStorage.setItem('hub-view', m); } catch (e) { /* 무시 */ }
  const box = $('#stagebox');
  if (!box) return;
  box.classList.toggle('pcmode', m === 'pc');
  box.classList.toggle('mobilemode', m !== 'pc');
  const grid = $('.dgrid');
  if (grid) grid.classList.toggle('pcgrid', m === 'pc');
  $$('#seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  fitPc();
}
function fitPc() {
  const box = $('#stagebox'), vp = $('#vp'), f = vp && $('iframe', vp);
  if (!f) return;
  if (box.classList.contains('pcmode') && !box.classList.contains('full')) {
    const sc = vp.clientWidth / PC_W;
    f.style.width = PC_W + 'px';
    f.style.height = PC_H + 'px';
    f.style.transform = `scale(${sc})`;
    vp.style.height = (PC_H * sc) + 'px';
  } else {
    f.style.width = ''; f.style.height = ''; f.style.transform = '';
    vp.style.height = '';
  }
}
function setFull(on) {
  const box = $('#stagebox');
  if (!box) return;
  box.classList.toggle('full', on);
  document.body.classList.toggle('noscroll', on);
  fitPc();
}
addEventListener('resize', fitPc);
addEventListener('keydown', e => { if (e.key === 'Escape' && $('#stagebox.full')) setFull(false); });

/* ---------- 한눈에 비교 ---------- */
function compare() {
  const scores = getScores();
  const rows = IDEAS.map(i => ({ i, s: scores[i.repo] || {}, t: total(scores[i.repo]) }));
  const ranked = rows.slice().sort((a, b) => b.t - a.t || a.i.no - b.i.no);
  app.className = 'wide';
  app.innerHTML = `
    <nav class="crumbs"><a href="#/">← 목록</a></nav>
    <h1>한눈에 비교</h1>
    <p class="muted">점수를 매긴 아이디어가 위로 올라와요. 점수는 각 상세 화면에서 매기고, 이 기기에만 저장돼요.</p>
    <div class="tablewrap"><table class="cmp">
      <thead><tr><th>#</th><th>서비스</th><th>난이도</th><th>노릴 상</th><th>외부 의존</th><th>걸리는 점</th>${SCORE_KEYS.map(([, l]) => `<th>${l}</th>`).join('')}<th>합계</th></tr></thead>
      <tbody>${ranked.map(({ i, s, t }) => `<tr>
        <td>${i.no}</td><td><a href="#/p/${i.repo}">${i.emoji} ${esc(i.title)}</a></td><td>${esc(i.level)}</td>
        <td>${i.awards.map(a => esc(award(a))).join(', ')}</td><td>${esc(i.deps)}</td><td class="risk">${esc(i.risk)}</td>
        ${SCORE_KEYS.map(([k]) => `<td class="num">${s[k] || '-'}</td>`).join('')}<td class="num"><b>${t || '-'}</b></td></tr>`).join('')}</tbody>
    </table></div>
    <div class="card" style="margin-top:16px"><b>고를 때 볼 것</b><ol class="small">
      <li>30초 안에 재미나 쓸모가 보이는가 (투표자는 여러 서비스를 훑어봄)</li>
      <li>리뷰를 쓰고 싶어지는가 (별점 + 리뷰가 있어야 유효 투표)</li>
      <li>11/30까지 2명이 끝낼 수 있는가 (제출 후 수정 불가)</li>
      <li>12/1~12/9 동안 안정적으로 접속되는가 (외부 API·할당량)</li>
      <li>반려 위험이 없는가 (저작권·상표, 비방·유해 콘텐츠)</li></ol></div>`;
}

addEventListener('hashchange', route);
route();

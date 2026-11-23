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
const rated = sc => !!sc && SCORE_KEYS.some(([k]) => sc[k] > 0);
function lsGet(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } }
const getNick = () => { try { return localStorage.getItem('hub-nick') || ''; } catch (e) { return ''; } };
const setNick = v => { try { localStorage.setItem('hub-nick', v); } catch (e) { /* 무시 */ } };
const getPeers = () => { const p = lsGet('hub-peers', []); return Array.isArray(p) ? p.map(cleanPeer).filter(Boolean) : []; };
const setPeers = p => lsSet('hub-peers', p);
const LEVEL_ORDER = ['낮음', '낮음~중간', '중간', '높음'];
const levelRank = l => { const k = LEVEL_ORDER.indexOf(l); return k < 0 ? 9 : k; };

/* ---------- 회의 모드: 점수를 링크로 주고받기 ----------
   서버 없이 링크 안에 점수를 담는다: #/meet?d=<base64url(JSON)>
   JSON = { v:1, n:'별명', s:{ '아이디어 번호': [재미, 쓸모, 완성 가능성, '메모'] } } */
const NICK_MAX = 12, MEMO_MAX = 120;
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s) || s.length > 8000) throw new Error('형식');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
const cleanText = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const cleanStar = v => Number.isInteger(v) && v >= 0 && v <= 5 ? v : 0;
function cleanScores(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const i of IDEAS) {
    const sc = obj[i.repo];
    if (!sc || typeof sc !== 'object') continue;
    const c = {}; SCORE_KEYS.forEach(([k]) => { c[k] = cleanStar(sc[k]); });
    const memo = cleanText(sc.memo, MEMO_MAX); if (memo) c.memo = memo;
    if (rated(c) || memo) out[i.repo] = c;
  }
  return out;
}
function cleanPeer(p) {
  if (!p || typeof p !== 'object') return null;
  const nick = cleanText(p.nick, NICK_MAX);
  if (!nick) return null;
  return { nick, scores: cleanScores(p.scores), at: Number.isFinite(p.at) ? p.at : 0 };
}
function encodeShare(nick, scores) {
  const s = {};
  for (const i of IDEAS) {
    const sc = scores[i.repo];
    if (!sc) continue;
    const memo = cleanText(sc.memo, MEMO_MAX);
    if (!rated(sc) && !memo) continue;
    const a = SCORE_KEYS.map(([k]) => cleanStar(sc[k]));
    if (memo) a.push(memo);
    s[i.no] = a;
  }
  return b64urlEncode(JSON.stringify({ v: 1, n: cleanText(nick, NICK_MAX) || '이름 없음', s }));
}
/* 링크 값 → { nick, scores } (이상한 값이면 예외) */
function decodeShare(d) {
  const o = JSON.parse(b64urlDecode(d));
  if (!o || o.v !== 1 || typeof o.s !== 'object' || o.s === null || Array.isArray(o.s)) throw new Error('형식');
  const nick = cleanText(o.n, NICK_MAX) || '이름 없음';
  const raw = {};
  for (const [no, a] of Object.entries(o.s)) {
    const idea = IDEAS.find(i => String(i.no) === no);
    if (!idea || !Array.isArray(a)) continue;
    const sc = {}; SCORE_KEYS.forEach(([k], j) => { sc[k] = a[j]; }); sc.memo = a[3];
    raw[idea.repo] = sc;
  }
  return { nick, scores: cleanScores(raw) };
}
const shareUrl = d => location.origin + location.pathname + '#/meet?d=' + d;
function parseQuery(h) { const q = {}; const k = h.indexOf('?'); if (k >= 0) new URLSearchParams(h.slice(k + 1)).forEach((v, n) => { q[n] = v; }); return q; }
/* 회의에 모인 사람 전부(나 + 합친 사람) */
function people() {
  const me = { nick: getNick() || '나', scores: cleanScores(getScores()), me: true };
  return [me, ...getPeers()];
}
/* 아이디어 하나의 팀 집계: 점수를 매긴 사람만 평균 */
function teamStat(repo, ppl = people()) {
  const ts = ppl.filter(p => rated(p.scores[repo])).map(p => total(p.scores[repo]));
  if (!ts.length) return { n: 0, avg: 0, gap: 0, list: ts };
  return { n: ts.length, avg: ts.reduce((a, b) => a + b, 0) / ts.length, gap: Math.max(...ts) - Math.min(...ts), list: ts };
}
const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 2200);
}
async function copyText(text, input) {
  try { await navigator.clipboard.writeText(text); toast('링크를 복사했어요'); return true; }
  catch (e) {
    if (input) { input.focus(); input.select(); }
    try { if (document.execCommand('copy')) { toast('링크를 복사했어요'); return true; } } catch (e2) { /* 무시 */ }
    toast('자동 복사가 안 돼요. 링크를 길게 눌러 복사하세요'); return false;
  }
}
/* 정렬되는 표: 머리글 버튼을 누르면 정렬, 같은 칸을 다시 누르면 순서 반대 */
function sortRows(rows, cols, st) {
  const c = cols.find(x => x.key === st.key) || cols[0];
  const dir = st.dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const va = c.val(a), vb = c.val(b);
    const r = typeof va === 'string' ? va.localeCompare(vb, 'ko') : va - vb;
    return r * dir || a.i.no - b.i.no;
  });
}
function sortHead(cols, st, id) {
  return `<tr>${cols.map(c => {
    if (!c.val) return `<th>${c.label}</th>`;
    const on = st.key === c.key;
    const aria = on ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th aria-sort="${aria}"${c.num ? ' class="num"' : ''}><button class="sorth${on ? ' on' : ''}" data-sort="${c.key}" data-t="${id}">${c.label}<i aria-hidden="true">${on ? (st.dir === 'asc' ? '▲' : '▼') : '↕'}</i></button></th>`;
  }).join('')}</tr>`;
}
function bindSort(id, st, rerender) {
  $$(`[data-t="${id}"]`).forEach(b => b.onclick = () => {
    const k = b.dataset.sort;
    if (st.key === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
    else { st.key = k; st.dir = b.closest('th').classList.contains('num') ? 'desc' : 'asc'; }
    rerender();
    const nb = $(`[data-t="${id}"][data-sort="${k}"]`); if (nb) nb.focus();
  });
}
const appUrl = repo => `/${repo}/`;
const award = a => a.endsWith('상') ? a : a + '상';

function route() {
  const hash = location.hash.slice(1) || '/';
  document.body.classList.remove('noscroll');
  window.scrollTo(0, 0);
  if (hash.startsWith('/p/')) return detail(hash.slice(3));
  if (hash === '/compare') return compare();
  if (hash === '/meet' || hash.startsWith('/meet?')) return meet(parseQuery(hash));
  return home();
}

/* ---------- 목록 ---------- */
function home() {
  const scores = getScores(), ppl = people();
  app.className = '';
  app.innerHTML = `
    <section class="intro">
      <h1>공모전 후보 10개,<br>직접 눌러 보고 하나 고르기</h1>
      <p class="muted">하입소문 서비스 공모전(접수 마감 11/30 23:59, 계정당 1개 제출)에 낼 서비스를 고르기 위한 프로토타입 모음이에요. 카드를 누르면 같은 창에서 체험 화면과 기획서가 열려요.</p>
    </section>
    <section class="grid">${IDEAS.map(i => {
      const t = total(scores[i.repo]);
      const ts = teamStat(i.repo, ppl);
      return `<a class="tile" href="#/p/${i.repo}" style="--c:${i.color}">
        <div class="tthumb"><img src="${appUrl(i.repo)}og.png" alt="" loading="lazy" decoding="async" width="1200" height="630" onerror="this.parentNode.classList.add('noimg')"><span class="tno">${String(i.no).padStart(2, '0')}</span></div>
        <div class="ttitle"><span class="temoji" aria-hidden="true">${i.emoji}</span>${esc(i.title)}</div>
        <div class="tone">${esc(i.one)}</div>
        <div class="tmeta"><span>난이도 ${esc(i.level)}</span>${i.awards.map(a => `<span>${esc(award(a))}</span>`).join('')}${t ? `<span class="mine">내 점수 ${t}/15</span>` : ''}${ppl.length > 1 && ts.n ? `<span class="team">팀 평균 ${fmt1(ts.avg)} (${ts.n}명)</span>` : ''}</div>
      </a>`;
    }).join('')}</section>
    <p class="muted small center">KM-Crew 프로토타입 · 회의 점수는 이 기기에만 저장돼요 · <a href="#/meet">회의 모드에서 점수 합치기</a></p>`;
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
          <textarea id="memo" rows="2" maxlength="${MEMO_MAX}" placeholder="회의 메모">${esc(sc.memo || '')}</textarea>
          ${teamLine(repo)}
          <a class="small" href="#/meet">👥 회의 모드: 내 점수 링크 보내기·다른 사람 점수 합치기 →</a>
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

function teamLine(repo) {
  const peers = getPeers();
  if (!peers.length) return '';
  const items = peers.map(p => { const sc = p.scores[repo]; return `<span>${esc(p.nick)} ${rated(sc) ? total(sc) : '-'}</span>`; }).join('');
  const st = teamStat(repo);
  return `<div class="teamline small"><b>팀 점수</b>${items}${st.n ? `<span class="avg">평균 ${fmt1(st.avg)}/15</span>` : ''}</div>`;
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
const cmpSort = { key: 'total', dir: 'desc' };
function compare() {
  const scores = getScores(), ppl = people(), hasTeam = ppl.length > 1;
  const rows = IDEAS.map(i => ({ i, s: scores[i.repo] || {}, t: total(scores[i.repo]), team: teamStat(i.repo, ppl) }));
  const cols = [
    { key: 'no', label: '#', num: false, val: r => r.i.no },
    { key: 'title', label: '서비스', val: r => r.i.title },
    { key: 'level', label: '난이도', val: r => levelRank(r.i.level) },
    { key: 'awards', label: '노릴 상' }, { key: 'deps', label: '외부 의존' }, { key: 'risk', label: '걸리는 점' },
    ...SCORE_KEYS.map(([k, l]) => ({ key: k, label: l, num: true, val: r => r.s[k] || 0 })),
    { key: 'total', label: '합계', num: true, val: r => r.t },
    ...(hasTeam ? [{ key: 'team', label: `팀 평균(${ppl.length}명)`, num: true, val: r => r.team.avg }] : [])
  ];
  if (!cols.some(c => c.key === cmpSort.key && c.val)) { cmpSort.key = 'total'; cmpSort.dir = 'desc'; }
  const sorted = sortRows(rows, cols, cmpSort);
  app.className = 'wide';
  app.innerHTML = `
    <nav class="crumbs"><a href="#/">← 목록</a><span class="grow"></span><a href="#/meet">👥 회의 모드</a></nav>
    <h1>한눈에 비교</h1>
    <p class="muted">표 머리글을 누르면 그 기준으로 정렬돼요(다시 누르면 반대로). 점수는 각 상세 화면에서 매기고, 이 기기에만 저장돼요.${hasTeam ? ' 팀 평균은 회의 모드에서 합친 점수예요.' : ''}</p>
    <div class="tablewrap"><table class="cmp" id="cmp">
      <caption class="sr">아이디어 비교표, ${esc(cols.find(c => c.key === cmpSort.key).label)} 기준 ${cmpSort.dir === 'asc' ? '오름차순' : '내림차순'}</caption>
      <thead>${sortHead(cols, cmpSort, 'cmp')}</thead>
      <tbody>${sorted.map(({ i, s, t, team }) => `<tr data-repo="${i.repo}">
        <td>${i.no}</td><td><a href="#/p/${i.repo}">${i.emoji} ${esc(i.title)}</a></td><td><span class="lv lv${levelRank(i.level)}">${esc(i.level)}</span></td>
        <td>${i.awards.map(a => esc(award(a))).join(', ')}</td><td>${esc(i.deps)}</td><td class="risk">${esc(i.risk)}</td>
        ${SCORE_KEYS.map(([k]) => `<td class="num">${s[k] || '-'}</td>`).join('')}<td class="num"><b>${t || '-'}</b></td>
        ${hasTeam ? `<td class="num">${team.n ? `<b>${fmt1(team.avg)}</b>${team.gap >= 5 ? ' <span class="split" title="점수 차 ' + team.gap + '점">갈림</span>' : ''}` : '-'}</td>` : ''}</tr>`).join('')}</tbody>
    </table></div>
    <div class="card" style="margin-top:16px"><b>고를 때 볼 것</b><ol class="small">
      <li>30초 안에 재미나 쓸모가 보이는가 (투표자는 여러 서비스를 훑어봄)</li>
      <li>리뷰를 쓰고 싶어지는가 (별점 + 리뷰가 있어야 유효 투표)</li>
      <li>11/30까지 2명이 끝낼 수 있는가 (제출 후 수정 불가)</li>
      <li>12/1~12/9 동안 안정적으로 접속되는가 (외부 API·할당량)</li>
      <li>반려 위험이 없는가 (저작권·상표, 비방·유해 콘텐츠)</li></ol></div>`;
  bindSort('cmp', cmpSort, compare);
}

/* ---------- 회의 모드 ---------- */
const meetSort = { key: 'avg', dir: 'desc' };
function meet(q) {
  app.className = 'wide';
  let incoming = null, bad = false;
  if (q.d) { try { incoming = decodeShare(q.d); } catch (e) { bad = true; } }
  const peers = getPeers(), ppl = people(), mine = cleanScores(getScores());
  const myCount = IDEAS.filter(i => rated(mine[i.repo])).length;
  const rows = IDEAS.map(i => ({ i, st: teamStat(i.repo, ppl) }));
  const cols = [
    { key: 'rank', label: '순위' },
    { key: 'title', label: '서비스', val: r => r.i.title },
    ...ppl.map((p, k) => ({ key: 'p' + k, label: esc(p.nick) + (p.me ? ' (나)' : ''), num: true, val: r => rated(p.scores[r.i.repo]) ? total(p.scores[r.i.repo]) : -1 })),
    { key: 'avg', label: '평균', num: true, val: r => r.st.n ? r.st.avg : -1 },
    { key: 'gap', label: '점수 차', num: true, val: r => r.st.n > 1 ? r.st.gap : -1 }
  ];
  if (!cols.some(c => c.key === meetSort.key && c.val)) { meetSort.key = 'avg'; meetSort.dir = 'desc'; }
  const sorted = sortRows(rows, cols, meetSort);
  // 순위는 정렬과 상관없이 평균 기준(같은 평균이면 같은 순위)
  const avgs = rows.filter(r => r.st.n).map(r => r.st.avg).sort((a, b) => b - a);
  const rankOf = r => r.st.n ? avgs.findIndex(v => Math.abs(v - r.st.avg) < 1e-9) + 1 : 0;
  const medal = n => ['', '🥇', '🥈', '🥉'][n] || (n ? n + '위' : '-');
  const memos = IDEAS.map(i => ({ i, list: ppl.filter(p => p.scores[i.repo] && p.scores[i.repo].memo).map(p => ({ nick: p.nick, me: p.me, memo: p.scores[i.repo].memo })) })).filter(x => x.list.length);
  const existing = incoming && peers.find(p => p.nick === incoming.nick);
  const inCount = incoming ? IDEAS.filter(i => rated(incoming.scores[i.repo])).length : 0;
  app.innerHTML = `
    <nav class="crumbs"><a href="#/">← 목록</a><span class="grow"></span><a href="#/compare">한눈에 비교</a></nav>
    <h1>👥 회의 모드</h1>
    <p class="muted">각자 자기 기기에서 별점을 매긴 뒤 <b>내 점수 링크</b>를 메신저로 보내고, 받은 링크를 열어 <b>합치기</b>를 누르면 모두의 점수가 한 표에 모여요. 서버 없이 링크 안에 점수가 들어 있어요(실명 대신 별명을 쓰세요).</p>
    ${bad ? `<div class="card notice bad" id="badlink"><b>링크가 깨졌어요</b><p class="small">주소가 중간에 잘렸거나 잘못 복사된 것 같아요. 보낸 사람에게 링크를 다시 받아 주세요.</p><a class="btn" href="#/meet">회의 모드로</a></div>` : ''}
    ${incoming ? `<div class="card notice" id="incoming">
      <b>📨 ${esc(incoming.nick)} 님의 점수가 도착했어요</b>
      <p class="small muted">${inCount}개 아이디어에 점수를 매겼어요.${existing ? ' 같은 별명으로 이미 합친 점수가 있어 새 점수로 바꿔요.' : ''}</p>
      <div class="chips">${IDEAS.filter(i => rated(incoming.scores[i.repo])).map(i => `<span>${i.emoji} ${esc(i.title)} <b>${total(incoming.scores[i.repo])}</b></span>`).join('') || '<span>매긴 점수 없음</span>'}</div>
      <div class="row"><button class="btn primary" id="merge">합치기</button><a class="btn" href="#/meet">합치지 않기</a></div></div>` : ''}
    <div class="meetgrid">
      <section class="card">
        <b>1. 내 점수 보내기</b>
        <label class="field"><span class="small muted">내 별명 (링크에 담겨요, 최대 ${NICK_MAX}자)</span><input id="nick" maxlength="${NICK_MAX}" placeholder="예: 기획 담당, A" value="${esc(getNick())}"></label>
        <p class="small muted" id="mycount">지금 ${myCount}/10개에 점수를 매겼어요.${myCount < 10 ? ' 상세 화면에서 별점을 더 매길 수 있어요.' : ''}</p>
        <div class="row"><button class="btn primary" id="mklink"${myCount ? '' : ' disabled'}>📤 내 점수 링크 만들기</button></div>
        <div class="linkbox hidden" id="linkbox"><input id="mylink" readonly aria-label="내 점수 링크"><button class="btn" id="copy">복사</button></div>
      </section>
      <section class="card">
        <b>2. 받은 점수 합치기</b>
        <label class="field"><span class="small muted">받은 링크를 붙여 넣어도 돼요</span><span class="linkbox"><input id="paste" placeholder="https://km-crew.github.io/#/meet?d=…"><button class="btn" id="pastego">열기</button></span></label>
        <div class="peers" id="peers">${peers.length ? peers.map((p, k) => `<span class="peer"><b>${esc(p.nick)}</b> ${IDEAS.filter(i => rated(p.scores[i.repo])).length}개<button class="x" data-del="${k}" aria-label="${esc(p.nick)} 점수 빼기" title="빼기">✕</button></span>`).join('') : '<span class="muted small">아직 합친 사람이 없어요.</span>'}</div>
        ${peers.length ? '<button class="btn small" id="clearpeers">합친 점수 모두 지우기</button>' : ''}
      </section>
    </div>
    <h2 class="meeth">합친 결과 <span class="muted small">${ppl.length}명 · 평균은 점수를 매긴 사람만 계산 · 머리글을 누르면 정렬</span></h2>
    <div class="tablewrap"><table class="cmp meet" id="meettable">
      <caption class="sr">회의 점수 합친 결과</caption>
      <thead>${sortHead(cols, meetSort, 'meet')}</thead>
      <tbody>${sorted.map(r => { const n = rankOf(r); return `<tr data-repo="${r.i.repo}" class="${n && n <= 3 ? 'top' + n : ''}">
        <td class="rank">${medal(n)}</td><td><a href="#/p/${r.i.repo}">${r.i.emoji} ${esc(r.i.title)}</a></td>
        ${ppl.map(p => { const sc = p.scores[r.i.repo]; return `<td class="num"${rated(sc) ? ` title="${SCORE_KEYS.map(([k, l]) => l + ' ' + sc[k]).join(' · ')}"` : ''}>${rated(sc) ? total(sc) : '-'}</td>`; }).join('')}
        <td class="num"><b>${r.st.n ? fmt1(r.st.avg) : '-'}</b></td>
        <td class="num">${r.st.n > 1 ? r.st.gap + (r.st.gap >= 5 ? ' <span class="split">갈림</span>' : '') : '-'}</td></tr>`; }).join('')}</tbody>
    </table></div>
    ${memos.length ? `<h2 class="meeth">메모 모아 보기</h2><div class="memos">${memos.map(x => `<div class="card"><b>${x.i.emoji} ${esc(x.i.title)}</b>${x.list.map(m => `<p class="small"><span class="who">${esc(m.nick)}${m.me ? ' (나)' : ''}</span> ${esc(m.memo)}</p>`).join('')}</div>`).join('')}</div>` : ''}
    <p class="small muted">점수 차가 5점 이상이면 '갈림'으로 표시돼요. 회의에서 먼저 이야기해 볼 아이디어예요.</p>`;

  $('#nick').oninput = e => { setNick(cleanText(e.target.value, NICK_MAX)); $('#linkbox').classList.add('hidden'); };
  $('#mklink').onclick = () => {
    if (!getNick()) { $('#nick').focus(); toast('먼저 별명을 적어 주세요'); return; }
    const url = shareUrl(encodeShare(getNick(), getScores()));
    $('#mylink').value = url; $('#linkbox').classList.remove('hidden');
    copyText(url, $('#mylink'));
  };
  $('#copy').onclick = () => copyText($('#mylink').value, $('#mylink'));
  const openPasted = () => {
    const v = $('#paste').value.trim(), m = v.match(/[#&?]d=([A-Za-z0-9_-]+)/) || v.match(/^([A-Za-z0-9_-]{8,})$/);
    if (!m) { toast('회의 모드 링크가 아니에요'); return; }
    location.hash = '#/meet?d=' + m[1];
  };
  $('#pastego').onclick = openPasted;
  $('#paste').onkeydown = e => { if (e.key === 'Enter') openPasted(); };
  $$('[data-del]').forEach(b => b.onclick = () => { const p = getPeers(); const [gone] = p.splice(Number(b.dataset.del), 1); setPeers(p); toast(`${gone.nick} 님 점수를 뺐어요`); meet({}); });
  const cl = $('#clearpeers'); if (cl) cl.onclick = () => { if (confirm('합친 점수를 모두 지울까요? 내 점수는 그대로예요.')) { setPeers([]); meet({}); } };
  const mg = $('#merge');
  if (mg) mg.onclick = () => {
    const p = getPeers().filter(x => x.nick !== incoming.nick);
    p.push({ nick: incoming.nick, scores: incoming.scores, at: Date.now() });
    setPeers(p.slice(-12));
    toast(`${incoming.nick} 님 점수를 합쳤어요`);
    history.replaceState(null, '', '#/meet');
    meet({});
  };
  bindSort('meet', meetSort, () => meet(q));
}

addEventListener('hashchange', route);
route();

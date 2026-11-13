'use strict';
// 今日やること: guide.json を読んで1〜5日目のやることを出し、「できた」をブラウザにだけ保存する

const KEY = 'fwg-done'; // { やることid: できた日時(ISO) }
const DAYS = [1, 2, 3, 4, 5];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let guide = null;
let today = null; // { day, note }
let sel = 1;
let done = {};

// ---- できた記録(読めない・書けないときも表示は続ける) ----
function loadDone() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) { return {}; }
}
function saveDone() {
  try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* 保存できなくても画面はそのまま */ }
}
function toggle(id) {
  if (done[id]) delete done[id];
  else done[id] = new Date().toISOString();
  saveDone();
  render(id);
}

// ---- 日付 ----
function dateOf(n) {
  const [y, m, d] = guide.settings.startDate.split('-').map(Number);
  return new Date(y, m - 1, d + n - 1);
}
function fmt(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日(${'日月火水木金土'[d.getDay()]})`;
}
function whichDay() {
  // 確認用: ?day=3 で何日目かを固定できる
  const p = Number(new URLSearchParams(location.search).get('day'));
  if (DAYS.includes(p)) return { day: p, note: '' };
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - dateOf(1)) / 864e5);
  if (diff < 0) return { day: 1, note: `まだ始まっていません。${fmt(dateOf(1))}が1日目です` };
  if (diff > 4) return { day: 5, note: '最初の週は終わりました' };
  return { day: diff + 1, note: '' };
}

// ---- 表示 ----
const tasksOf = (n) => guide.tasks.filter((t) => t.day === n).sort((a, b) => a.order - b.order);

function card(t, i) {
  const d = !!done[t.id];
  return `<article class="card${d ? ' done' : ''}">`
    + `<span class="num" aria-hidden="true">${d ? '✓' : i + 1}</span>`
    + `<h2>${esc(t.title)}</h2>`
    + (t.desc ? `<p>${esc(t.desc)}</p>` : '')
    + `<button type="button" class="doneBtn" data-task="${esc(t.id)}" aria-pressed="${d}">${d ? 'できた・取り消す' : 'できた'}</button>`
    + `</article>`;
}

function render(focusTask) {
  $('title').textContent = sel === today.day ? '今日やること' : `${sel}日目にやること`;
  $('date').textContent = `${sel}日目・${fmt(dateOf(sel))}`;

  $('days').innerHTML = DAYS.map((n) =>
    `<button type="button" data-day="${n}" aria-pressed="${n === sel}">${n === today.day ? '今日' : n + '日目'}</button>`
  ).join('');

  const ts = tasksOf(sel);
  const dn = ts.filter((t) => done[t.id]).length;
  $('bar').style.width = ts.length ? `${(dn / ts.length) * 100}%` : '0';
  $('ptext').textContent = !ts.length ? '' : dn === ts.length ? '全部できました' : `${ts.length}つのうち${dn}つできた`;

  // まだのカードが上、できたカードが下
  const ordered = [...ts.filter((t) => !done[t.id]), ...ts.filter((t) => done[t.id])];
  $('cards').innerHTML = ts.length
    ? ordered.map((t) => card(t, ts.indexOf(t))).join('')
    : '<p class="empty">この日のやることはまだありません</p>';

  // 押したボタンにフォーカスを戻す(キーボード操作のため)
  if (focusTask) {
    const b = $('cards').querySelector(`[data-task="${CSS.escape(focusTask)}"]`);
    if (b) b.focus();
  }
}

// ---- 誰に聞く?(B)・答えの詳細(C) ----
// 画面は URL の # で切り替える: なし=A、#ask(=言葉)=B、#a/質問id=C。ブラウザの戻るも使える
const CATS = ['総務', 'IT', '人事'];
const catOf = (x) => (x.wiki || '').split('>')[0].trim() || 'その他';
const qById = (id) => guide.questions.find((x) => x.id === id);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
let moved = false; // このページの中で画面を移ったか(「戻る」で使う)

function askRow(x) {
  const check = x.status === '要確認' ? '・要確認' : '';
  return `<li><a class="hit" href="#a/${encodeURIComponent(x.id)}">`
    + `<span class="hq">${esc(x.question)}</span>`
    + `<span class="hr">${esc(x.role)}${check}</span></a></li>`;
}

function renderHits(word) {
  const w = norm(word);
  const hits = guide.questions.filter((x) =>
    !w || [x.question, x.answer, x.wiki, x.role].some((v) => norm(v).includes(w)));
  if (!hits.length) {
    $('hits').innerHTML = `<div class="none"><p>「${esc(word.trim())}」はこのガイドにはまだありません。</p>`
      + `<div class="who"><span>聞く人</span><strong>${esc(guide.settings.fallbackRole || '指導役の先輩')}</strong></div></div>`;
    return;
  }
  const cats = [...CATS, ...new Set(hits.map(catOf).filter((c) => !CATS.includes(c)))];
  $('hits').innerHTML = cats.map((c) => {
    const list = hits.filter((x) => catOf(x) === c);
    return list.length ? `<h2 class="cat">${esc(c)}</h2><ul class="hits">${list.map(askRow).join('')}</ul>` : '';
  }).join('');
}

function renderAnswer(x) {
  const check = x.status === '要確認';
  const fb = guide.settings.fallbackRole || '指導役の先輩';
  $('answerBody').innerHTML = `<p class="cat">${esc(catOf(x))}</p>`
    + `<h1 id="answerTitle" tabindex="-1">${esc(x.question)}</h1>`
    + (check ? '<p class="badge">要確認</p>' : '')
    + `<div class="who"><span>聞く人</span><strong>${esc(check ? (x.role && x.role !== '要確認' ? x.role : fb) : x.role)}</strong></div>`
    + (check
      ? `<p class="ans">Wikiにまだ答えがありません。${esc(x.role && x.role !== '要確認' ? x.role : fb)}に聞いてください。</p>`
      : `<p class="ans">${esc(x.answer)}</p>`)
    + (x.wiki && !check ? `<p class="wiki">Wikiの場所: ${esc(x.wiki)}</p>` : '');
}

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  let view = 'home';
  if (h === 'ask' || h.startsWith('ask=')) {
    view = 'ask';
    const word = h.startsWith('ask=') ? h.slice(4) : '';
    if ($('q').value !== word) $('q').value = word;
    renderHits(word);
  } else if (h.startsWith('a/') && qById(h.slice(2))) {
    view = 'answer';
    renderAnswer(qById(h.slice(2)));
  }
  $('home').hidden = view !== 'home';
  $('ask').hidden = view !== 'ask';
  $('answer').hidden = view !== 'answer';
  $('askbar').hidden = view !== 'home';
  document.body.classList.toggle('withbar', view === 'home');
  window.scrollTo(0, 0);
  if (moved) {
    const f = { home: 'title', ask: 'askTitle', answer: 'answerTitle' }[view];
    if (view === 'home') $('title').setAttribute('tabindex', '-1');
    $(f).focus();
  }
}

function go(hash) { moved = true; location.hash = hash; }

// ---- 読み込み ----
function isValid(g) {
  return g && g.settings && /^\d{4}-\d{2}-\d{2}$/.test(g.settings.startDate)
    && Array.isArray(g.tasks)
    && g.tasks.every((t) => t && typeof t.id === 'string' && DAYS.includes(t.day)
      && typeof t.order === 'number' && typeof t.title === 'string')
    && Array.isArray(g.questions)
    && g.questions.every((x) => x && typeof x.id === 'string' && typeof x.question === 'string'
      && typeof x.role === 'string')
    && (!g.faq || (Array.isArray(g.faq) && g.faq.every((f) => f && typeof f.id === 'string')));
}

async function start() {
  $('error').hidden = true;
  try {
    const res = await fetch('guide.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const g = await res.json();
    if (!isValid(g)) throw new Error('guide.json の書き方がちがいます');
    guide = g;
  } catch (e) {
    console.error(e);
    ['home', 'ask', 'answer', 'askbar'].forEach((id) => { $(id).hidden = true; });
    document.body.classList.remove('withbar');
    $('error').hidden = false;
    return;
  }
  done = loadDone();
  today = whichDay();
  sel = today.day;
  const name = guide.settings.guideName || '最初の週ガイド';
  $('appName').textContent = name;
  document.title = name;
  $('note').textContent = today.note;
  $('note').hidden = !today.note;
  $('faq').innerHTML = (guide.faq || []).filter((f) => qById(f.id)).map((f) =>
    `<a class="faqBtn" href="#a/${encodeURIComponent(f.id)}">${esc(f.label || qById(f.id).question)}</a>`
  ).join('') + '<a class="faqBtn more" href="#ask">ほかの質問を探す</a>';
  render();
  route();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-task]');
  if (t) { toggle(t.dataset.task); return; }
  const d = e.target.closest('[data-day]');
  if (d) {
    sel = Number(d.dataset.day);
    render();
    $('days').querySelector(`[data-day="${sel}"]`).focus();
  }
});
$('retry').addEventListener('click', start);

// B・C への移動
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (a) { e.preventDefault(); go(a.getAttribute('href').slice(1)); return; }
  if (e.target.closest('[data-go="home"]')) { moved = true; location.hash = ''; return; }
  if (e.target.closest('#back')) {
    // このページ内で来たなら来た画面(A か B)へ。URLで直接開いたときは B へ
    if (moved) history.back();
    else go('ask');
  }
});
$('q').addEventListener('input', () => {
  // 入力のたびに絞り込む。履歴は増やさずに # だけ書きかえる(C から戻ったとき言葉が残る)
  const w = $('q').value;
  history.replaceState(null, '', w ? `#ask=${encodeURIComponent(w)}` : '#ask');
  renderHits(w);
});
$('sform').addEventListener('submit', (e) => { e.preventDefault(); renderHits($('q').value); });
window.addEventListener('hashchange', () => { if (guide) route(); });

start();

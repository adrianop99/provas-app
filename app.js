'use strict';
/* ===== Provas v0.1 – banco de questões, montagem, impressão e correção por câmera (offline) ===== */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
const LET = 'ABCDE';
const toast = (m, ms = 2200) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms); };
const fmt = n => (Math.round(n * 100) / 100).toString().replace('.', ',');

/* ---------- armazenamento (IndexedDB) ---------- */
const DB = {
  db: null,
  open() { return new Promise((res, rej) => { const r = indexedDB.open('provas', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { this.db = r.result; res(); }; r.onerror = () => rej(r.error); }); },
  get(k) { return new Promise(res => { const r = this.db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); },
  set(k, v) { return new Promise((res, rej) => { const tx = this.db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
};
const S = { questions: [], tests: [], results: [] };
const save = k => DB.set(k, S[k]).catch(e => toast('Erro ao salvar: ' + e.message));

/* ---------- utilidades ---------- */
function readImage(file, max = 900) {
  return new Promise((res, rej) => {
    const fr = new FileReader(); fr.onerror = rej;
    fr.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85)); }; im.onerror = rej; im.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function modal(html) { $('#mbox').innerHTML = html; $('#modal').classList.remove('hidden'); $('#modal').scrollTop = 0; return $('#mbox'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#mbox').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function download(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
const typeName = { mc: 'Múltipla escolha', tf: 'Verdadeiro/Falso', disc: 'Discursiva' };
const isObj = q => q.type === 'mc' || q.type === 'tf';
const altsOf = q => q.type === 'tf' ? ['Verdadeiro', 'Falso'] : q.alts;
const fmtText = s => esc(s).replace(/\n/g, '<br>');

/* ---------- navegação ---------- */
let cur = 'bank';
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.t); });
function go(t, arg) { stopCam(); cur = t; $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); VIEWS[t](arg); window.scrollTo(0, 0); }

/* =================== BANCO =================== */
let bankQ = '';
function viewBank() {
  const v = $('#view');
  v.innerHTML = `<div class="card row"><input id="bq" class="grow" placeholder="Buscar por texto, matéria ou tag…" value="${esc(bankQ)}"><button class="b" id="newq">+ Nova questão</button></div><div id="blist"></div>`;
  $('#bq').oninput = e => { bankQ = e.target.value; list(); };
  $('#newq').onclick = () => editQuestion();
  function list() {
    const q = bankQ.toLowerCase().trim();
    const items = S.questions.filter(x => !q || [x.text, x.subject, (x.tags || []).join(' '), ...(x.alts || [])].join(' ').toLowerCase().includes(q));
    $('#blist').innerHTML = items.length ? items.map(x => `<div class="card qcard" data-id="${x.id}">
      <div class="row"><b class="grow">${esc(typeName[x.type])}${x.subject ? ' · ' + esc(x.subject) : ''}</b>${(x.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div style="margin:6px 0">${fmtText(x.text)}</div>${x.img ? `<img class="qimg" src="${x.img}">` : ''}
      ${isObj(x) ? altsOf(x).map((a, i) => `<div class="q-alt ${i === x.correct ? 'ok' : ''}">${x.type === 'tf' ? 'VF'[i] : LET[i]}) ${esc(a)}${i === x.correct ? ' ✓' : ''}</div>`).join('') : `<div class="muted">${x.lines || 5} linhas para resposta</div>`}
      <div class="row" style="margin-top:8px"><button class="b s" data-a="ed">Editar</button><button class="b s" data-a="dup">Duplicar</button><button class="b r" data-a="del">Excluir</button></div></div>`).join('')
      : `<div class="card muted">${S.questions.length ? 'Nada encontrado.' : 'Banco vazio. Toque em “+ Nova questão”. Dica: em Backup há um banco de exemplo.'}</div>`;
  }
  $('#blist').onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const id = b.closest('.qcard').dataset.id, q = S.questions.find(x => x.id === id);
    if (b.dataset.a === 'ed') editQuestion(q);
    if (b.dataset.a === 'dup') { S.questions.unshift({ ...structuredClone(q), id: uid() }); save('questions'); list(); }
    if (b.dataset.a === 'del' && confirm('Excluir esta questão do banco? (provas já montadas não mudam)')) { S.questions = S.questions.filter(x => x.id !== id); save('questions'); list(); }
  };
  list();
}
function editQuestion(q) {
  const d = q ? structuredClone(q) : { id: uid(), type: 'mc', text: '', alts: ['', '', '', ''], correct: 0, lines: 5, tags: [], subject: '', img: '' };
  if (!d.alts || d.alts.length < 2) d.alts = ['', '', '', ''];
  const m = modal(`<h3>${q ? 'Editar' : 'Nova'} questão</h3>
   <label>Tipo</label><select id="qt"><option value="mc">Múltipla escolha (2 a 5 alternativas)</option><option value="tf">Verdadeiro ou Falso</option><option value="disc">Discursiva</option></select>
   <label>Enunciado</label><textarea id="qx">${esc(d.text)}</textarea>
   <label>Imagem (opcional)</label><div class="row"><input type="file" id="qi" accept="image/*" class="grow"><button class="b s" id="qir">Remover</button></div><div id="qip"></div>
   <div id="qbody"></div>
   <div class="row"><div class="grow"><label>Matéria</label><input id="qs" value="${esc(d.subject)}"></div><div class="grow"><label>Tags (separe por vírgula)</label><input id="qg" value="${esc((d.tags || []).join(', '))}"></div></div>
   <div class="row" style="margin-top:12px"><button class="b" id="qok">Salvar</button><button class="b s" id="qno">Cancelar</button></div>`);
  $('#qt', m).value = d.type;
  const prev = () => $('#qip').innerHTML = d.img ? `<img class="qimg" src="${d.img}">` : '';
  const body = () => {
    const t = $('#qt').value; d.type = t;
    if (t === 'mc') $('#qbody').innerHTML = `<label>Alternativas (marque a correta)</label>${d.alts.map((a, i) => `<div class="row" style="margin:4px 0"><input type="radio" name="qc" value="${i}" style="width:auto" ${i === d.correct ? 'checked' : ''}><b>${LET[i]})</b><input class="grow qa" data-i="${i}" value="${esc(a)}"></div>`).join('')}
      <div class="row"><button class="b s" id="qadd" ${d.alts.length >= 5 ? 'disabled' : ''}>+ Alternativa</button><button class="b s" id="qrem" ${d.alts.length <= 2 ? 'disabled' : ''}>− Alternativa</button></div>`;
    else if (t === 'tf') $('#qbody').innerHTML = `<label>Resposta correta</label><div class="row"><label><input type="radio" name="qc" value="0" style="width:auto" ${d.correct === 0 ? 'checked' : ''}> Verdadeiro</label><label><input type="radio" name="qc" value="1" style="width:auto" ${d.correct === 1 ? 'checked' : ''}> Falso</label></div>`;
    else $('#qbody').innerHTML = `<label>Linhas para resposta</label><input type="number" id="ql" min="1" max="40" value="${d.lines || 5}">`;
    const sync = () => $$('.qa').forEach(x => d.alts[+x.dataset.i] = x.value);
    $('#qadd') && ($('#qadd').onclick = () => { sync(); d.alts.push(''); body(); });
    $('#qrem') && ($('#qrem').onclick = () => { sync(); d.alts.pop(); if (d.correct >= d.alts.length) d.correct = 0; body(); });
    $$('input[name=qc]').forEach(r => r.onchange = () => { sync(); d.correct = +r.value; });
  };
  $('#qt').onchange = () => { if (d.type === 'tf' && d.correct > 1) d.correct = 0; body(); if ($('#qt').value === 'tf' && d.correct > 1) d.correct = 0; };
  $('#qi').onchange = async e => { if (e.target.files[0]) { d.img = await readImage(e.target.files[0]); prev(); } };
  $('#qir').onclick = () => { d.img = ''; prev(); };
  $('#qno').onclick = closeModal;
  $('#qok').onclick = () => {
    d.text = $('#qx').value.trim(); d.subject = $('#qs').value.trim(); d.tags = $('#qg').value.split(',').map(s => s.trim()).filter(Boolean);
    if (d.type === 'mc') { d.alts = $$('.qa').map(x => x.value.trim()); if (d.alts.some(a => !a)) return toast('Preencha todas as alternativas.'); }
    if (d.type === 'tf' && d.correct > 1) d.correct = 0;
    if (d.type === 'disc') d.lines = Math.max(1, Math.min(40, +$('#ql').value || 5));
    if (!d.text && !d.img) return toast('Escreva o enunciado.');
    const i = S.questions.findIndex(x => x.id === d.id); if (i >= 0) S.questions[i] = d; else S.questions.unshift(d);
    save('questions'); closeModal(); toast('Questão salva'); if (cur === 'bank') viewBank();
  };
  body(); prev();
}

/* =================== PROVAS =================== */
function viewTests() {
  const v = $('#view');
  v.innerHTML = `<div class="card row"><b class="grow">Provas montadas</b><button class="b" id="newt">+ Nova prova</button></div>` +
    (S.tests.length ? S.tests.map(t => { const no = t.snap.filter(isObj).length, nd = t.snap.length - no;
      return `<div class="card tcard" data-id="${t.id}"><div class="row"><b class="grow">${esc(t.title)}</b><span class="muted">${t.versions.length} versão(ões)</span></div>
      <div class="muted">${esc([t.inst, t.teacher, t.klass, t.date && t.date.split('-').reverse().join('/')].filter(Boolean).join(' · '))}</div>
      <div class="muted">${no} objetiva(s), ${nd} discursiva(s) · vale ${fmt(t.items.reduce((s, i) => s + i.pts, 0))} pontos · código ${t.id}</div>
      <div class="row" style="margin-top:8px"><button class="b" data-a="pr">Imprimir / PDF</button><button class="b s" data-a="gab">Gabarito</button><button class="b s" data-a="cor">Corrigir</button><button class="b s" data-a="ed">Editar</button><button class="b r" data-a="del">Excluir</button></div></div>`; }).join('')
      : '<div class="card muted">Nenhuma prova ainda. Cadastre questões no Banco e toque em “+ Nova prova”.</div>');
  $('#newt').onclick = () => editTest();
  v.onclick = e => {
    const b = e.target.closest('.tcard button'); if (!b) return; const t = S.tests.find(x => x.id === b.closest('.tcard').dataset.id);
    ({ pr: () => printDialog(t), gab: () => showKey(t), cor: () => go('grade', t.id), ed: () => editTest(t),
      del: () => { if (confirm('Excluir a prova e seus resultados?')) { S.tests = S.tests.filter(x => x !== t); S.results = S.results.filter(r => r.testId !== t.id); save('tests'); save('results'); viewTests(); } } })[b.dataset.a]();
  };
}
function editTest(t) {
  const d = t ? structuredClone(t) : { id: uid(), title: '', inst: '', teacher: '', klass: '', date: new Date().toISOString().slice(0, 10), logo: '', nv: 4, shuffleQ: true, shuffleA: true, items: [], instructions: 'Leia com atenção. Marque as respostas na folha de respostas.' };
  if (t && t.results !== undefined) delete d.results;
  const sel = new Map(d.items.map(i => [i.qid, i.pts]));
  // se a prova é antiga e a questão saiu do banco, mantém a cópia
  const pool = [...S.questions]; (d.snap || []).forEach(q => { if (!pool.find(x => x.id === q.id)) pool.push(q); });
  let filt = '';
  const m = modal(`<h3>${t ? 'Editar' : 'Nova'} prova</h3>
   <label>Título</label><input id="tt" value="${esc(d.title)}" placeholder="Ex.: Avaliação bimestral de História">
   <div class="row"><div class="grow"><label>Instituição</label><input id="ti" value="${esc(d.inst)}"></div><div class="grow"><label>Professor(a)</label><input id="tp" value="${esc(d.teacher)}"></div></div>
   <div class="row"><div class="grow"><label>Turma</label><input id="tk" value="${esc(d.klass)}"></div><div class="grow"><label>Data</label><input type="date" id="td" value="${esc(d.date)}"></div></div>
   <label>Logo (opcional)</label><div class="row"><input type="file" id="tl" accept="image/*" class="grow"><button class="b s" id="tlr">Remover</button></div><div id="tlp"></div>
   <label>Instruções</label><textarea id="tn">${esc(d.instructions)}</textarea>
   <div class="row"><div class="grow"><label>Nº de versões (1 a 50)</label><input type="number" id="tv" min="1" max="50" value="${d.nv}"></div>
    <label style="margin-top:28px"><input type="checkbox" id="tsq" style="width:auto" ${d.shuffleQ ? 'checked' : ''}> Embaralhar questões</label>
    <label style="margin-top:28px"><input type="checkbox" id="tsa" style="width:auto" ${d.shuffleA ? 'checked' : ''}> Embaralhar alternativas</label></div>
   <label>Questões <span id="tcount" class="muted"></span></label><input id="tf" placeholder="Filtrar banco…">
   <div id="tqs" style="max-height:340px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:6px;margin-top:6px"></div>
   ${t ? '<p class="muted">Salvar gera novas versões e novo gabarito. Folhas já impressas desta prova deixam de valer.</p>' : ''}
   <div class="row" style="margin-top:12px"><button class="b" id="tok">Salvar e gerar versões</button><button class="b s" id="tno">Cancelar</button></div>`);
  const lp = () => $('#tlp').innerHTML = d.logo ? `<img class="qimg" src="${d.logo}" style="max-height:60px">` : '';
  const cnt = () => { const qs = pool.filter(q => sel.has(q.id)), no = qs.filter(isObj).length; $('#tcount').innerHTML = `– ${sel.size} selecionada(s), ${no}/${OMR.MAXQ} objetivas, total ${fmt([...sel.values()].reduce((a, b) => a + b, 0))} pts`; $('#tcount').style.color = no > OMR.MAXQ ? '#dc2626' : ''; };
  const list = () => {
    const f = filt.toLowerCase();
    $('#tqs').innerHTML = pool.filter(q => sel.has(q.id) || !f || [q.text, q.subject, (q.tags || []).join(' ')].join(' ').toLowerCase().includes(f)).map(q => `<div class="row" style="border-bottom:1px solid #f1f5f9;padding:4px 0">
      <input type="checkbox" class="tqc" data-id="${q.id}" style="width:auto" ${sel.has(q.id) ? 'checked' : ''}>
      <div class="grow" style="font-size:14px">${esc(q.text.slice(0, 120)) || '(imagem)'} <span class="muted">· ${typeName[q.type]}${q.subject ? ' · ' + esc(q.subject) : ''}</span></div>
      <input type="number" class="tqp" data-id="${q.id}" step="0.25" min="0" style="width:80px" value="${sel.get(q.id) ?? 1}" title="pontos"></div>`).join('') || '<div class="muted">Banco vazio.</div>';
    cnt();
  };
  $('#tqs').onchange = e => { const id = e.target.dataset.id; if (!id) return; const p = +$(`.tqp[data-id="${id}"]`).value || 0; if (e.target.classList.contains('tqc')) { e.target.checked ? sel.set(id, p) : sel.delete(id); } else if (sel.has(id)) sel.set(id, p); cnt(); };
  $('#tf').oninput = e => { filt = e.target.value; list(); };
  $('#tl').onchange = async e => { if (e.target.files[0]) { d.logo = await readImage(e.target.files[0], 400); lp(); } };
  $('#tlr').onclick = () => { d.logo = ''; lp(); };
  $('#tno').onclick = closeModal;
  $('#tok').onclick = () => {
    d.title = $('#tt').value.trim() || 'Prova'; d.inst = $('#ti').value.trim(); d.teacher = $('#tp').value.trim(); d.klass = $('#tk').value.trim(); d.date = $('#td').value; d.instructions = $('#tn').value.trim();
    d.nv = Math.max(1, Math.min(50, Math.round(+$('#tv').value || 1))); d.shuffleQ = $('#tsq').checked; d.shuffleA = $('#tsa').checked;
    // mantém a ordem em que as questões aparecem no banco
    d.items = pool.filter(q => sel.has(q.id)).map(q => ({ qid: q.id, pts: sel.get(q.id) }));
    if (!d.items.length) return toast('Selecione ao menos uma questão.');
    d.snap = d.items.map(i => structuredClone(pool.find(q => q.id === i.qid)));
    if (d.snap.filter(isObj).length > OMR.MAXQ) return toast(`Máximo de ${OMR.MAXQ} questões objetivas por folha de respostas.`);
    if (t) d.id = uid(); // novo código invalida folhas antigas
    genVersions(d);
    const i = t ? S.tests.indexOf(t) : -1; if (i >= 0) { S.results = S.results.filter(r => r.testId !== t.id); S.tests[i] = d; } else S.tests.unshift(d);
    save('tests'); save('results'); closeModal(); toast(`Prova salva com ${d.nv} versão(ões)`); viewTests();
  };
  lp(); list();
}
function genVersions(t) {
  const n = t.snap.length, idx = [...Array(n).keys()];
  t.versions = [];
  for (let v = 1; v <= t.nv; v++) {
    const order = v > 1 && t.shuffleQ ? shuffle(idx) : idx.slice();
    const perm = t.snap.map(q => { const k = [...Array(altsOf(q)?.length || 0).keys()]; return v > 1 && t.shuffleA && q.type === 'mc' ? shuffle(k) : k; });
    t.versions.push({ order, perm });
  }
  t.created = Date.now();
}
/* layout de uma versão: lista de questões numeradas e chave das objetivas */
function layout(t, v) {
  const ver = t.versions[v - 1]; const qs = []; const key = [];
  ver.order.forEach((ii, pos) => {
    const q = t.snap[ii], perm = ver.perm[ii], num = pos + 1;
    const alts = isObj(q) ? perm.map(k => altsOf(q)[k]) : null;
    const item = { num, q, ii, pts: t.items[ii].pts, alts };
    if (isObj(q)) { item.row = key.length; key.push({ ii, num, correct: perm.indexOf(q.correct), n: alts.length, letters: q.type === 'tf' ? ['V', 'F'] : LET.slice(0, alts.length).split(''), pts: item.pts }); }
    qs.push(item);
  });
  return { qs, key, disc: qs.filter(x => !isObj(x.q)) };
}
const qrText = (t, v) => `PV1|${t.id}|${v}`;
function parseQR(s) { const m = /^PV1\|([a-z0-9]+)\|(\d+)$/.exec(s || ''); if (!m) return null; const t = S.tests.find(x => x.id === m[1]); if (!t || +m[2] < 1 || +m[2] > t.versions.length) return null; return { t, v: +m[2] }; }
function sheetFor(t, v) {
  const L = layout(t, v);
  return OMR.sheetSVG({ title: t.title, sub: [t.inst, t.klass, t.teacher].filter(Boolean).join(' · '), version: v, qr: qrText(t, v), labels: L.key.map(k => k.num), nalts: L.key.map(k => k.n), letters: L.key.map(k => k.letters) });
}
function headerHTML(t, v) {
  return `<div class="hd">${t.logo ? `<img src="${t.logo}">` : ''}<div style="flex:1"><div style="font-size:16pt;font-weight:bold">${esc(t.title)}</div>
   <div>${esc([t.inst, t.teacher && 'Prof.(a) ' + t.teacher, t.klass && 'Turma ' + t.klass, t.date && t.date.split('-').reverse().join('/')].filter(Boolean).join(' · '))}</div></div><div style="text-align:right"><b>Versão ${v}</b><br><span style="font-size:9pt">código ${t.id}</span></div></div>
   <div>Nome: _____________________________________________ Nº: ______</div>${t.instructions ? `<p style="font-size:10.5pt"><i>${fmtText(t.instructions)}</i></p>` : ''}`;
}
function examHTML(t, v) {
  const L = layout(t, v);
  return `<div class="pg">${headerHTML(t, v)}${L.qs.map(x => `<div class="q"><b>${x.num}.</b> <span style="font-size:9.5pt">(${fmt(x.pts)} pt)</span> ${fmtText(x.q.text)}${x.q.img ? `<img src="${x.q.img}">` : ''}
    ${x.alts ? x.alts.map((a, k) => `<div style="margin-left:18px">(${x.q.type === 'tf' ? 'VF'[k] : LET[k]}) ${esc(a)}</div>`).join('') : Array(x.q.lines || 5).fill('<div class="ln"></div>').join('')}</div>`).join('')}</div>
   ${L.key.length ? `<div class="pg sheet">${sheetFor(t, v)}</div>` : ''}`;
}
function printDialog(t) {
  const m = modal(`<h3>Imprimir: ${esc(t.title)}</h3>
   <label>Quantidade de cópias (uma por aluno). As versões se alternam: 1, 2, 3…</label><input type="number" id="pc" min="1" max="300" value="${t.versions.length}">
   <label><input type="checkbox" id="ps" style="width:auto"> Só as folhas de respostas</label>
   <p class="muted">Abre a visualização. Use “Imprimir” e escolha “Salvar como PDF” para gerar o PDF. Imprima em tamanho real (100%), sem “ajustar à página”.</p>
   <div class="row"><button class="b" id="pgo">Visualizar</button><button class="b s" id="pno">Cancelar</button></div>`);
  $('#pno').onclick = closeModal;
  $('#pgo').onclick = () => { const n = Math.max(1, Math.min(300, +$('#pc').value || 1)), only = $('#ps').checked; closeModal(); openPrint(t, n, only); };
}
function openPrint(t, n, only) {
  const P = $('#print'); let h = `<div class="pbar"><button class="b" id="pp">🖨️ Imprimir / Salvar PDF</button><button class="b s" id="px">Fechar</button></div>`;
  for (let i = 0; i < n; i++) { const v = (i % t.versions.length) + 1; h += only ? `<div class="pg sheet">${sheetFor(t, v)}</div>` : examHTML(t, v); }
  P.innerHTML = h; P.classList.add('preview');
  $('#pp').onclick = () => window.print(); $('#px').onclick = () => { P.classList.remove('preview'); P.innerHTML = ''; };
}
function keyTable(t) {
  return t.versions.map((_, i) => { const L = layout(t, i + 1); return `<h4>Versão ${i + 1}</h4>` + (L.key.length ? `<table><tr>${L.key.map(k => `<th>${k.num}</th>`).join('')}</tr><tr>${L.key.map(k => `<td><b>${k.letters[k.correct]}</b></td>`).join('')}</tr></table>` : '<p class="muted">Sem questões objetivas.</p>') + (L.disc.length ? `<p class="muted">Discursivas: ${L.disc.map(x => x.num).join(', ')}</p>` : ''); }).join('');
}
function showKey(t) {
  modal(`<h3>Gabarito – ${esc(t.title)}</h3><div id="kt">${keyTable(t)}</div><div class="row" style="margin-top:12px"><button class="b" id="kp">Imprimir gabarito</button><button class="b s" id="kx">Fechar</button></div>`);
  $('#kx').onclick = closeModal;
  $('#kp').onclick = () => { const P = $('#print'); P.innerHTML = `<div class="pbar"><button class="b" id="pp">🖨️ Imprimir</button><button class="b s" id="px">Fechar</button></div><div class="pg">${headerHTML(t, '–').replace(/<div>Nome:.*?<\/div>/, '')}<h3>Gabarito</h3>${keyTable(t)}</div>`; P.classList.add('preview'); closeModal(); $('#pp').onclick = () => window.print(); $('#px').onclick = () => { P.classList.remove('preview'); P.innerHTML = ''; }; };
}

/* =================== CORREÇÃO =================== */
let stream = null, camTimer = null;
function stopCam() { if (camTimer) clearTimeout(camTimer); camTimer = null; if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
function viewGrade(preId) {
  const v = $('#view');
  v.innerHTML = `<div class="card"><p class="muted" style="margin-top:0">Aponte para a folha de respostas inteira, com os 4 quadrados pretos visíveis. O QR code identifica a prova e a versão. Tudo roda no aparelho, sem internet.</p>
   <label>Prova (opcional – só se o QR não for lido)</label><div class="row"><select id="gt" class="grow"><option value="">Identificar pelo QR code</option>${S.tests.map(t => `<option value="${t.id}">${esc(t.title)} (${t.id})</option>`).join('')}</select><select id="gv" style="width:120px"></select></div>
   <div class="row" style="margin-top:10px"><button class="b" id="gcam">📷 Câmera</button><label class="b s" style="margin:0;font-size:15px;color:#0f172a">🖼️ Foto da galeria<input type="file" id="gfile" accept="image/*" hidden></label><button class="b s" id="gman">✍️ Correção manual</button></div></div>
   <div id="garea"></div>`;
  const fillV = () => { const t = S.tests.find(x => x.id === $('#gt').value); $('#gv').innerHTML = t ? t.versions.map((_, i) => `<option value="${i + 1}">Versão ${i + 1}</option>`).join('') : '<option value="">–</option>'; };
  $('#gt').onchange = fillV; if (preId) $('#gt').value = preId; fillV();
  const forced = () => { const t = S.tests.find(x => x.id === $('#gt').value); return t ? qrText(t, +$('#gv').value || 1) : null; };
  $('#gcam').onclick = () => startCam(forced);
  $('#gfile').onchange = async e => { const f = e.target.files[0]; if (!f) return; e.target.value = ''; const im = new Image(); im.src = URL.createObjectURL(f); await im.decode(); const r = analyze(im, im.naturalWidth, im.naturalHeight, forced(), true); if (!r.ok) { $('#garea').innerHTML = `<div class="card bad">${esc(r.err)}</div>`; } };
  $('#gman').onclick = () => { const t = S.tests.find(x => x.id === $('#gt').value); if (!t) return toast('Escolha a prova e a versão acima.'); resultEditor({ t, v: +$('#gv').value || 1, answers: null }); };
}
function frameCanvas(src, w, h, max = 1400) { const k = Math.min(1, max / Math.max(w, h)); const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0, c.width, c.height); return c; }
/* analisa uma imagem; se ok, abre o editor de resultado */
function analyze(src, w, h, forcedQR, verbose) {
  const c = frameCanvas(src, w, h); const img = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  let ctx = null;
  const r = OMR.read(img, qr => { ctx = parseQR(qr); return ctx ? layout(ctx.t, ctx.v).key.map(k => k.n) : null; }, { qr: forcedQR || undefined });
  if (!r.ok) return r;
  resultEditor({ t: ctx.t, v: ctx.v, answers: r.answers, num: r.num, read: r, canvas: c });
  return r;
}
async function startCam(forced) {
  stopCam();
  const a = $('#garea'); a.innerHTML = `<div class="card"><div class="camwrap"><video id="vid" playsinline muted autoplay></video><div class="guide"></div></div><p class="muted" id="cst">Abrindo câmera…</p><button class="b s" id="cstop">Parar</button></div>`;
  $('#cstop').onclick = () => { stopCam(); a.innerHTML = ''; };
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
  catch (e) { $('#cst').textContent = 'Não foi possível abrir a câmera (' + e.name + '). Use “Foto da galeria”.'; return; }
  const vid = $('#vid'); vid.srcObject = stream; await vid.play().catch(() => { });
  const tick = () => {
    if (!stream) return;
    if (vid.videoWidth) {
      const r = analyze(vid, vid.videoWidth, vid.videoHeight, forced());
      if (r.ok) { if (navigator.vibrate) navigator.vibrate(80); stopCam(); return; }
      $('#cst').textContent = r.err || 'Procurando…';
    }
    camTimer = setTimeout(tick, 300);
  };
  tick();
}
function resultEditor({ t, v, answers, num, read, canvas, existing }) {
  const L = layout(t, v);
  const st = existing ? structuredClone(existing) : { id: uid(), testId: t.id, version: v, num: num || '', name: '', answers: answers ? answers.slice() : L.key.map(() => -1), disc: {}, date: Date.now(), source: read ? 'câmera/foto' : 'manual' };
  if (!existing && st.num && !st.num.includes('?')) { const prev = S.results.find(r => r.testId === t.id && r.num === st.num && r.name); if (prev) st.name = prev.name; }
  const a = $('#garea') || $('#view');
  const calc = () => {
    let obj = 0, ok = 0; L.key.forEach((k, i) => { if (st.answers[i] === k.correct) { obj += k.pts; ok++; } });
    const disc = L.disc.reduce((s, x) => s + Math.min(x.pts, +st.disc[x.ii] || 0), 0);
    const max = t.items.reduce((s, i) => s + i.pts, 0);
    return { obj, ok, disc, total: obj + disc, max };
  };
  const ansLabel = (k, x) => x === -1 ? 'branco' : x === -2 ? 'dupla' : k.letters[x];
  const render = () => {
    const c = calc();
    a.innerHTML = `<div class="card"><div class="row"><div class="grow"><b>${esc(t.title)}</b> – versão ${v}<div class="muted">${read ? 'Lida pela câmera/foto. Toque nas bolinhas abaixo para corrigir se necessário.' : 'Correção manual: toque na alternativa marcada pelo aluno.'}</div></div>
     <div style="text-align:right"><div class="big ${c.total >= c.max * 0.6 ? 'ok' : 'bad'}" id="rtot">${fmt(c.total)} / ${fmt(c.max)}</div><div class="muted">${c.ok}/${L.key.length} acertos objetivos</div></div></div>
     ${canvas ? '<canvas id="rov" style="width:100%;margin-top:8px;border-radius:8px"></canvas>' : ''}
     <div class="row"><div style="width:110px"><label>Nº do aluno</label><input id="rn" inputmode="numeric" value="${esc(st.num)}"></div><div class="grow"><label>Nome</label><input id="rname" value="${esc(st.name)}"></div></div>
     <table style="margin-top:10px"><tr><th>Q</th><th>Resposta</th><th>Gab.</th><th></th></tr>${L.key.map((k, i) => `<tr><td><b>${k.num}</b></td><td style="text-align:left">${k.letters.map((l, j) => `<span class="bub ${st.answers[i] === j ? 'on' : ''}" data-i="${i}" data-j="${j}">${l}</span>`).join('')}<span class="muted"> ${st.answers[i] < 0 ? ansLabel(k, st.answers[i]) : ''}</span></td><td>${k.letters[k.correct]}</td><td class="${st.answers[i] === k.correct ? 'ok' : 'bad'}">${st.answers[i] === k.correct ? '✔' : '✘'}</td></tr>`).join('')}</table>
     ${L.disc.length ? `<h4>Discursivas</h4>${L.disc.map(x => `<div class="row"><b style="width:40px">${x.num}.</b><span class="grow muted">${esc(x.q.text.slice(0, 80))}</span><input type="number" class="rd" data-ii="${x.ii}" step="0.25" min="0" max="${x.pts}" style="width:90px" value="${st.disc[x.ii] ?? ''}"><span class="muted">/ ${fmt(x.pts)}</span></div>`).join('')}` : ''}
     <div class="row" style="margin-top:12px"><button class="b g" id="rsave">Salvar resultado</button><button class="b s" id="rnext">${read ? 'Descartar e ler outra' : 'Cancelar'}</button></div></div>`;
    if (canvas) drawOverlay($('#rov'), canvas, read, L, st);
    $$('.bub', a).forEach(b => b.onclick = () => { const i = +b.dataset.i, j = +b.dataset.j; st.answers[i] = st.answers[i] === j ? -1 : j; keep(); render(); });
    $$('.rd', a).forEach(x => x.oninput = () => { st.disc[x.dataset.ii] = x.value === '' ? '' : Math.max(0, Math.min(+x.max, +x.value)); const c2 = calc(); $('#rtot').textContent = `${fmt(c2.total)} / ${fmt(c2.max)}`; });
    $('#rsave').onclick = () => {
      keep(); const c2 = calc(); Object.assign(st, { obj: c2.obj, discTotal: c2.disc, total: c2.total, max: c2.max, ok: c2.ok, nobj: L.key.length, date: Date.now() });
      const dupe = S.results.find(r => r.id !== st.id && r.testId === t.id && st.num && r.num === st.num);
      if (dupe && !confirm(`Já existe resultado do aluno nº ${st.num}. Substituir?`)) return;
      S.results = S.results.filter(r => r.id !== st.id && r !== dupe); S.results.unshift(st); save('results'); toast(`Salvo: ${fmt(c2.total)} / ${fmt(c2.max)}`);
      if (existing) go('results', t.id); else { a.innerHTML = `<div class="card ok">✔ Resultado salvo (${esc(st.name || 'nº ' + (st.num || '?'))}: ${fmt(c2.total)}). Pronto para a próxima folha.</div>`; }
    };
    $('#rnext').onclick = () => { if (existing) go('results', t.id); else { a.innerHTML = ''; if (read) $('#gcam')?.click(); } };
  };
  const keep = () => { st.num = $('#rn')?.value.trim() ?? st.num; st.name = $('#rname')?.value.trim() ?? st.name; };
  render();
}
function drawOverlay(cv, src, read, L, st) {
  cv.width = src.width; cv.height = src.height; const x = cv.getContext('2d'); x.drawImage(src, 0, 0);
  x.lineWidth = Math.max(2, src.width / 300);
  x.strokeStyle = '#2563eb'; x.beginPath(); read.corners.forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.closePath(); x.stroke();
  const rad = (q, k) => { const [cx, cy] = OMR.bubbleXY(q, k), a = read.H(cx, cy), b = read.H(cx + OMR.ANS.r, cy); return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  read.marks.forEach(m => {
    const k = L.key[m.q], marked = st.answers[m.q] === m.k || (st.answers[m.q] === -2 && m.on), isKey = k.correct === m.k;
    if (!marked && !isKey) return;
    x.strokeStyle = marked ? (isKey && st.answers[m.q] === m.k ? '#16a34a' : '#dc2626') : '#16a34a'; x.setLineDash(marked ? [] : [4, 3]);
    x.beginPath(); x.arc(m.p[0], m.p[1], rad(m.q, m.k) * 1.35, 0, 7); x.stroke();
  });
  x.setLineDash([]);
}

/* =================== RESULTADOS =================== */
function viewResults(preId) {
  const v = $('#view');
  if (!S.tests.length) { v.innerHTML = '<div class="card muted">Nenhuma prova cadastrada.</div>'; return; }
  const tid = preId || viewResults.last || S.tests[0].id;
  v.innerHTML = `<div class="card row"><select id="rt" class="grow">${S.tests.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${esc(t.title)} (${S.results.filter(r => r.testId === t.id).length})</option>`).join('')}</select>
   <button class="b" id="rx">Excel (.xlsx)</button><button class="b s" id="rc">CSV</button><button class="b s" id="rk">Gabarito</button></div><div id="rl"></div>`;
  const t = S.tests.find(x => x.id === tid) || S.tests[0]; viewResults.last = t.id;
  $('#rt').onchange = e => viewResults(e.target.value);
  const rs = S.results.filter(r => r.testId === t.id).sort((a, b) => (a.num || '').localeCompare(b.num || '', 'pt', { numeric: true }) || (a.name || '').localeCompare(b.name || ''));
  const avg = rs.length ? rs.reduce((s, r) => s + r.total, 0) / rs.length : 0;
  $('#rl').innerHTML = rs.length ? `<div class="card"><div class="muted">${rs.length} aluno(s) · média ${fmt(avg)} de ${fmt(rs[0].max)}</div>
   <table style="margin-top:8px"><tr><th>Nº</th><th>Nome</th><th>Versão</th><th>Acertos</th><th>Nota</th><th></th></tr>${rs.map(r => `<tr data-id="${r.id}"><td>${esc(r.num)}</td><td style="text-align:left">${esc(r.name)}</td><td>${r.version}</td><td>${r.ok}/${r.nobj}</td><td><b>${fmt(r.total)}</b></td><td><button class="b s" data-a="e">Abrir</button> <button class="b r" data-a="d">✕</button></td></tr>`).join('')}</table></div>
   ${statsHTML(t, rs)}` : '<div class="card muted">Nenhum resultado salvo para esta prova.</div>';
  $('#rl').onclick = e => { const b = e.target.closest('button'); if (!b) return; const r = S.results.find(x => x.id === b.closest('tr').dataset.id);
    if (b.dataset.a === 'd' && confirm('Excluir este resultado?')) { S.results = S.results.filter(x => x !== r); save('results'); viewResults(t.id); }
    if (b.dataset.a === 'e') { $('#view').innerHTML = '<div id="garea"></div>'; resultEditor({ t, v: r.version, existing: r }); } };
  $('#rx').onclick = () => exportRes(t, 'xlsx'); $('#rc').onclick = () => exportRes(t, 'csv'); $('#rk').onclick = () => showKey(t);
}
function statsHTML(t, rs) {
  // % de acerto por questão (numeração da versão 1)
  const L1 = layout(t, 1); const rows = L1.key.map(k => { let ok = 0; rs.forEach(r => { const L = layout(t, r.version), i = L.key.findIndex(x => x.ii === k.ii); if (i >= 0 && r.answers[i] === L.key[i].correct) ok++; }); return { num: k.num, p: ok / rs.length }; });
  return rows.length ? `<div class="card"><b>Acerto por questão</b> <span class="muted">(numeração da versão 1)</span><table style="margin-top:6px"><tr>${rows.map(r => `<th>${r.num}</th>`).join('')}</tr><tr>${rows.map(r => `<td class="${r.p < 0.5 ? 'bad' : 'ok'}">${Math.round(r.p * 100)}%</td>`).join('')}</tr></table></div>` : '';
}
function resRows(t) {
  const L1 = layout(t, 1);
  return S.results.filter(r => r.testId === t.id).map(r => {
    const L = layout(t, r.version), row = { 'Nº': r.num, 'Nome': r.name, 'Versão': r.version, 'Acertos': r.ok, 'Objetivas': r.obj, 'Discursivas': r.discTotal, 'Nota': r.total, 'Máximo': r.max };
    L1.key.forEach(k => { const i = L.key.findIndex(x => x.ii === k.ii); const a = r.answers[i]; row['Q' + k.num] = a === -1 ? '' : a === -2 ? '*' : L.key[i].letters[a]; });
    row['Data'] = new Date(r.date).toLocaleString('pt-BR'); return row;
  });
}
function exportRes(t, kind) {
  const rows = resRows(t); if (!rows.length) return toast('Sem resultados.');
  const name = (t.title.replace(/[^\p{L}\p{N}-]+/gu, '_') || 'prova') + '_notas';
  if (kind === 'csv') { const cols = Object.keys(rows[0]); const q = v => { v = String(v ?? '').replace('.', typeof v === 'number' ? ',' : '.'); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }; download(name + '.csv', '\ufeff' + [cols.join(';'), ...rows.map(r => cols.map(c => q(r[c])).join(';'))].join('\r\n'), 'text/csv'); return; }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Notas');
  const key = []; t.versions.forEach((_, i) => { const L = layout(t, i + 1), r = { 'Versão': i + 1 }; L.key.forEach(k => r['Q' + k.num] = k.letters[k.correct]); key.push(r); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(key), 'Gabarito');
  download(name + '.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* =================== BACKUP =================== */
function viewMore() {
  $('#view').innerHTML = `<div class="card"><h3 style="margin-top:0">Backup</h3><p class="muted">Os dados ficam só neste aparelho. Faça backup com frequência.</p>
   <div class="row"><button class="b" id="bx">⬇️ Exportar backup (.json)</button><label class="b s" style="margin:0;font-size:15px;color:#0f172a">⬆️ Restaurar backup<input type="file" id="bi" accept=".json,application/json" hidden></label></div>
   <p class="muted">${S.questions.length} questões · ${S.tests.length} provas · ${S.results.length} resultados</p></div>
   <div class="card"><h3 style="margin-top:0">Exemplo</h3><p class="muted">Adiciona 8 questões de exemplo ao banco para testar.</p><button class="b s" id="bs">Adicionar questões de exemplo</button></div>
   <div class="card"><h3 style="margin-top:0">Apagar tudo</h3><button class="b r" id="bz">Apagar todos os dados</button></div>
   <div class="card muted">Provas v0.1 · funciona offline · leitura óptica no próprio aparelho.</div>`;
  $('#bx').onclick = () => download(`provas_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'provas', v: 1, at: new Date().toISOString(), ...S }), 'application/json');
  $('#bi').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (d.app !== 'provas') throw new Error('arquivo não é um backup deste app');
      const merge = confirm('OK = juntar com os dados atuais\nCancelar = substituir tudo');
      for (const k of ['questions', 'tests', 'results']) { const arr = Array.isArray(d[k]) ? d[k] : []; S[k] = merge ? [...arr.filter(x => !S[k].some(y => y.id === x.id)), ...S[k]] : arr; await save(k); }
      toast('Backup restaurado'); viewMore();
    } catch (err) { toast('Falha: ' + err.message, 4000); }
  };
  $('#bs').onclick = () => { S.questions = [...sample(), ...S.questions]; save('questions'); toast('Exemplos adicionados'); viewMore(); };
  $('#bz').onclick = async () => { if (!confirm('Apagar TODAS as questões, provas e resultados?')) return; for (const k of ['questions', 'tests', 'results']) { S[k] = []; await save(k); } viewMore(); };
}
function sample() {
  const mc = (text, alts, correct, subject, tags) => ({ id: uid(), type: 'mc', text, alts, correct, subject, tags, img: '', lines: 5 });
  return [
    mc('Qual é a capital do Brasil?', ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador'], 2, 'Geografia', ['capitais']),
    mc('Quanto é 7 × 8?', ['54', '56', '58', '64', '48'], 1, 'Matemática', ['tabuada']),
    mc('Em que ano foi proclamada a Independência do Brasil?', ['1500', '1822', '1889', '1922'], 1, 'História', ['brasil']),
    mc('Qual destes é um mamífero?', ['Tubarão', 'Golfinho', 'Sardinha'], 1, 'Ciências', ['animais']),
    mc('Qual é o maior planeta do Sistema Solar?', ['Terra', 'Marte', 'Júpiter', 'Saturno', 'Vênus'], 2, 'Ciências', ['astronomia']),
    { id: uid(), type: 'tf', text: 'A água ferve a 100 °C ao nível do mar.', alts: [], correct: 0, subject: 'Ciências', tags: ['física'], img: '' },
    { id: uid(), type: 'tf', text: 'O Ceará fica na Região Sul do Brasil.', alts: [], correct: 1, subject: 'Geografia', tags: ['regiões'], img: '' },
    { id: uid(), type: 'disc', text: 'Explique, com suas palavras, o que é fotossíntese.', alts: [], correct: 0, lines: 6, subject: 'Ciências', tags: ['plantas'], img: '' }
  ];
}

const VIEWS = { bank: viewBank, tests: viewTests, grade: viewGrade, results: viewResults, more: viewMore };
(async () => {
  try { await DB.open(); for (const k of ['questions', 'tests', 'results']) S[k] = (await DB.get(k)) || []; } catch (e) { toast('Armazenamento indisponível: ' + e.message, 5000); }
  go('bank');
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
window.APP = { S, layout, sheetFor, parseQR, analyze, go, genVersions, save };

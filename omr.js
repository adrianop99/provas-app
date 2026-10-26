/* OMR – leitura de folha de respostas (100% no aparelho) */
const OMR = (() => {
  const W = 800, H = 1100;
  const MK = [[40, 40], [760, 40], [760, 1060], [40, 1060]]; // TL TR BR BL (horário)
  const QR = { x: 570, y: 80, s: 150 };
  const NUM = { x0: 100, dx: 40, y0: 350, dy: 32 };
  const ANS = { cols: [300, 545], y0: 350, dy: 46, bx: 50, bdx: 38, r: 13 };
  const MAXQ = 20;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const bubbleXY = (q, k) => [ANS.cols[Math.floor(q / 10)] + ANS.bx + k * ANS.bdx, ANS.y0 + (q % 10) * ANS.dy];
  const numXY = (d, r) => [NUM.x0 + d * NUM.dx, NUM.y0 + r * NUM.dy];

  /* o = {title, sub, version, qr, labels[], nalts[], letters[][]} */
  function sheetSVG(o) {
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial,Helvetica,sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>`;
    MK.forEach(([x, y]) => s += `<rect x="${x - 20}" y="${y - 20}" width="40" height="40" fill="#000"/>`);
    s += `<text x="80" y="100" font-size="22" font-weight="bold">${esc((o.title || '').slice(0, 38))}</text>`;
    s += `<text x="80" y="128" font-size="14" fill="#333">${esc((o.sub || '').slice(0, 60))}</text>`;
    s += `<text x="80" y="156" font-size="15" font-weight="bold">FOLHA DE RESPOSTAS – Versão ${o.version}</text>`;
    s += `<text x="80" y="200" font-size="15">Nome:</text><line x1="130" y1="202" x2="545" y2="202" stroke="#000"/>`;
    s += `<text x="80" y="240" font-size="15">Turma:</text><line x1="135" y1="242" x2="330" y2="242" stroke="#000"/>`;
    s += `<text x="345" y="240" font-size="15">Nota:</text><line x1="390" y1="242" x2="545" y2="242" stroke="#000"/>`;
    // QR
    const qr = qrcode(0, 'M'); qr.addData(o.qr); qr.make();
    const n = qr.getModuleCount(), c = QR.s / n;
    s += `<rect x="${QR.x - 8}" y="${QR.y - 8}" width="${QR.s + 16}" height="${QR.s + 16}" fill="#fff"/>`;
    let p = '';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) p += `M${(QR.x + k * c).toFixed(2)} ${(QR.y + r * c).toFixed(2)}h${c.toFixed(2)}v${c.toFixed(2)}h-${c.toFixed(2)}z`;
    s += `<path d="${p}" fill="#000"/>`;
    // número do aluno
    s += `<text x="70" y="300" font-size="13" font-weight="bold">Nº do aluno</text>`;
    for (let r = 0; r < 10; r++) {
      s += `<text x="68" y="${NUM.y0 + r * NUM.dy + 5}" font-size="12" fill="#555">${r}</text>`;
      for (let d = 0; d < 3; d++) { const [x, y] = numXY(d, r); s += `<circle cx="${x}" cy="${y}" r="${ANS.r}" fill="#fff" stroke="#000" stroke-width="1.6"/>`; }
    }
    for (let d = 0; d < 3; d++) { const [x] = numXY(d, 0); s += `<rect x="${x - 15}" y="308" width="30" height="22" fill="none" stroke="#000"/>`; }
    // respostas
    s += `<text x="300" y="300" font-size="13" font-weight="bold">Respostas – preencha totalmente a bolinha com caneta escura</text>`;
    o.nalts.forEach((na, q) => {
      const [x0, y] = bubbleXY(q, 0);
      s += `<text x="${x0 - 22}" y="${y + 5}" font-size="14" font-weight="bold" text-anchor="end">${esc(o.labels[q])}</text>`;
      for (let k = 0; k < na; k++) {
        const [x] = bubbleXY(q, k);
        s += `<circle cx="${x}" cy="${y}" r="${ANS.r}" fill="#fff" stroke="#000" stroke-width="1.6"/><text x="${x}" y="${y + 4}" font-size="11" fill="#bbb" text-anchor="middle">${o.letters[q][k]}</text>`;
      }
    });
    s += `<text x="400" y="840" font-size="12" fill="#444" text-anchor="middle">Não rasure, não dobre e não escreva perto dos quadrados pretos. Marcação dupla ou em branco = errada.</text>`;
    return s + '</svg>';
  }

  /* ---------- visão ---------- */
  function gray(img) {
    const { data, width: w, height: h } = img, g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    return g;
  }
  function otsu(g) {
    const hist = new Float64Array(256); for (const v of g) hist[v]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue; const wF = g.length - wB; if (!wF) break;
      sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
      if (v > best) { best = v; t = i; }
    }
    return t;
  }
  // limiar local (média em blocos) para tolerar sombra
  function binarize(g, w, h) {
    const bs = Math.max(16, Math.round(Math.min(w, h) / 12)), gx = Math.ceil(w / bs), gy = Math.ceil(h / bs);
    const mean = new Float32Array(gx * gy);
    for (let by = 0; by < gy; by++) for (let bx = 0; bx < gx; bx++) {
      let s = 0, n = 0;
      for (let y = by * bs; y < Math.min(h, by * bs + bs); y += 2) for (let x = bx * bs; x < Math.min(w, bx * bs + bs); x += 2) { s += g[y * w + x]; n++; }
      mean[by * gx + bx] = s / n;
    }
    const t0 = otsu(g), b = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // máximo da vizinhança 3x3 de blocos ≈ branco do papel
      const bx = Math.floor(x / bs), by = Math.floor(y / bs); let mx = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = bx + dx, Y = by + dy; if (X >= 0 && Y >= 0 && X < gx && Y < gy && mean[Y * gx + X] > mx) mx = mean[Y * gx + X]; }
      const v = g[y * w + x]; b[y * w + x] = (v < Math.min(mx * 0.6, t0 + 40)) ? 1 : 0;
    }
    return b;
  }
  function components(b, w, h) {
    const lab = new Int32Array(w * h), out = [], st = new Int32Array(w * h); let id = 0;
    for (let i = 0; i < b.length; i++) {
      if (!b[i] || lab[i]) continue; id++; let sp = 0; st[sp++] = i; lab[i] = id;
      let a = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      while (sp) {
        const p = st[--sp], x = p % w, y = (p / w) | 0; a++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && b[p - 1] && !lab[p - 1]) { lab[p - 1] = id; st[sp++] = p - 1; }
        if (x < w - 1 && b[p + 1] && !lab[p + 1]) { lab[p + 1] = id; st[sp++] = p + 1; }
        if (y > 0 && b[p - w] && !lab[p - w]) { lab[p - w] = id; st[sp++] = p - w; }
        if (y < h - 1 && b[p + w] && !lab[p + w]) { lab[p + w] = id; st[sp++] = p + w; }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (a > 30) {
        const mx = sx / a, my = sy / a, cxx = sxx / a - mx * mx, cyy = syy / a - my * my, cxy = sxy / a - mx * my;
        const det = Math.max(1e-6, cxx * cyy - cxy * cxy), tr = cxx + cyy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
        out.push({ a, x: mx, y: my, bw, bh, comp: a / (12 * Math.sqrt(det)), elong: (tr / 2 + disc) / Math.max(1e-6, tr / 2 - disc) });
      }
    }
    return out;
  }
  function solve(A, b) { // Gauss
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let m = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k;
      [A[i], A[m]] = [A[m], A[i]];[b[i], b[m]] = [b[m], b[i]];
      for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
    }
    const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; } return x;
  }
  function homography(src, dst) { // src -> dst
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = solve(A, b); h.push(1);
    return (x, y) => { const d = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]; };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function findMarkers(cs, w, h) {
    const minA = (Math.min(w, h) * 0.012) ** 2;
    let c = cs.filter(k => k.a >= minA && k.comp > 0.8 && k.comp < 1.2 && k.elong < 1.8 && k.a < w * h * 0.02);
    c.sort((p, q) => q.a - p.a); c = c.slice(0, 12);
    let best = null;
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) for (let k = j + 1; k < c.length; k++) for (let l = k + 1; l < c.length; l++) {
      const q = [c[i], c[j], c[k], c[l]];
      const as = q.map(z => z.a); if (Math.min(...as) / Math.max(...as) < 0.35) continue;
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      q.sort((p, r) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(r.y - cy, r.x - cx));
      const s0 = dist(q[0], q[1]) + dist(q[2], q[3]), s1 = dist(q[1], q[2]) + dist(q[3], q[0]);
      const asp = Math.min(s0, s1) / Math.max(s0, s1);
      const span = Math.max(s0, s1) / 2 / Math.max(w, h); if (span < 0.25) continue;
      const opp = Math.min(dist(q[0], q[1]), dist(q[2], q[3])) / Math.max(dist(q[0], q[1]), dist(q[2], q[3])) * Math.min(dist(q[1], q[2]), dist(q[3], q[0])) / Math.max(dist(q[1], q[2]), dist(q[3], q[0]));
      if (opp < 0.5) continue;
      const score = Math.abs(Math.log(asp / 0.706)) * 3 + (1 - opp) - span * 0.5 - Math.min(...as) / Math.max(...as) * 0.3;
      if (!best || score < best.score) best = { score, q: q.slice(), short: s0 < s1 ? 0 : 1 };
    }
    return best;
  }
  function sampler(g, w, h) {
    return (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return 255; return g[y * w + x]; };
  }
  // escuridão relativa dentro de um círculo canônico
  function darkness(S, Hm, cx, cy, r) {
    let si = 0, ni = 0; const ring = [];
    for (let dy = -r; dy <= r; dy += r / 4) for (let dx = -r; dx <= r; dx += r / 4) {
      const d2 = dx * dx + dy * dy;
      if (d2 <= (0.55 * r) ** 2) { const [x, y] = Hm(cx + dx, cy + dy); si += S(x, y); ni++; }
    }
    for (let a = 0; a < 16; a++) { const t = a * Math.PI / 8, [x, y] = Hm(cx + Math.cos(t) * r * 1.45, cy + Math.sin(t) * r * 1.45); ring.push(S(x, y)); }
    ring.sort((p, q) => p - q); const paper = Math.max(60, ring[Math.floor(ring.length * 0.75)]);
    return Math.max(0, (paper - si / ni) / paper);
  }

  /* lê a folha. img: ImageData. Retorna {ok, qr, corners, H, answers[], num, marks} */
  function read(img, nalts, opts = {}) {
    const w = img.width, h = img.height, g = gray(img);
    let qrText = opts.qr || null;
    if (!qrText && typeof jsQR !== 'undefined') { const r = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' }); if (r) qrText = r.data; }
    const b = binarize(g, w, h), cs = components(b, w, h), m = findMarkers(cs, w, h);
    if (!m) return { ok: false, qr: qrText, err: 'Não encontrei os 4 quadrados pretos dos cantos.' };
    const S = sampler(g, w, h);
    // short side = topo/base. 2 candidatos (0° e 180°); decide pela densidade na área do QR
    let bestH = null, bestD = -1, bestC = null;
    for (const st of [m.short, m.short + 2]) {
      const q = [0, 1, 2, 3].map(i => m.q[(st + i) % 4]);
      const Hm = homography(MK, q.map(p => [p.x, p.y]));
      let d = 0; for (let y = QR.y + 5; y < QR.y + QR.s; y += 10) for (let x = QR.x + 5; x < QR.x + QR.s; x += 10) { const [X, Y] = Hm(x, y); d += S(X, Y) < 128 ? 1 : 0; }
      if (d > bestD) { bestD = d; bestH = Hm; bestC = q; }
    }
    const Hm = bestH, R = ANS.r;
    for (let att = 0; att < 3 && !qrText && typeof jsQR !== 'undefined'; att++) {
      const sc = att === 2 ? 2 : 3, pad = 20, side = Math.round((QR.s + 2 * pad) * sc), gq = new Uint8Array(side * side), out = new Uint8ClampedArray(side * side * 4);
      for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
        const [X, Y] = Hm(QR.x - pad + x / sc, QR.y - pad + y / sc);
        gq[y * side + x] = att === 0 ? S(X, Y) : (S(X - 1, Y - 1) + S(X + 1, Y - 1) + S(X - 1, Y + 1) + S(X + 1, Y + 1) + S(X, Y) * 4) / 8;
      }
      const tq = otsu(gq); for (let i = 0; i < gq.length; i++) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = gq[i] <= tq ? 0 : 255; out[i * 4 + 3] = 255; }
      const r = jsQR(out, side, side, { inversionAttempts: 'dontInvert' }); if (r) qrText = r.data;
    }
    if (typeof nalts === 'function') nalts = nalts(qrText);
    if (!nalts) return { ok: false, qr: qrText, err: qrText ? 'QR não pertence a uma prova deste aparelho.' : 'QR code não lido – escolha a prova e a versão manualmente.' };
    const TH = opts.th || 0.3;
    const marks = [], answers = [];
    nalts.forEach((na, q) => {
      const ds = []; for (let k = 0; k < na; k++) { const [x, y] = bubbleXY(q, k); ds.push(darkness(S, Hm, x, y, R)); }
      const mx = Math.max(...ds);
      const on = ds.map(d => d > TH && d > mx * 0.6);
      const sel = on.map((v, k) => v ? k : -1).filter(k => k >= 0);
      answers.push(sel.length === 0 ? -1 : sel.length > 1 ? -2 : sel[0]);
      ds.forEach((d, k) => { const [x, y] = bubbleXY(q, k); marks.push({ q, k, d, on: on[k], p: Hm(x, y) }); });
    });
    let num = '';
    for (let d = 0; d < 3; d++) {
      const ds = []; for (let r = 0; r < 10; r++) { const [x, y] = numXY(d, r); ds.push(darkness(S, Hm, x, y, R)); }
      const mx = Math.max(...ds), on = ds.map((v, r) => v > TH && v > mx * 0.6 ? r : -1).filter(r => r >= 0);
      num += on.length === 1 ? on[0] : on.length === 0 ? '' : '?';
    }
    return { ok: true, qr: qrText, corners: bestC.map(p => [p.x, p.y]), H: Hm, answers, num, marks, r: R };
  }
  return { W, H, MK, QR, ANS, NUM, MAXQ, sheetSVG, read, bubbleXY, numXY, homography };
})();
if (typeof module !== 'undefined') module.exports = OMR;

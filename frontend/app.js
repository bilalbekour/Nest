const $ = (id) => document.getElementById(id);
const state = { token: null, usuario: null, puestos: [], reservas: [], servicios: [], departamentos: [],
  masiva: false, masivaSel: new Set(), modalModo: null, view: null };
let modalDesk = null;

function api(path, opts = {}) {
  const headers = {};
  if (state.token) headers["Authorization"] = "Bearer " + state.token;
  if (opts.json) headers["Content-Type"] = "application/json";
  return fetch(path, { method: opts.method || "GET", headers,
    body: opts.json ? JSON.stringify(opts.json) : undefined })
    .then(async r => {
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        if (r.status === 401 && !path.includes("/api/auth/login")) logout();
        throw new Error(d?.detail || t("Error"));
      }
      return d;
    });
}

function tm(hhmmss) { return (hhmmss || "").slice(0, 5); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

/* ── Colores por servicio ── */
const PALETTE = ["#2962FF", "#D32F2F", "#00897B", "#8E44AD", "#E67E22", "#0097A7", "#795548", "#C2185B"];
const COLOR_FALLO = "#94A3B8";
const COLOR_SHARED = "#287080";
function normColor(c) { return /^#[0-9a-fA-F]{6}$/.exec(c || "") ? c : COLOR_FALLO; }
function tint(hex, amt = 0.82) {
  const n = parseInt(normColor(hex).slice(1), 16);
  const t = v => Math.round(v + (255 - v) * amt);
  return `rgb(${t((n >> 16) & 255)},${t((n >> 8) & 255)},${t(n & 255)})`;
}
function serviciosDe(rs) {
  const seen = [];
  (rs || []).forEach(r => {
    if (r.servicio && !seen.some(s => s.id === r.servicio.id)) seen.push(r.servicio);
  });
  return seen;
}
function fillSelect(el, items) {
  el.innerHTML = "";
  for (const i of items) {
    const opt = document.createElement("option");
    opt.value = i.id;
    opt.textContent = i.nombre;
    el.appendChild(opt);
  }
}
function fillHistSelect(el, items) {
  fillSelect(el, items);
  const all = document.createElement("option");
  all.value = "";
  all.textContent = t("Todos");
  el.prepend(all);
  el.value = "";
}

function tipoLabel(tt) {
  return tt === "visita" ? t("Visita") : tt === "agente" ? t("Agente") : t("Staff");
}

function onI18n() {
  if (!state.servicios || !state.departamentos) return;
  const sav = {};
  ["filtro-servicio", "filtro-departamento", "hist-servicio", "hist-departamento",
   "rep-servicio", "rep-departamento", "modal-servicio", "modal-departamento",
   "modal-lote-servicio", "modal-lote-departamento"].forEach(id => { sav[id] = $(id).value; });
  fillSelect($("modal-servicio"), state.servicios);
  fillSelect($("modal-departamento"), state.departamentos);
  ["hist-servicio", "filtro-servicio", "rep-servicio"].forEach(id => fillHistSelect($(id), state.servicios));
  ["hist-departamento", "filtro-departamento", "rep-departamento"].forEach(id => fillHistSelect($(id), state.departamentos));
  fillDeptosForServicio();
  fillServiciosLote();
  fillDeptosLote();
  Object.keys(sav).forEach(id => {
    const el = $(id);
    if (sav[id] !== "" && [...el.options].some(o => o.value === sav[id])) el.value = sav[id];
  });
  actualizaFiltroDepto();
  actualizaRepDepto();
}

/* ── Login ── */
$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  $("login-error").classList.add("hidden");
  try {
    const d = await api("/api/auth/login", { method: "POST",
      json: { username: $("login-user").value, password: $("login-pass").value } });
    state.token = d.token;
    state.usuario = d.usuario;
    localStorage.setItem("nido_token", d.token);
    localStorage.setItem("nido_usuario", JSON.stringify(d.usuario));
    enter();
  } catch (err) {
    $("login-error").textContent = err.message || t("Credenciales inválidas");
    $("login-error").classList.remove("hidden");
  }
};

function enter() {
  $("login").classList.add("hidden");
  document.querySelectorAll(".btn-admin").forEach(b => {
    b.style.display = state.usuario.rol === "admin" ? "" : "none";
  });
  const nav = $("nav");
  nav.classList.remove("hidden");
  nav.style.display = "";
  $("nav-avatar").textContent = (state.usuario.nombre || "?")[0].toUpperCase();
  $("nav-user").textContent = `${state.usuario.nombre} (${state.usuario.rol})`;
  $("fecha").value = todayStr();
  show("reservar");
  Promise.all([api("/api/servicios"), api("/api/departamentos"),
               api("/api/ajustes/orden_zonas").catch(() => ({}))])
    .then(([s, d, o]) => {
      state.servicios = s;
      state.departamentos = d;
      state.ordenZonas = o || {};
      fillSelect($("modal-servicio"), s);
      fillSelect($("modal-departamento"), d);
      fillHistSelect($("hist-servicio"), s);
      fillHistSelect($("hist-departamento"), d);
      fillHistSelect($("filtro-servicio"), s);
      fillHistSelect($("filtro-departamento"), d);
      fillHistSelect($("rep-servicio"), s);
      fillHistSelect($("rep-departamento"), d);
      actualizaRepDepto();
      renderPlan();
    })
    .catch(() => logout());
}

function logout() {
  state.token = null; state.usuario = null;
  localStorage.removeItem("nido_token");
  localStorage.removeItem("nido_usuario");
  closeModal();
  const nav = $("nav");
  nav.classList.add("hidden");
  nav.style.display = "none";
  $("login").classList.remove("hidden");
  $("login-user").value = ""; $("login-pass").value = "";
}

function show(view) {
  state.view = view;
  ["reservar", "mis", "calendario", "historico", "reporting", "admin"].forEach(v => {
    $(v).classList.toggle("hidden", v !== view);
  });
  document.querySelectorAll("[data-nav]").forEach(b => {
    b.classList.toggle("nav-active", b.dataset.nav === view);
  });
  if (view === "reservar") renderPlan();
  if (view === "mis") loadMisReservas();
  if (view === "calendario") loadCalendario();
  if (view === "historico") loadHistorico();
  if (view === "reporting") generarInforme();
  if (view === "admin") loadAdmin();
}

/* ── Mis reservas / Calendario ── */
function loadMisReservas() {
  api("/api/mis-reservas").then(rs => {
    const body = $("mis-body");
    body.innerHTML = "";
    if (!rs.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = t("Sin próximas reservas");
      td.className = "td text-center py-6 text-[#94A3B8]";
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    rs.forEach(r => {
      const tr = document.createElement("tr");
      tr.className = "border-t border-[#E5E7EB] tr-hov";
      [`${r.fecha}`, r.puesto.codigo, `${tm(r.hora_inicio)}–${tm(r.hora_fin)}`,
       tipoLabel(r.tipo), r.servicio.nombre].forEach(v => {
        const td = document.createElement("td");
        td.className = "td";
        td.textContent = v;
        tr.appendChild(td);
      });
      const tdA = document.createElement("td");
      tdA.className = "td";
      const b = document.createElement("button");
      b.className = "adm-mini adm-danger";
      b.textContent = t("Cancelar");
      b.onclick = () => cancelReserva(r.id);
      tdA.appendChild(b);
      tr.appendChild(tdA);
      body.appendChild(tr);
    });
  }).catch(err => alert(err.message));
}

const MESES = () => ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map(t);

function calPaso(dir) {
  let y = state.calY, m = state.calM + dir;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  state.calY = y;
  state.calM = m;
  loadCalendario();
}

function loadCalendario() {
  const hoy = new Date();
  if (state.calY === undefined) {
    state.calY = hoy.getFullYear();
    state.calM = hoy.getMonth();
  }
  const y = state.calY, m = state.calM;
  $("cal-titulo").textContent = `${MESES()[m]} ${y}`;
  const desde = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const hasta = `${y}-${String(m + 1).padStart(2, "0")}-${new Date(y, m + 1, 0).getDate()}`;
  api(`/api/ocupacion?desde=${desde}&hasta=${hasta}`).then(ocu => {
    const grid = $("cal-grid");
    grid.innerHTML = "";
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.appendChild(document.createElement("div"));
    const cap = state.puestos.filter(p => p.activo).length || 1;
    const nDias = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= nDias; d++) {
      const f = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const n = (ocu[f] && ocu[f].total) || 0;
      const pct = Math.round(n / cap * 100);
      const b = document.createElement("button");
      const fondo = pct === 0 ? "background:#fff;border-color:#E5E7EB;color:#1F2937"
        : pct < 40 ? "background:#E3E9F0;border-color:#B9C6D6;color:#1F2937"
        : pct < 70 ? "background:#B9C6D6;border-color:#8FA2B8;color:#1F2937"
        : "background:#405060;border-color:#405060;color:#fff";
      b.style.cssText = `border:1px solid;border-radius:10px;padding:7px 0 5px;${fondo}`;
      const dn = document.createElement("div");
      dn.style.cssText = "font-size:13px;font-weight:700";
      dn.textContent = d;
      const pc = document.createElement("div");
      pc.style.cssText = "font-size:10px;opacity:.75";
      pc.textContent = pct + "%";
      b.append(dn, pc);
      b.title = `${f} · ${n} ${t("puestos")} · ${pct}%`;
      b.onclick = () => { $("fecha").value = f; show("reservar"); };
      grid.appendChild(b);
    }
  }).catch(err => alert(err.message));
}

/* ── Histórico ── */
function loadHistorico() {
  const p = new URLSearchParams();
  const set = (k, v) => { if (v) p.set(k, v); };
  set("fecha_desde", $("hist-fecha-desde").value);
  set("fecha_hasta", $("hist-fecha-hasta").value);
  set("servicio_id", $("hist-servicio").value);
  set("departamento_id", $("hist-departamento").value);
  set("tipo", $("hist-tipo").value);
  const qs = p.toString();
  api(`/api/historico${qs ? "?" + qs : ""}`).then(renderHist).catch(err => alert(err.message));
}

function limpiarHistorico() {
  $("hist-fecha-desde").value = "";
  $("hist-fecha-hasta").value = "";
  $("hist-servicio").value = "";
  $("hist-departamento").value = "";
  $("hist-tipo").value = "";
  loadHistorico();
}

async function exportarCSV(origen) {
  const g = id => $(id).value;
  const f = origen === "historico"
    ? { fecha_desde: g("hist-fecha-desde"), fecha_hasta: g("hist-fecha-hasta"),
        servicio_id: g("hist-servicio"), departamento_id: g("hist-departamento"), tipo: g("hist-tipo") }
    : { fecha_desde: g("rep-fecha-desde"), fecha_hasta: g("rep-fecha-hasta"),
        servicio_id: g("rep-servicio"), departamento_id: g("rep-departamento"), tipo: g("rep-tipo") };
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
  const qs = p.toString();
  try {
    const r = await fetch(`/api/historico/export${qs ? "?" + qs : ""}`,
      { headers: { Authorization: "Bearer " + state.token } });
    if (!r.ok) throw new Error(t("Error al exportar"));
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "historico.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (err) {
    alert(err.message);
  }
}

function renderHist(reservas) {
  const body = $("hist-body");
  body.innerHTML = "";
  if (reservas.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 10;
    td.textContent = t("No hay reservas");
    td.className = "td text-center py-6 text-[#94A3B8]";
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }
  for (const r of reservas) {
    const tr = document.createElement("tr");
    tr.className = "border-t border-[#E5E7EB] tr-hov";
    const vals = [
      r.fecha,
      r.puesto.codigo,
      tm(r.hora_inicio),
      tm(r.hora_fin),
      tipoLabel(r.tipo),
      r.servicio.nombre,
      r.departamento.nombre,
      r.usuario.nombre,
    ];
    for (const v of vals) {
      const td = document.createElement("td");
      td.className = "td";
      td.textContent = v;
      tr.appendChild(td);
    }
    const tdEstado = document.createElement("td");
    tdEstado.className = "td";
    const badge = document.createElement("span");
    badge.className = "badge " + (r.cancelada ? "badge-no" : "badge-ok");
    badge.textContent = r.cancelada ? t("Cancelada") : t("Activa");
    tdEstado.appendChild(badge);
    tr.appendChild(tdEstado);
    const tdC = document.createElement("td");
    tdC.className = "td max-w-[220px] truncate";
    tdC.textContent = r.comentario || "—";
    tdC.title = r.comentario || "";
    tr.appendChild(tdC);
    body.appendChild(tr);
  }
}

/* ── Reporting ── */
function fechaISO(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseF(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
function rangoFechas(desde, hasta) {
  const out = [];
  if (!desde || !hasta) return out;
  let d = parseF(desde);
  const h = parseF(hasta);
  while (d <= h) { out.push(fechaISO(d)); d = new Date(d.getTime() + 86400000); }
  return out;
}
const ORDEN_SEM = [1, 2, 3, 4, 5, 0, 6];

function generarInforme() {
  const fd = $("rep-fecha-desde").value, fh = $("rep-fecha-hasta").value;
  if (fd && fh && fd > fh) { alert(t("El rango de fechas no es válido")); return; }
  const p = new URLSearchParams();
  const set = (k, v) => { if (v) p.set(k, v); };
  set("fecha_desde", fd);
  set("fecha_hasta", fh);
  set("servicio_id", $("rep-servicio").value);
  set("departamento_id", $("rep-departamento").value);
  set("tipo", $("rep-tipo").value);
  state.repDesde = fd || null;
  state.repHasta = fh || null;
  const qs = p.toString();
  api(`/api/historico${qs ? "?" + qs : ""}`).then(renderInforme).catch(err => alert(err.message));
}

function limpiarReporting() {
  $("rep-fecha-desde").value = "";
  $("rep-fecha-hasta").value = "";
  $("rep-servicio").value = "";
  $("rep-departamento").value = "";
  $("rep-tipo").value = "";
  generarInforme();
}

function renderInforme(rs) {
  const activas = rs.filter(r => !r.cancelada);
  const puestosActivos = state.puestos.filter(p => p.activo);
  const totalPuestos = puestosActivos.length;
  const capZona = {};
  puestosActivos.forEach(p => {
    const k = `${p.planta}|${p.zona}`;
    capZona[k] = (capZona[k] || 0) + 1;
  });
  let dias = rangoFechas(state.repDesde, state.repHasta);
  if (!dias.length) dias = [...new Set(activas.map(r => r.fecha))].sort();
  const nDias = dias.length;

  const slots = new Set();
  const porFecha = {}, porZona = {};
  activas.forEach(r => {
    const k = `${r.fecha}|${r.puesto.id}`;
    slots.add(k);
    (porFecha[r.fecha] = porFecha[r.fecha] || new Set()).add(r.puesto.id);
    const z = `${r.puesto.planta}|${r.puesto.zona}`;
    (porZona[z] = porZona[z] || new Set()).add(k);
  });

  $("rep-kpi-pct").textContent = nDias && totalPuestos ? Math.round(slots.size / (totalPuestos * nDias) * 100) + "%" : "–";
  $("rep-kpi-res").textContent = activas.length;
  $("rep-kpi-puestos").textContent = new Set(activas.map(r => r.puesto.id)).size;
  $("rep-kpi-dias").textContent = nDias;
  $("rep-sub").textContent = (state.repDesde && state.repHasta)
    ? tf("Periodo: {0} → {1} · solo reservas activas", state.repDesde, state.repHasta)
    : t("Todo el histórico · solo reservas activas");

  const tot = activas.length;
  const pct = n => (tot ? Math.round(n / tot * 100) : 0);
  const sorted = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const cS = {}, cD = {}, cU = {};
  const cT = { agente: 0, staff: 0, visita: 0 };
  activas.forEach(r => {
    bump(cS, r.servicio.nombre);
    bump(cD, r.departamento.nombre);
    if (cT[r.tipo] !== undefined) cT[r.tipo]++;
    bump(cU, r.usuario.nombre);
  });

  const colDe = (lista, nombre, fallo) => {
    const f = (lista || []).find(x => x.nombre === nombre);
    return (f && f.color) || fallo;
  };
  const elS = $("rep-por-servicio");
  elS.innerHTML = "";
  const sE = sorted(cS);
  if (!sE.length) emptyRow(elS, t("Sin datos en el periodo"));
  const sMax = sE.length ? sE[0][1] : 0;
  sE.forEach(([n, c]) => barRow(elS, `${n} · ${pct(c)}%`, c, sMax, colDe(state.servicios, n, "#405060")));

  const elD = $("rep-por-depto");
  elD.innerHTML = "";
  const dE = sorted(cD);
  if (!dE.length) emptyRow(elD, t("Sin datos en el periodo"));
  const dMax = dE.length ? dE[0][1] : 0;
  dE.forEach(([n, c]) => barRow(elD, `${n} · ${pct(c)}%`, c, dMax, colDe(state.departamentos, n, "#7C8DA0")));

  const elT = $("rep-por-tipo");
  elT.innerHTML = "";
  const tC = { agente: "#405060", staff: "#94A3B8", visita: "#C06848" };
  const tMax = Math.max(cT.agente, cT.staff, cT.visita);
  [
    { n: t("Agente"), c: cT.agente, col: tC.agente },
    { n: t("Staff"), c: cT.staff, col: tC.staff },
    { n: t("Visita"), c: cT.visita, col: tC.visita }
  ].forEach(x => barRow(elT, `${x.n} · ${pct(x.c)}%`, x.c, tMax, x.col));

  const elZ = $("rep-por-zona");
  elZ.innerHTML = "";
  const zE = Object.entries(porZona).map(([k, s]) => {
    const [pl, zo] = k.split("|");
    const capacidad = (capZona[k] || 0) * nDias;
    return { label: `P${pl} · ${zo === "ZI" ? t("Izquierda") : t("Derecha")}`, n: s.size, p: capacidad ? Math.round(s.size / capacidad * 100) : 0 };
  }).sort((a, b) => b.p - a.p);
  if (!zE.length) emptyRow(elZ, t("Sin datos en el periodo"));
  const zMax = zE.length ? zE[0].n : 0;
  zE.forEach(z => barRow(elZ, `${z.label} · ${z.p}%`, z.n, zMax, "#405060"));

  const DIAS = () => [t("Dom"), t("Lun"), t("Mar"), t("Mié"), t("Jue"), t("Vie"), t("Sáb")];
  const semSum = [0, 0, 0, 0, 0, 0, 0], semCnt = [0, 0, 0, 0, 0, 0, 0];
  dias.forEach(f => {
    const wd = parseF(f).getDay();
    semSum[wd] += (porFecha[f] ? porFecha[f].size : 0);
    semCnt[wd]++;
  });
  const elW = $("rep-por-semana");
  elW.innerHTML = "";
  const wData = ORDEN_SEM.map(wd => ({ label: DIAS()[wd], avg: semCnt[wd] ? semSum[wd] / semCnt[wd] : 0 }));
  const wMax = Math.max(1, ...wData.map(w => w.avg));
  wData.forEach(w => {
    const avgR = Math.round(w.avg * 10) / 10;
    barRow(elW, `${w.label} · ${totalPuestos ? Math.round(w.avg / totalPuestos * 100) : 0}%`, avgR, wMax, "#405060");
  });

  const porDia = dias.map(f => ({ f, n: porFecha[f] ? porFecha[f].size : 0 }));
  const altos = [...porDia].sort((a, b) => b.n - a.n).slice(0, 3);
  const bajos = [...porDia].sort((a, b) => a.n - b.n).slice(0, 3);
  const elA = $("rep-top-altos");
  elA.innerHTML = "";
  const elB = $("rep-top-bajos");
  elB.innerHTML = "";
  const topMax = altos.length ? altos[0].n : 0;
  if (!porDia.length) { emptyRow(elA, t("Sin datos")); emptyRow(elB, t("Sin datos")); }
  const dpct = n => (totalPuestos ? Math.round(n / totalPuestos * 100) : 0);
  altos.forEach(d => barRow(elA, `${d.f} · ${dpct(d.n)}%`, d.n, topMax, "#B4443C"));
  bajos.forEach(d => barRow(elB, `${d.f} · ${dpct(d.n)}%`, d.n, topMax, "#405060"));

  const elU = $("rep-usuarios");
  elU.innerHTML = "";
  const uE = sorted(cU).slice(0, 8);
  if (!uE.length) emptyRow(elU, t("Sin datos en el periodo"));
  const uMax = uE.length ? uE[0][1] : 0;
  uE.forEach(([n, c]) => barRow(elU, n, c, uMax, "#405060"));
}

/* ── Admin ── */
function showAdminTab(name) {
  state.adminTab = name;
  ["usuarios", "servicios", "puestos", "sistema"].forEach(t => {
    $(`adm-tab-${t}`).classList.toggle("hidden", t !== name);
  });
  document.querySelectorAll("[data-admintab]").forEach(b => {
    b.classList.toggle("admintab-active", b.dataset.admintab === name);
  });
}

function miniBtn(txt, cls, fn) {
  const b = document.createElement("button");
  b.className = "adm-mini" + (cls ? " " + cls : "");
  b.textContent = txt;
  b.onclick = fn;
  return b;
}

function renderGrupos() {
  const cont = $("admin-grupos");
  cont.innerHTML = "";
  if (!state.servicios.length && !state.departamentos.length) {
    emptyRow(cont, "Sin servicios");
    return;
  }
  state.servicios.forEach(s => {
    cont.appendChild(grupoBox(s.id, s.nombre,
      state.departamentos.filter(d => d.servicio_id === s.id), true, s.color));
  });
  const sin = state.departamentos.filter(d => !d.servicio_id);
  if (sin.length) cont.appendChild(grupoBox(null, t("Sin servicio"), sin, false, null));
}

function colorDot(color, cls = "") {
  const dot = document.createElement("span");
  dot.className = "w-2.5 h-2.5 rounded-full shrink-0 " + cls;
  dot.style.background = normColor(color);
  return dot;
}

function colorPicker(value, cls = "") {
  const inp = document.createElement("input");
  inp.type = "color";
  inp.value = normColor(value);
  inp.className = "w-9 h-9 p-0.5 border border-[#E2E4E9] rounded cursor-pointer shrink-0 " + cls;
  return inp;
}

function grupoBox(servicioId, titulo, deptos, conAlta, color) {
  const box = document.createElement("div");
  box.className = "rounded-xl border border-[#E5E7EB] overflow-hidden";
  const head = document.createElement("div");
  head.className = "flex items-center gap-2 px-3 py-2 bg-[#F8FAFC]";
  const nm = document.createElement("span");
  nm.className = "font-bold text-[#1F2937] text-sm adm-nombre";
  nm.textContent = titulo;
  const badge = document.createElement("span");
  badge.className = "text-[11px] text-[#64748B]";
  badge.textContent = `${deptos.length} ${t("deptos.")}`;
  head.append(colorDot(color), nm);
  head.appendChild(badge);
  const sp = document.createElement("span");
  sp.className = "flex-1";
  head.appendChild(sp);
  if (servicioId !== null) {
    const s = state.servicios.find(x => x.id === servicioId);
    head.append(miniBtn(t("Editar"), "", () => editarServicioBox(s, box)),
      document.createTextNode(" "),
      miniBtn(t("Eliminar"), "adm-danger", () => eliminarCatalogo("servicios", servicioId)));
  }
  box.appendChild(head);
  const ul = document.createElement("ul");
  ul.className = "px-3 py-1 text-sm";
  if (!deptos.length) {
    const li = document.createElement("li");
    li.className = "text-[#94A3B8] py-1";
    li.textContent = t("Sin departamentos");
    ul.appendChild(li);
  }
  deptos.forEach(d => {
    const li = document.createElement("li");
    li.className = "py-1.5 border-t border-[#F1F5F9] first:border-t-0 flex items-center gap-2 pl-4";
    li.dataset.cid = d.id;
    const dot = document.createElement("span");
    dot.className = "w-1.5 h-1.5 rounded-full shrink-0";
    dot.style.background = normColor(d.color);
    const spn = document.createElement("span");
    spn.className = "flex-1 text-[#1F2937]";
    spn.textContent = d.nombre;
    li.append(dot, spn,
      miniBtn(t("Editar"), "", () => editarDeptoRow(d, li)),
      miniBtn(t("Eliminar"), "adm-danger", () => eliminarCatalogo("departamentos", d.id)));
    ul.appendChild(li);
  });
  box.appendChild(ul);
  if (conAlta) {
    const add = document.createElement("div");
    add.className = "flex gap-2 px-3 py-2 border-t border-[#E5E7EB] bg-white";
    const inp = document.createElement("input");
    inp.className = "inp flex-1";
    inp.placeholder = t("Nuevo departamento");
    inp.id = `adm-newdepto-${servicioId}`;
    const btn = document.createElement("button");
    btn.className = "btn btn-navy";
    btn.style.padding = "7px 12px";
    btn.textContent = t("Añadir");
    btn.onclick = () => crearDepartamento(servicioId);
    const col = colorPicker(PALETTE[(state.servicios.length + state.departamentos.length) % PALETTE.length]);
    col.id = `adm-newdepto-color-${servicioId}`;
    col.title = t("Color del departamento");
    add.append(inp, col, btn);
    box.appendChild(add);
  }
  return box;
}

function editarServicioBox(s, box) {
  const head = box.querySelector("div");
  const nm = head.querySelector(".adm-nombre");
  const inp = document.createElement("input");
  inp.className = "inp flex-1";
  inp.value = s.nombre;
  const col = colorPicker(s.color);
  head.replaceChild(inp, nm);
  head.querySelectorAll("button").forEach(b => b.remove());
  head.append(col,
    miniBtn(t("Guardar"), "adm-save", () => guardarCatalogo("servicios", s.id, inp.value.trim(), col.value)),
    document.createTextNode(" "),
    miniBtn(t("Cancelar"), "", () => loadAdmin()));
  inp.focus();
  inp.select();
}

function editarDeptoRow(d, li) {
  li.innerHTML = "";
  const inp = document.createElement("input");
  inp.className = "inp flex-1";
  inp.value = d.nombre;
  const col = colorPicker(d.color);
  li.append(inp, col,
    miniBtn(t("Guardar"), "adm-save", () => guardarCatalogo("departamentos", d.id, inp.value.trim(), col.value)),
    miniBtn(t("Cancelar"), "", () => loadAdmin()));
  inp.focus();
  inp.select();
}

async function guardarCatalogo(kind, id, nombre, color) {
  if (!nombre) return;
  try {
    await api(`/api/${kind}/${id}`, { method: "PUT", json: { nombre, color } });
    await refrescarCatalogos();
    loadAdmin();
  } catch (err) {
    alert(err.message);
  }
}

async function eliminarCatalogo(kind, id) {
  const msg = kind === "servicios"
    ? t("¿Eliminar el servicio? También se eliminarán sus departamentos y sus reservas.")
    : t("¿Eliminar? También se eliminarán sus reservas asociadas.");
  if (!confirm(msg)) return;
  try {
    await api(`/api/${kind}/${id}`, { method: "DELETE" });
    await refrescarCatalogos();
    loadAdmin();
  } catch (err) {
    alert(err.message);
  }
}

function renderAdminUsuarios(usuarios) {
  state.adminUsuarios = usuarios;
  const tbody = $("admin-usuarios");
  tbody.innerHTML = "";
  if (usuarios.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = t("Sin usuarios");
    td.className = "td text-center py-6 text-[#94A3B8]";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const u of usuarios) {
    const tr = document.createElement("tr");
    tr.className = "border-t border-[#E5E7EB]";
    tr.dataset.uid = u.id;
    for (const v of [u.username, u.nombre, u.rol]) {
      const td = document.createElement("td");
      td.className = "td";
      td.textContent = v;
      tr.appendChild(td);
    }
    const tdA = document.createElement("td");
    tdA.className = "td whitespace-nowrap";
    tdA.append(miniBtn(t("Editar"), "", () => editarUsuario(u.id)),
      document.createTextNode(" "),
      miniBtn(t("Eliminar"), "adm-danger", () => eliminarUsuario(u.id)));
    tr.appendChild(tdA);
    tbody.appendChild(tr);
  }
}

function editarUsuario(id) {
  const u = (state.adminUsuarios || []).find(x => x.id === id);
  const old = document.querySelector(`#admin-usuarios tr[data-uid="${id}"]`);
  if (!u || !old) return;
  const tr = document.createElement("tr");
  tr.className = "border-t border-[#E5E7EB] bg-[#F8FAFC]";
  tr.dataset.uid = id;
  const tdU = document.createElement("td");
  tdU.className = "td font-semibold";
  tdU.textContent = u.username;
  const tdN = document.createElement("td");
  tdN.className = "td";
  const inpN = document.createElement("input");
  inpN.className = "inp au-nombre w-full mb-1.5";
  inpN.value = u.nombre;
  const inpP = document.createElement("input");
  inpP.className = "inp au-pass w-full";
  inpP.type = "password";
  inpP.placeholder = t("Nueva contraseña (opcional)");
  tdN.append(inpN, inpP);
  const tdR = document.createElement("td");
  tdR.className = "td";
  const sel = document.createElement("select");
  sel.className = "inp au-rol";
  ["staff", "admin"].forEach(r => {
    const o = document.createElement("option");
    o.value = r;
    o.textContent = r === "staff" ? "Staff" : "Admin";
    if (u.rol === r) o.selected = true;
    sel.appendChild(o);
  });
  tdR.appendChild(sel);
  const tdA = document.createElement("td");
  tdA.className = "td whitespace-nowrap";
  tdA.append(miniBtn(t("Guardar"), "adm-save", () => guardarUsuario(id)),
    document.createTextNode(" "),
    miniBtn(t("Cancelar"), "", () => loadAdmin()));
  tr.append(tdU, tdN, tdR, tdA);
  old.replaceWith(tr);
}

async function guardarUsuario(id) {
  const row = document.querySelector(`#admin-usuarios tr[data-uid="${id}"]`);
  if (!row) return;
  const body = { nombre: row.querySelector(".au-nombre").value.trim(),
                 rol: row.querySelector(".au-rol").value };
  const pw = row.querySelector(".au-pass").value;
  if (pw) body.password = pw;
  if (!body.nombre) return;
  try {
    await api(`/api/usuarios/${id}`, { method: "PUT", json: body });
    loadAdmin();
  } catch (err) {
    alert(err.message);
  }
}

async function eliminarUsuario(id) {
  if (!confirm(t("¿Eliminar este usuario?"))) return;
  try {
    await api(`/api/usuarios/${id}`, { method: "DELETE" });
    loadAdmin();
  } catch (err) {
    alert(err.message);
  }
}

function loadPuestosAdmin() {
  api("/api/puestos").then(ps => {
    state.adminPuestos = ps;
    fillAdminPuestoSelects();
    renderPuestosAdmin();
  }).catch(err => alert(err.message));
}

function fillAdminPuestoSelects() {
  const pls = [...new Set(state.adminPuestos.map(p => p.planta))].sort((a, b) => b - a);
  const zns = [...new Set(state.adminPuestos.map(p => p.zona))].sort();
  const selP = $("adm-puesto-planta"), selZ = $("adm-puesto-zona");
  const curP = selP.value, curZ = selZ.value;
  selP.innerHTML = "";
  selZ.innerHTML = "";
  pls.forEach(p => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = tf("Planta {0}", p);
    selP.appendChild(o);
  });
  zns.forEach(z => {
    const o = document.createElement("option");
    o.value = z;
    o.textContent = tf("Zona {0}", z);
    selZ.appendChild(o);
  });
  if (pls.map(String).includes(curP)) selP.value = curP;
  if (zns.includes(curZ)) selZ.value = curZ;
  const selN = $("adm-np-zona");
  const curN = selN.value;
  selN.innerHTML = "";
  zns.forEach(z => {
    const o = document.createElement("option");
    o.value = z;
    o.textContent = tf("Zona {0}", z);
    selN.appendChild(o);
  });
  const nn = document.createElement("option");
  nn.value = "__new__";
  nn.textContent = t("+ Nueva zona…");
  selN.appendChild(nn);
  if (zns.includes(curN)) selN.value = curN;
  toggleZonaNueva();
}

function toggleZonaNueva() {
  $("adm-np-zona-new-wrap").classList.toggle("hidden", $("adm-np-zona").value !== "__new__");
}

function zonasPlanta(pl) {
  const zns = [...new Set((state.adminPuestos || []).filter(p => String(p.planta) === String(pl)).map(p => p.zona))];
  const orden = state.ordenZonas && state.ordenZonas[String(pl)];
  if (orden && orden.length) {
    const idx = z => {
      const i = orden.indexOf(z);
      return i === -1 ? 999 : i;
    };
    zns.sort((a, b) => idx(a) - idx(b));
  } else {
    zns.sort();
  }
  return zns;
}

function renderOrdenZonas() {
  const pl = $("adm-puesto-planta").value;
  const cont = $("adm-orden-zonas");
  cont.innerHTML = "";
  const zns = zonasPlanta(pl);
  if (zns.length < 2) {
    const s = document.createElement("span");
    s.className = "text-xs text-[#94A3B8]";
    s.textContent = zns.length ? t("Una sola zona") : t("Sin zonas");
    cont.appendChild(s);
    return;
  }
  zns.forEach((z, i) => {
    const pill = document.createElement("span");
    pill.className = "inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-1.5 py-1 text-xs font-semibold text-[#405060]";
    const bl = document.createElement("button");
    bl.className = "adm-mini";
    bl.style.padding = "1px 7px";
    bl.textContent = "◀";
    bl.title = t("Mover a la izquierda");
    bl.disabled = i === 0;
    bl.style.opacity = i === 0 ? ".4" : "1";
    bl.onclick = () => moverZona(pl, i, -1);
    const nm = document.createElement("span");
    nm.textContent = z;
    const br = document.createElement("button");
    br.className = "adm-mini";
    br.style.padding = "1px 7px";
    br.textContent = "▶";
    br.title = t("Mover a la derecha");
    br.disabled = i === zns.length - 1;
    br.style.opacity = i === zns.length - 1 ? ".4" : "1";
    br.onclick = () => moverZona(pl, i, 1);
    pill.append(bl, nm, br);
    cont.appendChild(pill);
  });
}

function moverZona(pl, i, dir) {
  const zns = zonasPlanta(pl);
  const j = i + dir;
  if (j < 0 || j >= zns.length) return;
  [zns[i], zns[j]] = [zns[j], zns[i]];
  state.ordenZonas = { ...(state.ordenZonas || {}), [String(pl)]: zns };
  api("/api/ajustes/orden_zonas", { method: "PUT", json: { orden: state.ordenZonas } })
    .then(o => { state.ordenZonas = o; renderOrdenZonas(); })
    .catch(err => {
      alert(err.message);
      api("/api/ajustes/orden_zonas").then(o => { state.ordenZonas = o; renderOrdenZonas(); }).catch(() => {});
    });
}

function renderPuestosAdmin() {
  const pl = $("adm-puesto-planta").value, zo = $("adm-puesto-zona").value;
  renderOrdenZonas();
  const list = (state.adminPuestos || []).filter(p => String(p.planta) === pl && p.zona === zo);
  const grid = $("adm-puestos-grid");
  grid.innerHTML = "";
  const act = list.filter(p => p.activo).length;
  $("adm-puestos-count").textContent = `${act}/${list.length} ${t("activos")}`;
  list.forEach(p => {
    const b = document.createElement("button");
    b.className = "adm-chip" + (p.activo ? " adm-chip-on" : " adm-chip-off");
    b.title = `${p.codigo} · ${p.activo ? t("Activo (clic para desactivar)") : t("Inactivo (clic para activar)")}`;
    b.textContent = `F${p.fila}-L${p.lado}-${p.posicion}`;
    b.onclick = () => {
      if (state.adminBorrar) eliminarPuesto(p.id, p.codigo);
      else togglePuesto(p.id, !p.activo);
    };
    grid.appendChild(b);
  });
}

async function togglePuesto(id, activo) {
  try {
    await api(`/api/puestos/${id}`, { method: "PATCH", json: { activo } });
    loadPuestosAdmin();
  } catch (err) {
    alert(err.message);
  }
}

async function crearPuestosLote() {
  const planta = +$("adm-np-planta").value;
  let zona = $("adm-np-zona").value;
  if (zona === "__new__") zona = $("adm-np-zona-new").value.trim();
  zona = (zona || "").toUpperCase();
  const fila = +$("adm-np-fila").value;
  const l1 = +$("adm-np-lado1").value || 0;
  const l2 = +$("adm-np-lado2").value || 0;
  if (!zona || !(fila >= 1) || l1 + l2 === 0) {
    alert(t("Revisa los datos: zona, fila y al menos un despacho"));
    return;
  }
  try {
    const creados = await api("/api/puestos/lote", {
      method: "POST", json: { planta, zona, fila, lados: { 1: l1, 2: l2 } },
    });
    alert(tf("Creados {0} puestos", creados.length));
    loadPuestosAdmin();
  } catch (err) {
    alert(err.message);
  }
}

function toggleModoBorrar() {
  state.adminBorrar = !state.adminBorrar;
  const b = $("adm-btn-borrar");
  b.textContent = state.adminBorrar ? t("Terminar") : t("Eliminar puestos");
  b.classList.toggle("adm-danger", !!state.adminBorrar);
}

async function eliminarPuesto(id, codigo) {
  if (!confirm(tf("¿Eliminar {0}? No se puede si tiene reservas.", codigo))) return;
  try {
    await api(`/api/puestos/${id}`, { method: "DELETE" });
    loadPuestosAdmin();
  } catch (err) {
    alert(err.message);
  }
}

function eliminarZonaAdmin() {
  const pl = $("adm-puesto-planta").value, zo = $("adm-puesto-zona").value;
  const n = (state.adminPuestos || []).filter(p => String(p.planta) === pl && p.zona === zo).length;
  if (!confirm(tf("¿Eliminar la zona {0} de la planta {1}? Se eliminarán {2} puestos y sus reservas.", zo, pl, n))) return;
  api(`/api/zonas?planta=${pl}&zona=${encodeURIComponent(zo)}`, { method: "DELETE" })
    .then(() => loadPuestosAdmin()).catch(err => alert(err.message));
}

function eliminarPlantaAdmin() {
  const pl = $("adm-puesto-planta").value;
  const n = (state.adminPuestos || []).filter(p => String(p.planta) === pl).length;
  if (!confirm(tf("¿Eliminar la planta {0} entera? Se eliminarán {1} puestos y sus reservas.", pl, n))) return;
  api(`/api/plantas/${pl}`, { method: "DELETE" })
    .then(() => loadPuestosAdmin()).catch(err => alert(err.message));
}

function refrescarCatalogos() {
  return Promise.all([api("/api/servicios"), api("/api/departamentos")])
    .then(([s, d]) => {
      state.servicios = s;
      state.departamentos = d;
      fillSelect($("modal-servicio"), s);
      fillSelect($("modal-departamento"), d);
      fillHistSelect($("hist-servicio"), s);
      fillHistSelect($("hist-departamento"), d);
      fillHistSelect($("filtro-servicio"), s);
      fillHistSelect($("filtro-departamento"), d);
      fillHistSelect($("rep-servicio"), s);
      fillHistSelect($("rep-departamento"), d);
      actualizaRepDepto();
    });
}

function actualizaFiltroDepto() {
  const sid = +$("filtro-servicio").value || null;
  const sel = $("filtro-departamento");
  const cur = sel.value;
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = t("Todos");
  sel.appendChild(all);
  if (!sid) {
    sel.value = "";
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  state.departamentos
    .filter(dep => !dep.servicio_id || dep.servicio_id === sid)
    .forEach(dep => {
      const o = document.createElement("option");
      o.value = dep.id;
      o.textContent = dep.nombre;
      sel.appendChild(o);
    });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function cambioFiltroServicio() {
  actualizaFiltroDepto();
  renderPlan();
}

function actualizaRepDepto() {
  const sid = +$("rep-servicio").value || null;
  const sel = $("rep-departamento");
  const cur = sel.value;
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = t("Todos");
  sel.appendChild(all);
  if (!sid) {
    sel.value = "";
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  state.departamentos
    .filter(dep => !dep.servicio_id || dep.servicio_id === sid)
    .forEach(dep => {
      const o = document.createElement("option");
      o.value = dep.id;
      o.textContent = dep.nombre;
      sel.appendChild(o);
    });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function loadAdmin() {
  showAdminTab(state.adminTab || "usuarios");
  refrescarCatalogos()
    .then(() => api("/api/usuarios"))
    .then(users => {
      renderGrupos();
      renderAdminUsuarios(users);
      loadPuestosAdmin();
      cargarBackups();
    })
    .catch(err => alert(err.message));
}

function cargarBackups() {
  api("/api/ajustes/backups").then(fs => {
    const ul = $("backup-list");
    ul.innerHTML = "";
    if (!fs.length) {
      const li = document.createElement("li");
      li.className = "text-[#94A3B8]";
      li.textContent = t("Aún no hay copias");
      ul.appendChild(li);
      return;
    }
    fs.forEach(f => {
      const li = document.createElement("li");
      li.textContent = f;
      ul.appendChild(li);
    });
  }).catch(() => {});
}

async function crearBackup() {
  try {
    const r = await api("/api/ajustes/backup", { method: "POST" });
    alert(tf("Copia creada: {0}", r.archivo));
    cargarBackups();
  } catch (err) {
    alert(err.message);
  }
}

async function crearServicio() {
  const input = $("admin-serv-nombre");
  if (!input.value.trim()) return;
  try {
    await api("/api/servicios", { method: "POST", json: { nombre: input.value.trim(), color: $("admin-serv-color").value } });
    input.value = "";
    await refrescarCatalogos();
    loadAdmin();
  } catch (err) {
    alert(err.message);
  }
}

async function crearDepartamento(servicioId) {
  const input = $(`adm-newdepto-${servicioId}`);
  if (!input || !input.value.trim()) return;
  try {
    await api("/api/departamentos", { method: "POST", json: { nombre: input.value.trim(), servicio_id: servicioId, color: $(`adm-newdepto-color-${servicioId}`).value } });
    await refrescarCatalogos();
    loadAdmin();
  } catch (err) {
    alert(err.message);
  }
}

async function crearUsuario() {
  const u = $("admin-user-username").value.trim();
  const p = $("admin-user-password").value;
  const n = $("admin-user-nombre").value.trim();
  if (!u || !p || !n) return;
  try {
    await api("/api/usuarios", { method: "POST", json: { username: u, password: p, nombre: n, rol: $("admin-user-rol").value } });
    $("admin-user-username").value = "";
    $("admin-user-password").value = "";
    $("admin-user-nombre").value = "";
    api("/api/usuarios").then(renderAdminUsuarios).catch(err => alert(err.message));
  } catch (err) {
    alert(err.message);
  }
}

/* ── Desk grouping ── */
function groupDesks(puestos) {
  const by = {};
  puestos.forEach(p => {
    const key = `${p.planta}|${p.zona}|${p.fila}|${p.lado}`;
    (by[key] = by[key] || []).push(p);
  });
  const desks = [];
  for (const key in by) {
    const list = by[key].sort((a, b) => a.posicion - b.posicion);
    for (let i = 0; i < list.length; i += 2) {
      const pair = list.slice(i, i + 2);
      desks.push({
        positions: pair,
        planta: pair[0].planta, zona: pair[0].zona,
        fila: pair[0].fila, lado: pair[0].lado,
        posRange: pair.map(p => p.posicion).join(" · "),
        ids: pair.map(p => p.id),
        codigos: pair.map(p => p.codigo),
      });
    }
  }
  return desks;
}

/* ── Overlap check ── */
function overlaps(r, desde, hasta) {
  const ri = tm(r.hora_inicio), ro = tm(r.hora_fin);
  return ri < hasta && ro > desde;
}

function deskStatus(desk, desde, hasta) {
  const activeIds = desk.ids.filter(id => {
    const p = desk.positions.find(x => x.id === id);
    return p && p.activo;
  });
  if (!activeIds.length) return { state: "disabled", reservations: [] };
  const activeSet = new Set(activeIds);
  const resByPos = {};
  state.reservas.forEach(r => {
    if (overlaps(r, desde, hasta) && activeSet.has(r.puesto.id)) resByPos[r.puesto.id] = r;
  });
  const mine = state.reservas.filter(r =>
    overlaps(r, desde, hasta) && r.usuario.id === state.usuario.id && activeIds.includes(r.puesto.id));
  const occupied = activeIds.filter(id => resByPos[id]);
  const free = activeIds.filter(id => !resByPos[id]);
  if (occupied.length === 0) return { state: "free", reservations: [], freeIds: activeIds };
  if (free.length === 0) return mine.length
    ? { state: "mine", reservations: mine, freeIds: free }
    : { state: "occupied", reservations: Object.values(resByPos) };
  return { state: "mixed", reservations: Object.values(resByPos), freeIds: free };
}

/* ── SVG desk ── */
function deskSVG() {
  return `<svg viewBox="0 0 60 36" class="w-full h-full" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="56" height="14" rx="2" fill="#EDF1F5" stroke="#B6C0CC" stroke-width="1"/>
    <circle cx="18" cy="28" r="6" fill="#E2E8F0" stroke="#A7B3C0" stroke-width="1"/>
    <circle cx="42" cy="28" r="6" fill="#E2E8F0" stroke="#A7B3C0" stroke-width="1"/>
  </svg>`;
}

/* ── Resumen del día ── */
function barRow(container, nombre, n, max, color) {
  const row = document.createElement("div");
  const head = document.createElement("div");
  head.className = "flex items-baseline justify-between text-[13px] mb-1";
  const nm = document.createElement("span");
  nm.className = "text-[#1F2937] truncate pr-2";
  nm.textContent = nombre;
  const ct = document.createElement("span");
  ct.className = "font-bold text-[#405060]";
  ct.textContent = n;
  head.appendChild(nm);
  head.appendChild(ct);
  const track = document.createElement("div");
  track.className = "h-1.5 rounded-full bg-[#EDF1F5]";
  const fill = document.createElement("div");
  fill.className = "h-1.5 rounded-full";
  fill.style.width = (max > 0 ? Math.round(n / max * 100) : 0) + "%";
  fill.style.background = color;
  track.appendChild(fill);
  row.appendChild(head);
  row.appendChild(track);
  container.appendChild(row);
}

function emptyRow(container, msg) {
  const p = document.createElement("p");
  p.className = "text-[13px] text-[#94A3B8]";
  p.textContent = msg;
  container.appendChild(p);
}

function renderResumen() {
  const { desde, hasta } = state;
  const activos = new Set(state.puestos.filter(p => p.activo).map(p => p.id));
  const resByPos = {};
  state.reservas.forEach(r => {
    if (overlaps(r, desde, hasta) && activos.has(r.puesto.id)) resByPos[r.puesto.id] = r;
  });
  const total = activos.size;
  const ocup = Object.keys(resByPos).length;
  const libres = total - ocup;
  $("res-libres").textContent = libres;
  $("res-ocupados").textContent = ocup;
  $("res-pct").textContent = (total > 0 ? Math.round(ocup / total * 100) : 0) + "%";
  $("resumen-sub").textContent = `${state.fecha} · ${tm(desde)}–${tm(hasta)}`;

  const capPl = {}, ocuPl = {}, mapaPl = {};
  state.puestos.forEach(p => {
    mapaPl[p.id] = p.planta;
    if (p.activo) capPl[p.planta] = (capPl[p.planta] || 0) + 1;
  });
  Object.keys(resByPos).forEach(pid => {
    const pl = mapaPl[+pid];
    if (pl !== undefined) ocuPl[pl] = (ocuPl[pl] || 0) + 1;
  });
  const af = $("res-aforo");
  af.innerHTML = "";
  Object.keys(capPl).sort().forEach(pl => {
    const o = ocuPl[pl] || 0, t = capPl[pl];
    const pc = t ? Math.round(o / t * 100) : 0;
    const chip = document.createElement("span");
    chip.className = "inline-flex items-center gap-1.5 font-semibold";
    const dot = document.createElement("span");
    dot.style.cssText = `width:9px;height:9px;border-radius:9999px;background:${pc < 70 ? "#27AE60" : pc < 90 ? "#D9A35E" : "#B4443C"}`;
    const tx = document.createElement("span");
    tx.textContent = `P${pl} · ${o}/${t}`;
    tx.title = `${pc}% ${t("ocupacion")}`;
    chip.append(dot, tx);
    af.appendChild(chip);
  });

  const byServ = {}, byDep = {};
  const byTipo = { agente: 0, staff: 0, visita: 0 };
  Object.values(resByPos).forEach(r => {
    byServ[r.servicio.nombre] = (byServ[r.servicio.nombre] || 0) + 1;
    byDep[r.departamento.nombre] = (byDep[r.departamento.nombre] || 0) + 1;
    if (byTipo[r.tipo] !== undefined) byTipo[r.tipo]++;
  });

  const sEl = $("res-servicios");
  sEl.innerHTML = "";
  const sEntries = Object.entries(byServ).sort((a, b) => b[1] - a[1]);
  if (!sEntries.length) emptyRow(sEl, t("Sin reservas en este tramo"));
  const sMax = sEntries.length ? sEntries[0][1] : 0;
  sEntries.forEach(([n, c]) => barRow(sEl, n, c, sMax, "#405060"));

  const dEl = $("res-deptos");
  dEl.innerHTML = "";
  const dEntries = Object.entries(byDep).sort((a, b) => b[1] - a[1]);
  if (!dEntries.length) emptyRow(dEl, t("Sin reservas en este tramo"));
  const dMax = dEntries.length ? dEntries[0][1] : 0;
  dEntries.forEach(([n, c]) => barRow(dEl, n, c, dMax, "#7C8DA0"));

  const tEl = $("res-tipos");
  tEl.innerHTML = "";
  const tColors = { agente: "#405060", staff: "#94A3B8", visita: "#C06848" };
  const tMax = Math.max(byTipo.agente, byTipo.staff, byTipo.visita);
  [[t("Agente"), byTipo.agente, tColors.agente], [t("Staff"), byTipo.staff, tColors.staff], [t("Visita"), byTipo.visita, tColors.visita]]
    .forEach(([n, c, col]) => barRow(tEl, n, c, tMax, col));
}

/* ── Render plan ── */
function ordenarZonas(zonas, planta) {
  const orden = state.ordenZonas && state.ordenZonas[String(planta)];
  if (orden && orden.length) {
    const idx = z => {
      const i = orden.indexOf(z);
      return i === -1 ? 999 : i;
    };
    return [...zonas].sort((a, b) => idx(a) - idx(b));
  }
  const minId = {};
  state.puestos.forEach(p => {
    if (p.planta !== planta) return;
    if (minId[p.zona] === undefined || p.id < minId[p.zona]) minId[p.zona] = p.id;
  });
  return [...zonas].sort((a, b) => (minId[a] ?? 1e12) - (minId[b] ?? 1e12));
}

function renderPlan() {
  const fecha = $("fecha").value || todayStr();
  const desde = $("desde").value || "08:00";
  const hasta = $("hasta").value || "19:00";
  state.fecha = fecha;
  state.desde = desde;
  state.hasta = hasta;
  state.fServicio = +$("filtro-servicio").value || null;
  state.fDepto = +$("filtro-departamento").value || null;

  api("/api/puestos").then(puestos => {
    state.puestos = puestos;
    return api(`/api/reservas?fecha=${fecha}`);
  }).then(reservas => {
    state.reservas = reservas;
    renderResumen();
    const allDesks = groupDesks(state.puestos);
    const plantas = [...new Set(state.puestos.map(p => p.planta))].sort((a, b) => b - a);
    const container = $("plan");
    container.innerHTML = "";

    plantas.forEach(planta => {
      const pDesks = allDesks.filter(d => d.planta === planta);
      const card = document.createElement("div");
      card.className = "card plan-card p-5";
      card.innerHTML = `<h3 class="font-extrabold text-base text-[#1F2937] mb-3">${tf("Planta {0}", planta)}</h3>`;

      const zonas = ordenarZonas([...new Set(pDesks.map(d => d.zona))], planta);
      const multiZona = zonas.length >= 2;

      const zonasRow = document.createElement("div");
      zonasRow.className = "flex gap-0 items-start";

      zonas.forEach((zona, zi) => {
        const zDesks = pDesks.filter(d => d.zona === zona);
        const zonaEl = document.createElement("div");
        zonaEl.className = "flex-1";
        const zonaLabel = zona === "ZI" ? t("Izquierda") : t("Derecha");
        const count = zDesks.reduce((s, d) => s + d.positions.length, 0);
        zonaEl.innerHTML = `<h4 class="text-sm font-semibold mb-2 text-[#405060]">${t("Zona")} ${zonaLabel} <span class="font-normal text-[#64748B]">(${count} ${t("puestos")})</span></h4>`;
        if (state.masiva) {
          const btnT = document.createElement("button");
          btnT.className = "adm-mini mb-2";
          btnT.textContent = t("Toda");
          btnT.title = t("Seleccionar toda la zona libre");
          btnT.onclick = () => seleccionarZona(zDesks, desde, hasta);
          zonaEl.appendChild(btnT);
        }

        const filas = [...new Set(zDesks.map(d => d.fila))].sort((a, b) => a - b);
        filas.forEach(fila => {
          const fDesks = zDesks.filter(d => d.fila === fila);
          const lado1 = fDesks.filter(d => d.lado === 1);
          const lado2 = fDesks.filter(d => d.lado === 2);
          const rowEl = document.createElement("div");
          rowEl.className = "flex items-center gap-1 mb-1";
          rowEl.innerHTML = `<span class="text-xs text-[#94A3B8] w-5 text-right">${fila}</span>`;
          const leftDiv = document.createElement("div");
          leftDiv.className = "flex gap-1";
          lado1.forEach(d => leftDiv.appendChild(deskEl(d, desde, hasta)));
          rowEl.appendChild(leftDiv);
          if (lado2.length > 0) {
            const aisle = document.createElement("div");
            aisle.className = "div-v self-stretch mx-1";
            rowEl.appendChild(aisle);
            const rightDiv = document.createElement("div");
            rightDiv.className = "flex gap-1";
            lado2.forEach(d => rightDiv.appendChild(deskEl(d, desde, hasta)));
            rowEl.appendChild(rightDiv);
          }
          zonaEl.appendChild(rowEl);
        });

        zonasRow.appendChild(zonaEl);

        if (multiZona && zi < zonas.length - 1) {
          const pasillo = document.createElement("div");
          pasillo.className = "w-8 flex flex-col items-center justify-center self-stretch pt-8";
          pasillo.innerHTML = `<div class="div-v flex-1"></div><span class="text-[10px] text-[#94A3B8] rotate-90 whitespace-nowrap my-2 tracking-wider">${t("PASILLO")}</span><div class="div-v flex-1"></div>`;
          zonasRow.appendChild(pasillo);
        }
      });

      if (!multiZona) {
        const placeholder = document.createElement("div");
        placeholder.className = "flex-1 border-2 border-dashed border-[#CBD5E1] rounded-lg flex items-center justify-center h-48 text-[#94A3B8] bg-[#F8FAFC]";
        placeholder.textContent = t("No disponible");
        zonasRow.appendChild(placeholder);
      }

      card.appendChild(zonasRow);
      container.appendChild(card);
    });
  }).catch(err => { if (state.token) alert(err.message); });
}

function deskEl(desk, desde, hasta) {
  const status = deskStatus(desk, desde, hasta);
  const el = document.createElement("div");
  el.className = "desk w-12 h-12 rounded-xl border cursor-pointer flex flex-col items-center justify-center text-xs";
  el.innerHTML = `${deskSVG()}<span class="text-[9px] leading-none mt-0.5 text-[#64748B]">${desk.posRange}</span>`;
  el.title = desk.codigos.join(" · ");

  if (status.state === "disabled") {
    el.classList.add("desk-disabled", "cursor-default");
    el.title = t("Deshabilitado");
  } else   if (status.state === "mine") {
    const r = status.reservations[0];
    el.classList.add("desk-mine");
    el.title = tf("Tu reserva · {0} {1}-{2} · Clic para ver y cancelar",
      tipoLabel(r.tipo), tm(r.hora_inicio), tm(r.hora_fin));
    el.onclick = () => (state.masiva && status.freeIds.length
      ? toggleSeleccion(desk, desde, hasta)
      : openModal(desk, status.freeIds, desde, hasta));
  } else if (status.state === "occupied") {
    const r = status.reservations[0];
    el.classList.add("desk-occupied");
    el.title = tf("Ocupado: {0} · {1} · {2} {3}-{4} · Clic para ver",
      r.servicio.nombre, r.departamento.nombre, tipoLabel(r.tipo), tm(r.hora_inicio), tm(r.hora_fin));
    el.onclick = () => openModal(desk, [], desde, hasta);
  } else if (status.state === "mixed") {
    el.classList.add("desk-mixed");
    el.title = t("Algunas posiciones libres · Clic para ver y reservar");
    el.onclick = () => (state.masiva ? toggleSeleccion(desk, desde, hasta) : openModal(desk, status.freeIds, desde, hasta));
  } else if (status.state === "free") {
    el.classList.add("desk-free");
    el.onclick = () => (state.masiva ? toggleSeleccion(desk, desde, hasta) : openModal(desk, undefined, desde, hasta));
  }
  if (state.masiva) {
    const ids = status.freeIds || [];
    if (ids.length && ids.some(id => state.masivaSel.has(id))) el.classList.add("desk-selected");
  }
  if (status.state === "occupied" || status.state === "mine") {
    const ss = serviciosDe(status.reservations);
    if (ss.length >= 2) {
      el.style.background = tint(COLOR_SHARED);
      el.style.borderColor = COLOR_SHARED;
      el.title = tf("Compartida: {0} + {1} · Clic para ver", ss[0].nombre, ss[1].nombre);
    } else if (ss.length === 1) {
      el.style.background = tint(ss[0].color);
      el.style.borderColor = normColor(ss[0].color);
    }
    if (status.state === "mine") {
      el.style.borderColor = "#405060";
      el.style.borderWidth = "2px";
    }
  }
  const fS = state.fServicio, fD = state.fDepto;
  if (fS || fD) {
    const match = status.reservations.some(r =>
      (!fS || r.servicio.id === fS) && (!fD || r.departamento.id === fD));
    if (match) {
      el.classList.add("desk-match");
      el.title = tf("Coincide con el filtro · {0}", el.title);
    } else if (status.state !== "free" && status.state !== "disabled") {
      el.classList.add("desk-dim");
    }
  }
  return el;
}

/* ── Reserva masiva ── */
function toggleMasiva() {
  state.masiva = !state.masiva;
  state.masivaSel = new Set();
  $("masiva-bar").classList.toggle("hidden", !state.masiva);
  const b = $("btn-masiva");
  b.classList.toggle("btn-navy", state.masiva);
  b.classList.toggle("btn-ghost", !state.masiva);
  actualizaBarraMasiva();
  renderPlan();
}

function actualizaBarraMasiva() {
  $("masiva-count").textContent = (state.masivaSel || new Set()).size;
}

function limpiarMasiva() {
  state.masivaSel = new Set();
  actualizaBarraMasiva();
  renderPlan();
}

function toggleSeleccion(desk, desde, hasta) {
  const st = deskStatus(desk, desde, hasta);
  const ids = st.freeIds || [];
  if (!ids.length) return;
  if (ids.every(id => state.masivaSel.has(id))) ids.forEach(id => state.masivaSel.delete(id));
  else ids.forEach(id => state.masivaSel.add(id));
  actualizaBarraMasiva();
  renderPlan();
}

function seleccionarZona(zDesks, desde, hasta) {
  zDesks.forEach(d => {
    const st = deskStatus(d, desde, hasta);
    (st.freeIds || []).forEach(id => state.masivaSel.add(id));
  });
  actualizaBarraMasiva();
  renderPlan();
}

function openModalLote() {
  const ids = [...(state.masivaSel || [])];
  if (!ids.length) return;
  state.modalModo = "lote";
  $("modal-title").textContent = tf("Reserva masiva · {0} puestos", ids.length);
  $("modal-info").innerHTML = "";
  $("modal-masiva-info").textContent = `${ids.length} ${t("puestos")} · ${state.fecha} · ${state.desde}–${state.hasta}`;
  fillServiciosLote();
  fillDeptosLote();
  $("modal-form").classList.add("hidden");
  $("modal-masiva").classList.remove("hidden");
  $("modal-save").classList.add("hidden");
  $("modal-save-lote").classList.remove("hidden");
  $("modal").classList.remove("hidden");
}

function fillServiciosLote() {
  const sel = $("modal-lote-servicio");
  const cur = sel.value;
  fillSelect(sel, state.servicios);
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function fillDeptosLote() {
  const sid = +$("modal-lote-servicio").value || null;
  const sel = $("modal-lote-departamento");
  const cur = sel.value;
  sel.innerHTML = "";
  state.departamentos
    .filter(d => !d.servicio_id || (sid && d.servicio_id === sid))
    .forEach(d => {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = d.nombre;
      sel.appendChild(o);
    });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
}

async function saveLote() {
  const ids = [...(state.masivaSel || [])];
  const comentario = $("modal-comentario").value.trim();
  if (!comentario) {
    alert(t("Indica el motivo de la reserva"));
    return;
  }
  try {
    await api("/api/reservas/lote", { method: "POST", json: {
      puesto_ids: ids,
      fecha: state.fecha,
      hora_inicio: state.desde + ":00",
      hora_fin: state.hasta + ":00",
      tipo: $("modal-lote-tipo").value,
      servicio_id: +$("modal-lote-servicio").value,
      departamento_id: +$("modal-lote-departamento").value,
      comentario,
    }});
    state.masivaSel = new Set();
    $("modal-comentario").value = "";
    closeModal();
    actualizaBarraMasiva();
    renderPlan();
  } catch (err) {
    alert(err.message);
  }
}

/* ── Modal ── */
function reservaEn(puestoId, desde, hasta) {
  return state.reservas.find(r => r.puesto.id === puestoId && overlaps(r, desde, hasta));
}

function fillDeptosForServicio() {
  const sid = +$("modal-servicio").value || null;
  const sel = $("modal-departamento");
  const cur = sel.value;
  sel.innerHTML = "";
  state.departamentos
    .filter(d => !d.servicio_id || d.servicio_id === sid)
    .forEach(d => {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = d.nombre;
      sel.appendChild(o);
    });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function openModal(desk, freeIds, desde, hasta) {
  modalDesk = desk;
  state.modalModo = "single";
  state.modalCtx = { desk, freeIds, desde, hasta };
  $("modal-masiva").classList.add("hidden");
  $("modal-save-lote").classList.add("hidden");
  $("modal-form").classList.remove("hidden");
  desde = desde || state.desde;
  hasta = hasta || state.hasta;
  const hasFree = !freeIds || freeIds.length > 0;
  $("modal-title").textContent = `${t(hasFree ? "Reservar" : "Mesa")} · ${desk.codigos.join(" / ")}`;
  fillDeptosForServicio();
  const info = $("modal-info");
  info.innerHTML = "";
  for (const p of desk.positions) {
    const r = reservaEn(p.id, desde, hasta);
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] px-3 py-2 text-[13px]";
    const txt = document.createElement("span");
    if (!p.activo) {
      txt.className = "text-[#94A3B8]";
      txt.textContent = `${p.codigo} · ${t("Deshabilitado")}`;
      row.appendChild(txt);
    } else if (!r) {
      txt.className = "text-[#64748B]";
      txt.textContent = `${p.codigo} · ${t("Libre")}`;
      row.appendChild(txt);
    } else {
      const own = r.usuario.id === state.usuario.id;
      const isAdmin = state.usuario.rol === "admin";
      const dot = document.createElement("span");
      dot.style.cssText = `width:10px;height:10px;border-radius:9999px;flex-shrink:0;background:${normColor(r.departamento.color)}`;
      txt.className = "text-[#1F2937] flex-1";
      txt.textContent = `${p.codigo} · ${r.servicio.nombre} · ${r.departamento.nombre} · ${tipoLabel(r.tipo)}${own ? ` (${t("tuya")})` : (isAdmin ? ` · ${r.usuario.nombre}` : "")}`;
      row.append(dot, txt);
      const fav = document.createElement("button");
      const esFav = state.usuario.favorito_puesto_id === p.id;
      fav.textContent = "★";
      fav.title = esFav ? t("Quitar de favorito") : t("Marcar como mi puesto");
      fav.style.cssText = `font-size:15px;line-height:1;color:${esFav ? "#C06848" : "#CBD5E1"}`;
      fav.onclick = () => setFavorito(esFav ? null : p.id);
      row.appendChild(fav);
      if (own || isAdmin) {
        const b = document.createElement("button");
        b.className = "btn btn-ghost";
        b.style.padding = "4px 10px";
        b.style.fontSize = "12px";
        b.textContent = t("Cancelar");
        b.onclick = () => cancelReserva(r.id);
        row.appendChild(b);
      }
    }
    info.appendChild(row);
  }
  const posSelect = $("modal-puesto");
  posSelect.innerHTML = "";
  const positions = desk.positions.filter(p => p.activo && (!freeIds || freeIds.includes(p.id)));
  for (const p of positions) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.codigo;
    posSelect.appendChild(opt);
  }
  $("modal-form").classList.toggle("hidden", !hasFree);
  $("modal-save").classList.toggle("hidden", !hasFree);
  $("modal").classList.remove("hidden");
}

function closeModal() { $("modal").classList.add("hidden"); modalDesk = null; state.modalModo = null; }

async function setFavorito(pid) {
  try {
    const u = await api("/api/usuarios/yo/favorito", { method: "PUT", json: { puesto_id: pid } });
    state.usuario.favorito_puesto_id = u.favorito_puesto_id;
    localStorage.setItem("nido_usuario", JSON.stringify(state.usuario));
    if (state.modalModo === "single" && state.modalCtx && !$("modal").classList.contains("hidden")) {
      const c = state.modalCtx;
      openModal(c.desk, c.freeIds, c.desde, c.hasta);
    }
  } catch (err) {
    alert(err.message);
  }
}

function irAFavorito() {
  const fid = state.usuario && state.usuario.favorito_puesto_id;
  if (!fid) {
    alert(t("Marca tu puesto con ★ en cualquier mesa"));
    return;
  }
  const p = (state.puestos || []).find(x => x.id === fid);
  if (!p || !p.activo) {
    alert(t("Tu puesto ya no está disponible"));
    return;
  }
  const desk = groupDesks(state.puestos).find(d => d.ids.includes(fid));
  if (!desk) return;
  openModal(desk, undefined, state.desde, state.hasta);
}

async function saveReserva() {
  if (!modalDesk) return;
  const rep = Math.min(12, Math.max(1, +$("modal-repeticiones").value || 1));
  const body = {
    puesto_id: +$("modal-puesto").value,
    fecha: state.fecha,
    hora_inicio: state.desde + ":00",
    hora_fin: state.hasta + ":00",
    tipo: $("modal-tipo").value,
    servicio_id: +$("modal-servicio").value,
    departamento_id: +$("modal-departamento").value,
  };
  try {
    if (rep > 1) {
      await api("/api/reservas/recurrente", { method: "POST",
        json: { ...body, comentario: null, repeticiones: rep } });
      alert(tf("Creadas {0} reservas semanales", rep));
    } else {
      await api("/api/reservas", { method: "POST", json: body });
    }
    closeModal();
    renderPlan();
  } catch (err) {
    alert(err.message);
  }
}

async function cancelReserva(id) {
  if (!confirm(t("¿Cancelar esta reserva?"))) return;
  try {
    await api(`/api/reservas/${id}/cancelar`, { method: "POST" });
    closeModal();
    renderPlan();
    if (!$("mis").classList.contains("hidden")) loadMisReservas();
  } catch (err) {
    alert(err.message);
  }
}

/* ── Sesión persistente ── */
applyI18n();
(function restaurarSesion() {
  try {
    const t = localStorage.getItem("nido_token");
    const u = JSON.parse(localStorage.getItem("nido_usuario") || "null");
    if (t && u && u.id) {
      state.token = t;
      state.usuario = u;
      enter();
    }
  } catch {
    logout();
  }
})();

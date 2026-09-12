const $ = (id) => document.getElementById(id);
const state = { token: null, usuario: null, puestos: [], reservas: [], servicios: [], departamentos: [] };
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
        throw new Error(d?.detail || "Error");
      }
      return d;
    });
}

function tm(hhmmss) { return (hhmmss || "").slice(0, 5); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
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
  all.textContent = "Todos";
  el.prepend(all);
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
    $("login-error").textContent = err.message || "Credenciales inválidas";
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
  Promise.all([api("/api/servicios"), api("/api/departamentos")])
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
  ["reservar", "historico", "reporting", "admin"].forEach(v => {
    $(v).classList.toggle("hidden", v !== view);
  });
  document.querySelectorAll("[data-nav]").forEach(b => {
    b.classList.toggle("nav-active", b.dataset.nav === view);
  });
  if (view === "reservar") renderPlan();
  if (view === "historico") loadHistorico();
  if (view === "reporting") generarInforme();
  if (view === "admin") loadAdmin();
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

function renderHist(reservas) {
  const body = $("hist-body");
  body.innerHTML = "";
  if (reservas.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.textContent = "No hay reservas";
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
      r.tipo[0].toUpperCase() + r.tipo.slice(1),
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
    badge.textContent = r.cancelada ? "Cancelada" : "Activa";
    tdEstado.appendChild(badge);
    tr.appendChild(tdEstado);
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
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ORDEN_SEM = [1, 2, 3, 4, 5, 0, 6];

function generarInforme() {
  const fd = $("rep-fecha-desde").value, fh = $("rep-fecha-hasta").value;
  if (fd && fh && fd > fh) { alert("El rango de fechas no es válido"); return; }
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
  const totalPuestos = state.puestos.length;
  const capZona = {};
  state.puestos.forEach(p => {
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
    ? `Periodo: ${state.repDesde} → ${state.repHasta} · solo reservas activas`
    : "Todo el histórico · solo reservas activas";

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

  const elS = $("rep-por-servicio");
  elS.innerHTML = "";
  const sE = sorted(cS);
  if (!sE.length) emptyRow(elS, "Sin datos en el periodo");
  const sMax = sE.length ? sE[0][1] : 0;
  sE.forEach(([n, c]) => barRow(elS, `${n} · ${pct(c)}%`, c, sMax, "#405060"));

  const elD = $("rep-por-depto");
  elD.innerHTML = "";
  const dE = sorted(cD);
  if (!dE.length) emptyRow(elD, "Sin datos en el periodo");
  const dMax = dE.length ? dE[0][1] : 0;
  dE.forEach(([n, c]) => barRow(elD, `${n} · ${pct(c)}%`, c, dMax, "#7C8DA0"));

  const elT = $("rep-por-tipo");
  elT.innerHTML = "";
  const tC = { agente: "#405060", staff: "#94A3B8", visita: "#C06848" };
  const tMax = Math.max(cT.agente, cT.staff, cT.visita);
  [["Agente", cT.agente], ["Staff", cT.staff], ["Visita", cT.visita]]
    .forEach(([n, c]) => barRow(elT, `${n} · ${pct(c)}%`, c, tMax, tC[n.toLowerCase()]));

  const elZ = $("rep-por-zona");
  elZ.innerHTML = "";
  const zE = Object.entries(porZona).map(([k, s]) => {
    const [pl, zo] = k.split("|");
    const capacidad = (capZona[k] || 0) * nDias;
    return { label: `P${pl} · ${zo === "ZI" ? "Izquierda" : "Derecha"}`, n: s.size, p: capacidad ? Math.round(s.size / capacidad * 100) : 0 };
  }).sort((a, b) => b.p - a.p);
  if (!zE.length) emptyRow(elZ, "Sin datos en el periodo");
  const zMax = zE.length ? zE[0].n : 0;
  zE.forEach(z => barRow(elZ, `${z.label} · ${z.p}%`, z.n, zMax, "#405060"));

  const semSum = [0, 0, 0, 0, 0, 0, 0], semCnt = [0, 0, 0, 0, 0, 0, 0];
  dias.forEach(f => {
    const wd = parseF(f).getDay();
    semSum[wd] += (porFecha[f] ? porFecha[f].size : 0);
    semCnt[wd]++;
  });
  const elW = $("rep-por-semana");
  elW.innerHTML = "";
  const wData = ORDEN_SEM.map(wd => ({ label: DIAS[wd], avg: semCnt[wd] ? semSum[wd] / semCnt[wd] : 0 }));
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
  if (!porDia.length) { emptyRow(elA, "Sin datos"); emptyRow(elB, "Sin datos"); }
  const dpct = n => (totalPuestos ? Math.round(n / totalPuestos * 100) : 0);
  altos.forEach(d => barRow(elA, `${d.f} · ${dpct(d.n)}%`, d.n, topMax, "#B4443C"));
  bajos.forEach(d => barRow(elB, `${d.f} · ${dpct(d.n)}%`, d.n, topMax, "#405060"));

  const elU = $("rep-usuarios");
  elU.innerHTML = "";
  const uE = sorted(cU).slice(0, 8);
  if (!uE.length) emptyRow(elU, "Sin datos en el periodo");
  const uMax = uE.length ? uE[0][1] : 0;
  uE.forEach(([n, c]) => barRow(elU, n, c, uMax, "#405060"));
}

/* ── Admin ── */
function showAdminTab(name) {
  state.adminTab = name;
  ["usuarios", "servicios", "puestos"].forEach(t => {
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
      state.departamentos.filter(d => d.servicio_id === s.id), true));
  });
  const sin = state.departamentos.filter(d => !d.servicio_id);
  if (sin.length) cont.appendChild(grupoBox(null, "Sin servicio", sin, false));
}

function grupoBox(servicioId, titulo, deptos, conAlta) {
  const box = document.createElement("div");
  box.className = "rounded-xl border border-[#E5E7EB] overflow-hidden";
  const head = document.createElement("div");
  head.className = "flex items-center gap-2 px-3 py-2 bg-[#F8FAFC]";
  const nm = document.createElement("span");
  nm.className = "font-bold text-[#1F2937] text-sm";
  nm.textContent = titulo;
  const badge = document.createElement("span");
  badge.className = "text-[11px] text-[#64748B]";
  badge.textContent = `${deptos.length} deptos.`;
  head.appendChild(nm);
  head.appendChild(badge);
  const sp = document.createElement("span");
  sp.className = "flex-1";
  head.appendChild(sp);
  if (servicioId !== null) {
    const s = state.servicios.find(x => x.id === servicioId);
    head.append(miniBtn("Editar", "", () => editarServicioBox(s, box)),
      document.createTextNode(" "),
      miniBtn("Eliminar", "adm-danger", () => eliminarCatalogo("servicios", servicioId)));
  }
  box.appendChild(head);
  const ul = document.createElement("ul");
  ul.className = "px-3 py-1 text-sm";
  if (!deptos.length) {
    const li = document.createElement("li");
    li.className = "text-[#94A3B8] py-1";
    li.textContent = "Sin departamentos";
    ul.appendChild(li);
  }
  deptos.forEach(d => {
    const li = document.createElement("li");
    li.className = "py-1.5 border-t border-[#F1F5F9] first:border-t-0 flex items-center gap-2 pl-4";
    li.dataset.cid = d.id;
    const dot = document.createElement("span");
    dot.className = "w-1.5 h-1.5 rounded-full bg-[#94A3B8] shrink-0";
    const spn = document.createElement("span");
    spn.className = "flex-1 text-[#1F2937]";
    spn.textContent = d.nombre;
    li.append(dot, spn,
      miniBtn("Editar", "", () => editarDeptoRow(d, li)),
      miniBtn("Eliminar", "adm-danger", () => eliminarCatalogo("departamentos", d.id)));
    ul.appendChild(li);
  });
  box.appendChild(ul);
  if (conAlta) {
    const add = document.createElement("div");
    add.className = "flex gap-2 px-3 py-2 border-t border-[#E5E7EB] bg-white";
    const inp = document.createElement("input");
    inp.className = "inp flex-1";
    inp.placeholder = "Nuevo departamento";
    inp.id = `adm-newdepto-${servicioId}`;
    const btn = document.createElement("button");
    btn.className = "btn btn-navy";
    btn.style.padding = "7px 12px";
    btn.textContent = "Añadir";
    btn.onclick = () => crearDepartamento(servicioId);
    add.append(inp, btn);
    box.appendChild(add);
  }
  return box;
}

function editarServicioBox(s, box) {
  const head = box.querySelector("div");
  const nm = head.querySelector("span");
  const inp = document.createElement("input");
  inp.className = "inp flex-1";
  inp.value = s.nombre;
  head.replaceChild(inp, nm);
  head.querySelectorAll("button").forEach(b => b.remove());
  head.append(miniBtn("Guardar", "adm-save", () => guardarCatalogo("servicios", s.id, inp.value.trim())),
    document.createTextNode(" "),
    miniBtn("Cancelar", "", () => loadAdmin()));
  inp.focus();
  inp.select();
}

function editarDeptoRow(d, li) {
  li.innerHTML = "";
  const inp = document.createElement("input");
  inp.className = "inp flex-1";
  inp.value = d.nombre;
  li.append(inp,
    miniBtn("Guardar", "adm-save", () => guardarCatalogo("departamentos", d.id, inp.value.trim())),
    miniBtn("Cancelar", "", () => loadAdmin()));
  inp.focus();
  inp.select();
}

async function guardarCatalogo(kind, id, nombre) {
  if (!nombre) return;
  try {
    await api(`/api/${kind}/${id}`, { method: "PUT", json: { nombre } });
    await refrescarCatalogos();
    loadAdmin();
  } catch (err) {
    alert(err.message);
  }
}

async function eliminarCatalogo(kind, id) {
  const msg = kind === "servicios"
    ? "¿Eliminar el servicio? También se eliminarán sus departamentos y sus reservas."
    : "¿Eliminar? También se eliminarán sus reservas asociadas.";
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
    td.textContent = "Sin usuarios";
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
    tdA.append(miniBtn("Editar", "", () => editarUsuario(u.id)),
      document.createTextNode(" "),
      miniBtn("Eliminar", "adm-danger", () => eliminarUsuario(u.id)));
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
  inpP.placeholder = "Nueva contraseña (opcional)";
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
  tdA.append(miniBtn("Guardar", "adm-save", () => guardarUsuario(id)),
    document.createTextNode(" "),
    miniBtn("Cancelar", "", () => loadAdmin()));
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
  if (!confirm("¿Eliminar este usuario?")) return;
  try {
    await api(`/api/usuarios/${id}`, { method: "DELETE" });
    loadAdmin();
  } catch (err) {
    alert(err.message);
  }
}

function loadPuestosAdmin() {
  api("/api/puestos?todos=true").then(ps => {
    state.adminPuestos = ps;
    renderPuestosAdmin();
  }).catch(err => alert(err.message));
}

function renderPuestosAdmin() {
  const pl = $("adm-puesto-planta").value, zo = $("adm-puesto-zona").value;
  const list = (state.adminPuestos || []).filter(p => String(p.planta) === pl && p.zona === zo);
  const grid = $("adm-puestos-grid");
  grid.innerHTML = "";
  const act = list.filter(p => p.activo).length;
  $("adm-puestos-count").textContent = `${act}/${list.length} activos`;
  list.forEach(p => {
    const b = document.createElement("button");
    b.className = "adm-chip" + (p.activo ? " adm-chip-on" : " adm-chip-off");
    b.title = `${p.codigo} · ${p.activo ? "Activo (clic para desactivar)" : "Inactivo (clic para activar)"}`;
    b.textContent = `F${p.fila}-L${p.lado}-${p.posicion}`;
    b.onclick = () => togglePuesto(p.id, !p.activo);
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
  const zona = $("adm-np-zona").value.trim();
  const fila = +$("adm-np-fila").value;
  const l1 = +$("adm-np-lado1").value || 0;
  const l2 = +$("adm-np-lado2").value || 0;
  if (!zona || !(fila >= 1) || l1 + l2 === 0) {
    alert("Revisa los datos: zona, fila y al menos un despacho");
    return;
  }
  try {
    const creados = await api("/api/puestos/lote", {
      method: "POST", json: { planta, zona, fila, lados: { 1: l1, 2: l2 } },
    });
    alert(`Creados ${creados.length} puestos`);
    loadPuestosAdmin();
  } catch (err) {
    alert(err.message);
  }
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
    });
}

function loadAdmin() {
  showAdminTab(state.adminTab || "usuarios");
  refrescarCatalogos()
    .then(() => api("/api/usuarios"))
    .then(users => {
      renderGrupos();
      renderAdminUsuarios(users);
      loadPuestosAdmin();
    })
    .catch(err => alert(err.message));
}

async function crearServicio() {
  const input = $("admin-serv-nombre");
  if (!input.value.trim()) return;
  try {
    await api("/api/servicios", { method: "POST", json: { nombre: input.value.trim() } });
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
    await api("/api/departamentos", { method: "POST", json: { nombre: input.value.trim(), servicio_id: servicioId } });
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
  const resByPos = {};
  state.reservas.forEach(r => {
    if (overlaps(r, desde, hasta)) resByPos[r.puesto.id] = r;
  });
  const mine = state.reservas.filter(r =>
    overlaps(r, desde, hasta) && r.usuario.id === state.usuario.id && desk.ids.includes(r.puesto.id));
  const occupied = desk.ids.filter(id => resByPos[id]);
  const free = desk.ids.filter(id => !resByPos[id]);
  if (occupied.length === 0) return { state: "free", reservations: [] };
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
  const resByPos = {};
  state.reservas.forEach(r => {
    if (overlaps(r, desde, hasta)) resByPos[r.puesto.id] = r;
  });
  const total = state.puestos.length;
  const ocup = Object.keys(resByPos).length;
  const libres = total - ocup;
  $("res-libres").textContent = libres;
  $("res-ocupados").textContent = ocup;
  $("res-pct").textContent = (total > 0 ? Math.round(ocup / total * 100) : 0) + "%";
  $("resumen-sub").textContent = `${state.fecha} · ${tm(desde)}–${tm(hasta)}`;

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
  if (!sEntries.length) emptyRow(sEl, "Sin reservas en este tramo");
  const sMax = sEntries.length ? sEntries[0][1] : 0;
  sEntries.forEach(([n, c]) => barRow(sEl, n, c, sMax, "#405060"));

  const dEl = $("res-deptos");
  dEl.innerHTML = "";
  const dEntries = Object.entries(byDep).sort((a, b) => b[1] - a[1]);
  if (!dEntries.length) emptyRow(dEl, "Sin reservas en este tramo");
  const dMax = dEntries.length ? dEntries[0][1] : 0;
  dEntries.forEach(([n, c]) => barRow(dEl, n, c, dMax, "#7C8DA0"));

  const tEl = $("res-tipos");
  tEl.innerHTML = "";
  const tColors = { agente: "#405060", staff: "#94A3B8", visita: "#C06848" };
  const tMax = Math.max(byTipo.agente, byTipo.staff, byTipo.visita);
  [["Agente", byTipo.agente], ["Staff", byTipo.staff], ["Visita", byTipo.visita]]
    .forEach(([n, c]) => barRow(tEl, n, c, tMax, tColors[n.toLowerCase()]));
}

/* ── Render plan ── */
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
      card.innerHTML = `<h3 class="font-extrabold text-base text-[#1F2937] mb-3">Planta ${planta}</h3>`;

      const zonas = [...new Set(pDesks.map(d => d.zona))];
      const hasTwoZones = zonas.length === 2;

      const zonasRow = document.createElement("div");
      zonasRow.className = "flex gap-0 items-start";

      zonas.forEach((zona, zi) => {
        const zDesks = pDesks.filter(d => d.zona === zona);
        const zonaEl = document.createElement("div");
        zonaEl.className = "flex-1";
        const zonaLabel = zona === "ZI" ? "Izquierda" : "Derecha";
        const count = zDesks.reduce((s, d) => s + d.positions.length, 0);
        zonaEl.innerHTML = `<h4 class="text-sm font-semibold mb-2 text-[#405060]">Zona ${zonaLabel} <span class="font-normal text-[#64748B]">(${count} puestos)</span></h4>`;

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

        if (hasTwoZones && zi === 0) {
          const pasillo = document.createElement("div");
          pasillo.className = "w-8 flex flex-col items-center justify-center self-stretch pt-8";
          pasillo.innerHTML = `<div class="div-v flex-1"></div><span class="text-[10px] text-[#94A3B8] rotate-90 whitespace-nowrap my-2 tracking-wider">PASILLO</span><div class="div-v flex-1"></div>`;
          zonasRow.appendChild(pasillo);
        }
      });

      if (!hasTwoZones) {
        const placeholder = document.createElement("div");
        placeholder.className = "flex-1 border-2 border-dashed border-[#CBD5E1] rounded-lg flex items-center justify-center h-48 text-[#94A3B8] bg-[#F8FAFC]";
        placeholder.textContent = "No disponible";
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

  if (status.state === "mine") {
    const r = status.reservations[0];
    el.classList.add("desk-mine");
    el.title = `Tu reserva · ${r.tipo} ${tm(r.hora_inicio)}-${tm(r.hora_fin)} · Clic para ver y cancelar`;
    el.onclick = () => openModal(desk, status.freeIds, desde, hasta);
  } else if (status.state === "occupied") {
    const r = status.reservations[0];
    el.classList.add("desk-occupied");
    el.title = `Ocupado: ${r.servicio.nombre} · ${r.departamento.nombre} · ${r.tipo} ${tm(r.hora_inicio)}-${tm(r.hora_fin)} · Clic para ver`;
    el.onclick = () => openModal(desk, [], desde, hasta);
  } else if (status.state === "mixed") {
    el.classList.add("desk-mixed");
    el.title = "Algunas posiciones libres · Clic para ver y reservar";
    el.onclick = () => openModal(desk, status.freeIds, desde, hasta);
  } else {
    el.classList.add("desk-free");
    el.onclick = () => openModal(desk, undefined, desde, hasta);
  }
  const fS = state.fServicio, fD = state.fDepto;
  if (fS || fD) {
    const match = status.reservations.some(r =>
      (!fS || r.servicio.id === fS) && (!fD || r.departamento.id === fD));
    if (match) {
      el.classList.add("desk-match");
      el.title = "Coincide con el filtro · " + el.title;
    } else if (status.state !== "free") {
      el.classList.add("desk-dim");
    }
  }
  return el;
}

/* ── Modal ── */
function reservaEn(puestoId, desde, hasta) {
  return state.reservas.find(r => r.puesto.id === puestoId && overlaps(r, desde, hasta));
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

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
  desde = desde || state.desde;
  hasta = hasta || state.hasta;
  const hasFree = !freeIds || freeIds.length > 0;
  $("modal-title").textContent = `${hasFree ? "Reservar" : "Mesa"} · ${desk.codigos.join(" / ")}`;
  fillDeptosForServicio();
  const info = $("modal-info");
  info.innerHTML = "";
  for (const p of desk.positions) {
    const r = reservaEn(p.id, desde, hasta);
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] px-3 py-2 text-[13px]";
    const txt = document.createElement("span");
    if (!r) {
      txt.className = "text-[#64748B]";
      txt.textContent = `${p.codigo} · Libre`;
      row.appendChild(txt);
    } else {
      const own = r.usuario.id === state.usuario.id;
      const isAdmin = state.usuario.rol === "admin";
      txt.className = "text-[#1F2937]";
      txt.textContent = `${p.codigo} · ${r.servicio.nombre} · ${r.departamento.nombre} · ${cap(r.tipo)}${own ? " (tuya)" : (isAdmin ? ` · ${r.usuario.nombre}` : "")}`;
      row.appendChild(txt);
      if (own || isAdmin) {
        const b = document.createElement("button");
        b.className = "btn btn-ghost";
        b.style.padding = "4px 10px";
        b.style.fontSize = "12px";
        b.textContent = "Cancelar";
        b.onclick = () => cancelReserva(r.id);
        row.appendChild(b);
      }
    }
    info.appendChild(row);
  }
  const posSelect = $("modal-puesto");
  posSelect.innerHTML = "";
  const positions = freeIds ? desk.positions.filter(p => freeIds.includes(p.id)) : desk.positions;
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

function closeModal() { $("modal").classList.add("hidden"); modalDesk = null; }

async function saveReserva() {
  if (!modalDesk) return;
  try {
    await api("/api/reservas", { method: "POST", json: {
      puesto_id: +$("modal-puesto").value,
      fecha: state.fecha,
      hora_inicio: state.desde + ":00",
      hora_fin: state.hasta + ":00",
      tipo: $("modal-tipo").value,
      servicio_id: +$("modal-servicio").value,
      departamento_id: +$("modal-departamento").value,
    }});
    closeModal();
    renderPlan();
  } catch (err) {
    alert(err.message);
  }
}

async function cancelReserva(id) {
  if (!confirm("¿Cancelar esta reserva?")) return;
  try {
    await api(`/api/reservas/${id}/cancelar`, { method: "POST" });
    closeModal();
    renderPlan();
  } catch (err) {
    alert(err.message);
  }
}

/* ── Sesión persistente ── */
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

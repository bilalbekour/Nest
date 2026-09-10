const $ = (id) => document.getElementById(id);
const state = { token: null, usuario: null, puestos: [], reservas: [], servicios: [], departamentos: [] };
let modalDesk = null;

function api(path, opts = {}) {
  const headers = {};
  if (state.token) headers["Authorization"] = "Bearer " + state.token;
  if (opts.json) headers["Content-Type"] = "application/json";
  return fetch(path, { method: opts.method || "GET", headers,
    body: opts.json ? JSON.stringify(opts.json) : undefined })
    .then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.detail || "Error"); return d; });
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
    enter();
  } catch (err) {
    $("login-error").textContent = err.message || "Credenciales inválidas";
    $("login-error").classList.remove("hidden");
  }
};

function enter() {
  $("login").classList.add("hidden");
  $("nav").classList.remove("hidden");
  $("nav-user").textContent = `${state.usuario.nombre} (${state.usuario.rol})`;
  if (state.usuario.rol === "admin") $("btn-admin").classList.remove("hidden");
  $("fecha").value = todayStr();
  show("reservar");
  Promise.all([api("/api/puestos"), api("/api/servicios"), api("/api/departamentos")])
    .then(([p, s, d]) => {
      state.puestos = p;
      state.servicios = s;
      state.departamentos = d;
      fillSelect($("modal-servicio"), s);
      fillSelect($("modal-departamento"), d);
      fillHistSelect($("hist-servicio"), s);
      fillHistSelect($("hist-departamento"), d);
      fillHistSelect($("filtro-servicio"), s);
      fillHistSelect($("filtro-departamento"), d);
      renderPlan();
    });
}

function logout() {
  state.token = null; state.usuario = null;
  $("nav").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("login-user").value = ""; $("login-pass").value = "";
}

function show(view) {
  ["reservar", "historico", "admin"].forEach(v => {
    $(v).classList.toggle("hidden", v !== view);
  });
  if (view === "historico") loadHistorico();
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

/* ── Admin ── */
function renderList(elId, items, emptyMsg) {
  const ul = $(elId);
  ul.innerHTML = "";
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "text-[#94A3B8] py-1";
    li.textContent = emptyMsg;
    ul.appendChild(li);
    return;
  }
  for (const i of items) {
    const li = document.createElement("li");
    li.className = "py-1 border-t border-[#F1F5F9] first:border-t-0 text-[#1F2937]";
    li.textContent = i.nombre;
    ul.appendChild(li);
  }
}

function renderAdminUsuarios(usuarios) {
  const tbody = $("admin-usuarios");
  tbody.innerHTML = "";
  if (usuarios.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = "Sin usuarios";
    td.className = "td text-center py-6 text-[#94A3B8]";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const u of usuarios) {
    const tr = document.createElement("tr");
    tr.className = "border-t border-[#E5E7EB]";
    for (const v of [u.username, u.nombre, u.rol]) {
      const td = document.createElement("td");
      td.className = "td";
      td.textContent = v;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
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
    });
}

function loadAdmin() {
  Promise.all([api("/api/servicios"), api("/api/departamentos"), api("/api/usuarios")])
    .then(([s, d, u]) => {
      renderList("admin-servicios", s, "Sin servicios");
      renderList("admin-deptos", d, "Sin departamentos");
      renderAdminUsuarios(u);
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
    renderList("admin-servicios", state.servicios, "Sin servicios");
    renderList("admin-deptos", state.departamentos, "Sin departamentos");
  } catch (err) {
    alert(err.message);
  }
}

async function crearDepartamento() {
  const input = $("admin-dept-nombre");
  if (!input.value.trim()) return;
  try {
    await api("/api/departamentos", { method: "POST", json: { nombre: input.value.trim() } });
    input.value = "";
    await refrescarCatalogos();
    renderList("admin-servicios", state.servicios, "Sin servicios");
    renderList("admin-deptos", state.departamentos, "Sin departamentos");
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

  api(`/api/reservas?fecha=${fecha}`).then(reservas => {
    state.reservas = reservas;
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
            aisle.className = "pasillo self-stretch mx-1";
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
          pasillo.innerHTML = `<div class="pasillo flex-1"></div><span class="text-[10px] text-[#94A3B8] rotate-90 whitespace-nowrap my-2 tracking-wider">PASILLO</span><div class="pasillo flex-1"></div>`;
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
  });
}

function deskEl(desk, desde, hasta) {
  const status = deskStatus(desk, desde, hasta);
  const el = document.createElement("div");
  el.className = "desk w-14 h-14 rounded-xl border cursor-pointer flex flex-col items-center justify-center text-xs";
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

function openModal(desk, freeIds, desde, hasta) {
  modalDesk = desk;
  desde = desde || state.desde;
  hasta = hasta || state.hasta;
  const hasFree = !freeIds || freeIds.length > 0;
  $("modal-title").textContent = `${hasFree ? "Reservar" : "Mesa"} · ${desk.codigos.join(" / ")}`;
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
      txt.className = "text-[#1F2937]";
      txt.textContent = `${p.codigo} · ${r.servicio.nombre} · ${r.departamento.nombre} · ${cap(r.tipo)}${own ? " (tuya)" : ""}`;
      row.appendChild(txt);
      if (own) {
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

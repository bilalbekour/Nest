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
  if (view === "admin" && typeof loadAdmin === "function") loadAdmin();
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
    td.className = "px-4 py-6 text-center text-gray-400";
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }
  for (const r of reservas) {
    const tr = document.createElement("tr");
    tr.className = "border-t";
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
      td.className = "px-4 py-2";
      td.textContent = v;
      tr.appendChild(td);
    }
    const tdEstado = document.createElement("td");
    tdEstado.className = "px-4 py-2";
    const badge = document.createElement("span");
    badge.className = "px-2 py-0.5 rounded-full text-xs " +
      (r.cancelada ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700");
    badge.textContent = r.cancelada ? "Cancelada" : "Activa";
    tdEstado.appendChild(badge);
    tr.appendChild(tdEstado);
    body.appendChild(tr);
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
  if (mine.length) return { state: "mine", reservations: mine, freeIds: free };
  if (occupied.length === 0) return { state: "free", reservations: [] };
  if (free.length === 0) return { state: "occupied", reservations: Object.values(resByPos) };
  return { state: "mixed", reservations: Object.values(resByPos), freeIds: free };
}

/* ── SVG desk ── */
function deskSVG() {
  return `<svg viewBox="0 0 60 36" class="w-full h-full" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="56" height="14" rx="2" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>
    <circle cx="18" cy="28" r="6" fill="#d1d5db" stroke="#9ca3af" stroke-width="1"/>
    <circle cx="42" cy="28" r="6" fill="#d1d5db" stroke="#9ca3af" stroke-width="1"/>
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

  api(`/api/reservas?fecha=${fecha}`).then(reservas => {
    state.reservas = reservas;
    const allDesks = groupDesks(state.puestos);
    const plantas = [...new Set(state.puestos.map(p => p.planta))].sort((a, b) => b - a);
    const container = $("plan");
    container.innerHTML = "";

    plantas.forEach(planta => {
      const pDesks = allDesks.filter(d => d.planta === planta);
      const card = document.createElement("div");
      card.className = "bg-white rounded shadow p-4";
      card.innerHTML = `<h3 class="font-bold text-lg mb-3">Planta ${planta}</h3>`;

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
        zonaEl.innerHTML = `<h4 class="text-sm font-semibold mb-2 text-gray-600">Zona ${zonaLabel} (${count} puestos)</h4>`;

        const filas = [...new Set(zDesks.map(d => d.fila))].sort((a, b) => a - b);
        filas.forEach(fila => {
          const fDesks = zDesks.filter(d => d.fila === fila);
          const lado1 = fDesks.filter(d => d.lado === 1);
          const lado2 = fDesks.filter(d => d.lado === 2);
          const rowEl = document.createElement("div");
          rowEl.className = "flex items-center gap-1 mb-1";
          rowEl.innerHTML = `<span class="text-xs text-gray-400 w-5 text-right">${fila}</span>`;
          const leftDiv = document.createElement("div");
          leftDiv.className = "flex gap-1";
          lado1.forEach(d => leftDiv.appendChild(deskEl(d, desde, hasta)));
          rowEl.appendChild(leftDiv);
          if (lado2.length > 0) {
            const aisle = document.createElement("div");
            aisle.className = "w-px bg-gray-300 self-stretch mx-0.5";
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
          pasillo.innerHTML = `<div class="w-px bg-gray-300 flex-1"></div><span class="text-xs text-gray-400 rotate-90 whitespace-nowrap my-2">PASILLO</span><div class="w-px bg-gray-300 flex-1"></div>`;
          zonasRow.appendChild(pasillo);
        }
      });

      if (!hasTwoZones) {
        const placeholder = document.createElement("div");
        placeholder.className = "flex-1 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center h-48 text-gray-400";
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
  el.className = "w-14 h-14 rounded border cursor-pointer flex flex-col items-center justify-center text-xs transition-colors";
  el.innerHTML = `${deskSVG()}<span class="text-[9px] leading-none mt-0.5">${desk.posRange}</span>`;
  el.title = desk.codigos.join(" · ");

  if (status.state === "mine") {
    const r = status.reservations[0];
    el.classList.add("bg-blue-200", "border-blue-400");
    el.title = `Tu reserva · ${r.tipo} ${tm(r.hora_inicio)}-${tm(r.hora_fin)} · Clic para cancelar`;
    el.onclick = () => cancelReserva(r.id);
  } else if (status.state === "occupied") {
    const r = status.reservations[0];
    el.classList.add("bg-red-200", "border-red-400", "cursor-default");
    el.title = `Ocupado: ${r.servicio.nombre} · ${r.departamento.nombre} · ${r.tipo} ${tm(r.hora_inicio)}-${tm(r.hora_fin)}`;
  } else if (status.state === "mixed") {
    el.classList.add("bg-amber-100", "border-amber-400", "hover:bg-amber-200");
    el.title = "Algunas posiciones libres · Clic para reservar las libres";
    el.onclick = () => openModal(desk, status.freeIds);
  } else {
    el.classList.add("bg-emerald-100", "border-emerald-400", "hover:bg-emerald-200");
    el.onclick = () => openModal(desk);
  }
  return el;
}

/* ── Modal ── */
function openModal(desk, freeIds) {
  modalDesk = desk;
  $("modal-title").textContent = `Reservar · ${desk.codigos.join(" / ")}`;
  const posSelect = $("modal-puesto");
  posSelect.innerHTML = "";
  const positions = freeIds ? desk.positions.filter(p => freeIds.includes(p.id)) : desk.positions;
  for (const p of positions) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.codigo;
    posSelect.appendChild(opt);
  }
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
    renderPlan();
  } catch (err) {
    alert(err.message);
  }
}

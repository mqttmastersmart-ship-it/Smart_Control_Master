const mqttConfig = {
  url: "wss://y1184ab7.ala.us-east-1.emqxsl.com:8084/mqtt",
  username: "teste",
  password: "testadmin",
  clientId: "app_adc_pocos_" + Math.random().toString(16).slice(2, 10),
  topics: {
    availability: "adc/pocos/central/availability",
    status: "adc/pocos/central/status",
    rede: "adc/pocos/central/rede",
    cmd: "adc/pocos/central/cmd",
    cmdResult: "adc/pocos/central/cmd_result",
    configSet: "adc/pocos/central/config/set",
    configStatus: "adc/pocos/central/config/status",
    retroHistory: "adc/pocos/central/retro/history",
    retroEvent: "adc/pocos/central/retro/event",
    eventos: "adc/pocos/central/eventos"
  }
};

const $ = id => document.getElementById(id);
let mqttClient = null;
let lastCentralMs = 0;
let hasStatus = false;
let hasConfig = false;
const pending = new Map();
const events = [];
const COMMANDS_ENABLED = true;
let centralAvailable = null;
let manualDraftMask = 0;
const state = {
  sistemaLigado: null,
  modo: "--",
  estadoAuto: "--",
  boia: null,
  retro: null,
  entradaRetro: null,
  grupoAtual: 0,
  grupoDesejado: 0,
  grupoManual: 0,
  grupoRetro: 0,
  vazaoAtualM3h: null,
  cloroBomba: null,
  cloroPesoKg: null,
  cloroBaixo: null,
  hx711Ok: null,
  pocos: [],
  rede: { wifi: false, mqtt: false, ntp: false, ip: "--", rssi: null, horaSincronizada: false }
};

function toast(msg, ok = true) {
  const item = document.createElement("div");
  item.className = "toast-item " + (ok ? "ok" : "err");
  item.textContent = msg;
  $("toast").appendChild(item);
  setTimeout(() => item.remove(), 3400);
}

function publishJson(topic, payload) {
  if (!COMMANDS_ENABLED) {
    toast("Central nova ainda nao recebe comandos pelo app.", false);
    return false;
  }
  if (!mqttClient || !mqttClient.connected) {
    toast("MQTT offline. Comando nao enviado.", false);
    return false;
  }
  mqttClient.publish(topic, JSON.stringify(payload), { qos: 0, retain: false });
  return true;
}

function newId(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2, 6);
}

function formatRuntime(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function fieldValue(id) {
  const el = $(id);
  if (!el) return null;
  if (el.value === "") return null;
  if (el.tagName === "SELECT") return el.value === "true";
  if (el.type === "number") return Number(el.value);
  return el.value;
}

function setFieldState(id, cls) {
  const el = $(id);
  if (!el || el.readOnly) return;
  el.classList.remove("dirty", "saving", "saved", "error");
  if (cls) el.classList.add(cls);
}

function groupFields(group) {
  const map = {
    gerenciador: [
      "gerenciador_ativo",
      "p1_habilitado", "p1_vazao_m3h",
      "p2_habilitado", "p2_vazao_m3h",
      "p3_habilitado", "p3_vazao_m3h",
      "vazao_max_sistema_m3h",
      "percentual_minimo_alternativa",
      "tempo_continuo_preferencial_min",
      "tempo_minimo_descanso_min",
      "tempo_minimo_grupo_ligado_min",
      "tempo_guarda_troca_seg",
      "intervalo_acionamentos_seg"
    ],
    retro: ["retro_p1", "retro_p2", "retro_p3"],
    cloro: ["cloro_alarme_kg", "hx711_fator"],
    engenharia: [
      "radio_response_timeout_ms",
      "radio_command_timeout_ms",
      "radio_scan_interval_ms",
      "radio_guard_ms",
      "radio_max_tentativas",
      "confirmacao_comando_s",
      "max_falhas_partida"
    ]
  };
  return map[group] || [];
}

function collectConfig(group) {
  const config = {};
  groupFields(group).forEach(id => {
    const value = fieldValue(id);
    if (value !== null) config[id] = value;
  });
  return config;
}

function saveConfig(group) {
  if ((group === "gerenciador" || group === "retro" || group === "cloro" || group === "engenharia") && !hasConfig) {
    toast("Aguardando a configuracao real da central antes de salvar.", false);
    command("READ_CONFIG");
    return;
  }

  const id = newId("cfg");
  groupFields(group).forEach(field => setFieldState(field, "saving"));
  pending.set(id, { type: "config", group });
  const sent = publishJson(mqttConfig.topics.configSet, {
    id,
    acao: "ALTERAR_CONFIG",
    config: collectConfig(group)
  });
  if (!sent) {
    pending.delete(id);
    groupFields(group).forEach(field => setFieldState(field, "dirty"));
  }
}

function updateRetroResult() {
  const selected = [];
  const p1 = fieldValue("retro_p1");
  const p2 = fieldValue("retro_p2");
  const p3 = fieldValue("retro_p3");
  if (p1 === null || p2 === null || p3 === null) {
    $("retro_result").value = "--";
    return;
  }
  if (p1) selected.push("P1");
  if (p2) selected.push("P2");
  if (p3) selected.push("P3");
  $("retro_result").value = selected.length ? selected.join(" + ") : "Nenhum";
}

function command(acao, extra = {}) {
  if (!COMMANDS_ENABLED) {
    toast("Comandos MQTT ainda nao habilitados na central nova.", false);
    return;
  }
  const id = newId("cmd");
  pending.set(id, { type: "cmd", acao, ...extra });
  publishJson(mqttConfig.topics.cmd, { id, acao, ...extra });
}

function renderConnection() {
  const mqttOk = Boolean(mqttClient && mqttClient.connected);
  const freshStatus = Date.now() - lastCentralMs < 5000;

  // Um status JSON recente vindo da propria central e prova de vida mais forte
  // do que um retained "offline" antigo no topico de availability.
  const centralOk = centralAvailable === true || freshStatus;

  $("mqttDot").className = "dot " + (mqttOk ? "" : "bad");
  $("mqttLabel").textContent = mqttOk ? "MQTT online" : "MQTT offline";
  $("centralDot").className = "dot " + (centralOk ? "" : "bad");
  $("centralLabel").textContent = centralOk ? "Central online" : "Central offline";
}

function wellBadge(w) {
  if (w.bloqueioCritico) return ["FALHA CRITICA", "red"];
  if (w.falha) return ["ALERTA", "amber"];
  if (!w.online) return ["OFFLINE", "red"];
  if (w.feedback) return ["OPERANDO", "green"];
  if (w.desejado) return ["PENDENTE", "blue"];
  return ["STANDBY", ""];
}

function pendingCard(text = "Aguardando dados da central") {
  return `<article class="card empty-state">${text}</article>`;
}

function boolText(value, onText, offText) {
  if (value === true) return onText;
  if (value === false) return offText;
  return "--";
}

function renderWells() {
  if (!hasStatus) {
    $("wellCards").innerHTML = pendingCard();
    $("manualCards").innerHTML = pendingCard();
    return;
  }

  const html = state.pocos.map(w => {
    const [label, cls] = wellBadge(w);
    const falhaAtiva = Boolean(w.falha || w.bloqueioCritico);
    const falhaDescricao = w.falhaMensagem || w.falhaCodigo || (falhaAtiva ? "Falha ativa - verificar campo" : "Nenhuma");
    const falhaCodigo = w.falhaCodigo || "";
    const totalSeconds = w.tempoLigadoTotalS ?? (w.tempoTotalMs ? Number(w.tempoTotalMs) / 1000 : 0);
    return `<article class="card well ${w.bloqueioCritico ? "danger" : ""}">
      <div class="well-head">
        <div>
          <div class="well-id">ID: ${String(w.id).padStart(2, "0")}</div>
          <h2>POCO ${String(w.id).padStart(2, "0")}</h2>
          <div class="well-spec">${w.id === 3 ? "P3" : w.id === 2 ? "P2" : "P1"}</div>
        </div>
        <span class="badge ${cls}">${label}</span>
      </div>
      <div class="well-grid">
        <div class="signal ${w.desejado ? "on" : "off"}"><span>Desejado</span><strong>${w.desejado ? "ON" : "OFF"}</strong></div>
        <div class="signal ${w.rele ? "on" : "off"}"><span>Rele</span><strong>${w.rele ? "ON" : "OFF"}</strong></div>
        <div class="signal ${w.feedback ? "on" : "off"}"><span>Feedback</span><strong>${w.feedback ? "ON" : "OFF"}</strong></div>
        <div class="signal ${w.online ? "on" : "bad"}"><span>LoRa</span><strong>${w.online ? "ONLINE" : "OFFLINE"}</strong></div>
      </div>
      <div class="well-grid">
        <span>Falha: <b>${falhaAtiva ? falhaDescricao : "NENHUMA"}</b></span>
        <span>Partidas: <b>${w.partidas || 0}</b></span>
        <span>Tempo total: <b>${formatRuntime(totalSeconds)}</b></span>
        <span>Bloqueio: <b>${w.bloqueioCritico ? "SIM" : "NAO"}</b></span>
      </div>
      ${falhaAtiva && falhaCodigo ? `<div class="config-note"><b>Codigo:</b> ${falhaCodigo}</div>` : ""}
    </article>`;
  }).join("");
  $("wellCards").innerHTML = html || pendingCard("Central nao informou os pocos");

  const manualHtml = state.pocos.map(w => {
    const bit = 1 << (Number(w.id) - 1);
    const selected = Boolean(manualDraftMask & bit);
    const disabled = state.modo !== "MANUAL" || state.sistemaLigado !== true;
    return `<article class="card well">
      <div class="well-head">
        <div><div class="well-id">ID: ${String(w.id).padStart(2, "0")}</div><h2>POCO ${String(w.id).padStart(2, "0")}</h2></div>
        <span class="badge ${w.feedback ? "green" : selected ? "blue" : ""}">${w.feedback ? "OPERANDO" : selected ? "SELECIONADO" : "FORA DO GRUPO"}</span>
      </div>
      <div class="well-grid">
        <div class="signal ${selected ? "on" : "off"}"><span>Pedido do app</span><strong>${selected ? "ON" : "OFF"}</strong></div>
        <div class="signal ${w.feedback ? "on" : "off"}"><span>Feedback real</span><strong>${w.feedback ? "ON" : "OFF"}</strong></div>
      </div>
      ${w.bloqueioCritico ? `<div class="config-note"><b>Falha:</b> ${w.falhaMensagem || w.falhaCodigo || "Falha critica"}${w.falhaCodigo ? `<br><b>Codigo:</b> ${w.falhaCodigo}` : ""}</div>` : ""}
      <div class="actions">
        <button class="cmd ${selected ? "danger" : "on"} manual-toggle" data-well="${w.id}" ${disabled ? "disabled" : ""} type="button">${selected ? "Remover" : "Selecionar"}</button>
        ${w.bloqueioCritico ? `<button class="cmd warn reset-fault" data-well="${w.id}" type="button">Reset falha</button>` : ""}
      </div>
    </article>`;
  }).join("");
  $("manualCards").innerHTML = manualHtml || pendingCard("Central nao informou os pocos");

  $("manualDraftLabel").textContent = maskToPocos(manualDraftMask);
  $("manualAcceptedLabel").textContent = maskToPocos(Number(state.grupoManual || 0));
  $("applyManualGroupBtn").disabled = state.modo !== "MANUAL" || state.sistemaLigado !== true;
  $("clearManualGroupBtn").disabled = state.modo !== "MANUAL" || state.sistemaLigado !== true;
}

function renderStages() {
  const estado = state.sistemaLigado !== true
    ? "SISTEMA DESLIGADO"
    : state.modo === "MANUAL"
      ? "MANUAL"
      : (state.estadoAuto === "RETRO" ? "RETROLAVAGEM" : "CONTROLE DE NIVEL");

  $("stageName").textContent = estado;
  $("stageTopLabel").textContent = estado;
  $("stageRemain").textContent = maskToPocos(Number(state.grupoAtual || 0));
  $("cycleTotal").textContent = maskToPocos(Number(state.grupoDesejado || 0));
  $("stageWells").textContent = state.vazaoAtualM3h === null || state.vazaoAtualM3h === undefined
    ? "--"
    : `${Number(state.vazaoAtualM3h).toFixed(1)} m3/h`;

  const note = [];
  if (state.modo === "MANUAL") note.push(`Manual solicitado: ${maskToPocos(Number(state.grupoManual || 0))}`);
  if (state.estadoAuto === "RETRO") note.push(`Grupo retro: ${maskToPocos(Number(state.grupoRetro || 0))}`);
  note.push("Reles e feedbacks confirmados aparecem nos cards dos pocos.");
  $("managerNote").textContent = note.join(" | ");
}

function renderTop() {
  $("powerLabel").textContent = boolText(state.sistemaLigado, "LIGADO", "DESLIGADO");
  $("powerBtn").classList.toggle("off", state.sistemaLigado !== true);
  $("powerBtn").disabled = !hasStatus || state.sistemaLigado === null || state.sistemaLigado === undefined;

  $("modeLabel").textContent = state.modo || "--";

  const boiaPedindo = state.boia === true || state.boia === "PEDINDO_AGUA" || state.boia === "PEDINDO";
  const boiaCheia = state.boia === false || state.boia === "CHEIA" || state.boia === "SEM_PEDIDO";
  $("floatLabel").textContent = boiaPedindo ? "PEDINDO" : boiaCheia ? "CHEIA" : "--";

  const retroAtiva = state.retro === true || state.entradaRetro === true || state.estadoAuto === "RETRO";
  $("retroTopLabel").textContent = retroAtiva ? "ATIVA" : "INATIVA";
  $("retroInput").textContent = boolText(state.entradaRetro ?? state.retro, "ATIVA", "INATIVA");
  $("retroState").textContent = (state.sistemaLigado === true && state.estadoAuto === "RETRO") ? "EM ANDAMENTO" : "PARADA";

  $("chlorineWeight").textContent = state.hx711Ok === true && state.cloroPesoKg !== null && state.cloroPesoKg !== undefined
    ? Number(state.cloroPesoKg).toFixed(1)
    : "--";
  $("chlorineLowLabel").textContent = `${$("cloro_alarme_kg").value || "--"} kg`;
  $("chlorinePump").textContent = boolText(state.cloroBomba, "LIGADA", "DESLIGADA");
  $("hx711State").textContent = boolText(state.hx711Ok, "OK", "SEM LEITURA");
  $("chlorineAlarmState").textContent = boolText(state.cloroBaixo, "CLORO BAIXO", "NORMAL");
  $("tareBtn").disabled = !hasStatus || state.hx711Ok !== true;

  const rede = state.rede || {};
  $("wifiTopLabel").textContent = rede.wifi === true ? "ONLINE" : rede.wifi === false ? "OFFLINE" : "--";
  $("ipTopLabel").textContent = rede.ip || "--";
  $("rssiTopLabel").textContent = rede.rssi === null || rede.rssi === undefined ? "--" : `${rede.rssi} dBm`;
}

function renderAlarms() {
  const ativos = [];

  state.pocos.forEach(w => {
    const codigo = w.falhaCodigo || "";
    const descricao = w.falhaMensagem || codigo || "Verificar campo";

    if (w.bloqueioCritico) {
      ativos.push({
        titulo: `P${w.id} - Falha critica`,
        descricao,
        codigo,
        status: "CRITICO",
        cls: "red",
        itemCls: "critical"
      });
      return;
    }

    if (!w.online) {
      ativos.push({
        titulo: `P${w.id} - Offline LoRa`,
        descricao: codigo === "POCO_OFFLINE" ? descricao : "Poco sem comunicacao LoRa",
        codigo: codigo || "POCO_OFFLINE",
        status: "OFFLINE",
        cls: "red",
        itemCls: "critical"
      });
      return;
    }

    if (w.falha) {
      ativos.push({
        titulo: `P${w.id} - Alerta`,
        descricao,
        codigo,
        status: "ALERTA",
        cls: "amber",
        itemCls: "warning"
      });
    }
  });

  if (state.cloroBaixo) {
    ativos.push({
      titulo: "Cloro baixo",
      descricao: "Peso de cloro abaixo do limite configurado",
      codigo: "CLORO_BAIXO",
      status: "BAIXO",
      cls: "amber",
      itemCls: "warning"
    });
  }

  if (state.hx711Ok === false) {
    ativos.push({
      titulo: "Falha HX711",
      descricao: "Balanca de cloro sem leitura",
      codigo: "HX711_SEM_LEITURA",
      status: "FALHA",
      cls: "red",
      itemCls: "critical"
    });
  }

  $("activeAlarmCount").textContent = String(ativos.length);

  if (!hasStatus) {
    $("alarmList").innerHTML = `<div class="alarm-empty">Aguardando status da central</div>`;
  } else if (!ativos.length) {
    $("alarmList").innerHTML = `<div class="alarm-empty">Nenhum alarme ativo</div>`;
  } else {
    $("alarmList").innerHTML = ativos.map(a => `
      <div class="alarm-item ${a.itemCls}">
        <div class="alarm-main">
          <div class="alarm-title">${a.titulo}</div>
          <div class="alarm-description">${a.descricao}</div>
          ${a.codigo ? `<div class="alarm-code">Codigo: ${a.codigo}</div>` : ""}
        </div>
        <span class="badge ${a.cls}">${a.status}</span>
      </div>
    `).join("");
  }

  const recentes = events.slice(0, 12);
  $("recentEventCount").textContent = String(recentes.length);

  if (!recentes.length) {
    $("recentEventList").innerHTML = `<div class="alarm-empty">Nenhum evento recebido nesta sessao</div>`;
  } else {
    $("recentEventList").innerHTML = recentes.map(e => {
      const codigo = e.codigo || "";
      const tipo = String(e.tipo || "EVENTO").replaceAll("_", " ");
      const origem = e.origem || (e.poco ? `P${e.poco}` : "CENTRAL");
      const mensagem = e.mensagem || codigo || "Evento recebido";

      let cls = "blue";
      let status = "INFO";
      if (String(e.tipo || "").includes("FALHA")) {
        cls = "red";
        status = "FALHA";
      } else if (String(e.tipo || "").includes("OFFLINE")) {
        cls = "amber";
        status = "OFFLINE";
      }

      return `
        <div class="alarm-item info">
          <div class="alarm-main">
            <div class="alarm-title">${origem} - ${tipo}</div>
            <div class="alarm-description">${mensagem}</div>
            ${codigo ? `<div class="alarm-code">Codigo: ${codigo}</div>` : ""}
          </div>
          <span class="badge ${cls}">${status}</span>
        </div>
      `;
    }).join("");
  }
}

function renderDebug() {
  const debugLog = $("debugLog");
  if (!debugLog) return;
  if (!events.length) {
    debugLog.innerHTML = '<div class="empty-state">Aguardando eventos da central</div>';
    return;
  }

  debugLog.innerHTML = events.slice(0, 80).map(e => {
    const d = eventDate(e);
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const nivel = String(e.nivel || "info").toUpperCase();
    const cls = e.nivel === "critico" || e.nivel === "falha" ? "red" : e.nivel === "alerta" ? "amber" : e.nivel === "debug" ? "blue" : "green";
    const poco = e.poco ? `P${e.poco}` : "--";
    return `<div class="debug-row">
      <span>${hora}</span>
      <span class="badge ${cls}">${nivel}</span>
      <strong>${e.rotina || e.codigo || "--"} ${poco !== "--" ? poco : ""}</strong>
      <span>${e.mensagem || e.codigo || "Evento recebido"}<br><span class="muted">${e.codigo || "--"} | ms=${e.ms ?? "--"}</span></span>
    </div>`;
  }).join("");
}

function renderAll() {
  renderConnection();
  renderTop();
  renderWells();
  renderStages();
  renderAlarms();
  renderDebug();
}

function applyStatus(doc) {
  const firstStatus = !hasStatus;
  hasStatus = true;
  centralAvailable = true;
  lastCentralMs = Date.now();
  Object.assign(state, doc);
  if (Array.isArray(doc.pocos)) {
    state.pocos = doc.pocos.map((p, i) => ({ ...(state.pocos[i] || {}), ...p }));
  }
  if (firstStatus && Number.isFinite(Number(state.grupoManual))) {
    manualDraftMask = Number(state.grupoManual) & 0x07;
  }
  renderAll();
}

function applyCentralStatusText(text) {
  centralAvailable = text === "online";
  if (centralAvailable) lastCentralMs = Date.now();
  renderConnection();
}

function applyRede(doc) {
  hasStatus = true;
  centralAvailable = true;
  lastCentralMs = Date.now();
  state.rede = { ...state.rede, ...doc };
  renderAll();
}

function applyConfig(doc) {
  hasConfig = true;
  const config = doc && typeof doc.config === "object" ? doc.config : doc;
  Object.entries(config || {}).forEach(([key, value]) => {
    if (["id", "resultado", "mensagem", "codigo"].includes(key)) return;
    const el = $(key);
    if (!el) return;
    if (el.tagName === "SELECT") el.value = value === true ? "true" : value === false ? "false" : String(value);
    else el.value = value;
    setFieldState(key, "saved");
    setTimeout(() => setFieldState(key, ""), 1200);
  });

  if (doc.id && pending.has(doc.id)) {
    const item = pending.get(doc.id);
    if (item.type === "config") {
      const ok = !doc.resultado || doc.resultado === "OK";
      groupFields(item.group).forEach(field => setFieldState(field, ok ? "saved" : "error"));
      pending.delete(doc.id);
    }
  }

  updateRetroResult();
  renderStages();
}

function applyCmdResult(doc) {
  const item = pending.get(doc.id);
  const ok = doc.resultado === "OK";

  if (item && item.type === "config") {
    groupFields(item.group).forEach(field => setFieldState(field, ok ? "saved" : "error"));
    setTimeout(() => groupFields(item.group).forEach(field => setFieldState(field, ok ? "" : "dirty")), ok ? 1300 : 2400);
  }

  if (item && item.acao === "DEFINIR_GRUPO_MANUAL" && ok) {
    if (doc.grupoAceito !== undefined) state.grupoManual = Number(doc.grupoAceito);
    else if (item.grupo !== undefined) state.grupoManual = Number(item.grupo);
  }

  if (item) pending.delete(doc.id);

  const fallback = ok ? "Comando aceito pela central" : `Central rejeitou${doc.codigo ? `: ${doc.codigo}` : ""}`;
  toast(doc.mensagem || fallback, ok);
  renderAll();
}

function addCentralEvent(doc) {
  doc.recebidoMs = Date.now();
  events.unshift(doc);
  events.splice(100);
  renderAlarms();
  renderDebug();
}

function maskToPocos(mask) {
  const list = [];
  if (mask & 1) list.push("P1");
  if (mask & 2) list.push("P2");
  if (mask & 4) list.push("P3");
  return list.join(" + ") || "Nenhum";
}

let retroPages = new Map();

function formatEpoch(epoch) {
  const n = Number(epoch || 0);
  if (n < 1700000000) return "--";
  return new Date(n * 1000).toLocaleString("pt-BR");
}

function traduzirResultadoRetro(codigo) {
  const mapa = {
    EM_ANDAMENTO: "Retro em andamento",
    OK: "Concluída",
    OK_COM_SUBSTITUICAO: "Concluída com substituição",
    SEM_POCO_DISPONIVEL: "Sem poço disponível",
    ABORTADA_MANUAL: "Interrompida pelo modo manual",
    FALHA: "Falha",
    DESCONHECIDO: "Status desconhecido"
  };
  return mapa[codigo] || codigo || "--";
}

function traduzirMotivoRetro(codigo) {
  const mapa = {
    RETRO_DESATIVADA: "Retro finalizada",
    MANUAL_ASSUMIU: "Modo manual assumiu",
    EM_ANDAMENTO: "Em andamento"
  };
  return mapa[codigo] || codigo || "";
}

function renderRetroRegisters(regs, quantidade) {
  $("retroCount").textContent = String(quantidade ?? regs.length);
  if (!regs.length) {
    $("retroLogBody").innerHTML = '<tr><td colspan="4">Nenhum registro salvo na central.</td></tr>';
    return;
  }
  $("retroLogBody").innerHTML = regs.map(r => `<tr>
    <td>${r.inicio || formatEpoch(r.inicio_epoch)}</td>
    <td>${r.fim || formatEpoch(r.fim_epoch)}<br><span class="muted">${formatRuntime(r.duracao_seg ?? r.duracao_s)}</span></td>
    <td>${maskToPocos(Number(r.pocos_feedback_mask ?? r.grupoFeedbackConfirmado ?? 0))}</td>
    <td>${traduzirResultadoRetro(r.resultado || "OK")}${r.houve_substituicao ? `<br><span class="muted">Substitutos: ${maskToPocos(Number(r.substitutos_mask ?? r.grupoSubstitutosUsados ?? 0))}</span>` : ""}${r.erro || r.motivo ? `<br><span class="muted">${r.erro ? r.erro : traduzirMotivoRetro(r.motivo)}</span>` : ""}</td>
  </tr>`).join("");
}

function applyRetroHistory(doc) {
  const regs = Array.isArray(doc.registros) ? doc.registros : [];
  const paginas = Number(doc.paginas || 1);
  const pagina = Number(doc.pagina || 1);

  if (paginas > 1) {
    if (pagina === 1) retroPages = new Map();
    retroPages.set(pagina, regs);
    if (retroPages.size < paginas) {
      $("retroCount").textContent = `${doc.quantidade_total ?? "..."} (recebendo)`;
      return;
    }
    const merged = [];
    for (let p = 1; p <= paginas; p++) merged.push(...(retroPages.get(p) || []));
    renderRetroRegisters(merged, doc.quantidade_total ?? merged.length);
    return;
  }

  renderRetroRegisters(regs, doc.quantidade ?? regs.length);
}

function applyRetroEvent(doc) {
  addCentralEvent({
    ...doc,
    nivel: doc.resultado && String(doc.resultado).includes("FALHA") ? "alerta" : "info",
    rotina: "RETRO",
    mensagem: doc.mensagem || doc.evento || "Evento de retrolavagem"
  });
  if (doc.evento === "RETRO_FIM") {
    command("READ_RETRO_LOG");
  }
}

function connectMqtt() {
  if (!window.mqtt) {
    toast("Biblioteca MQTT.js nao carregou.", false);
    renderConnection();
    return;
  }
  mqttClient = mqtt.connect(mqttConfig.url, {
    username: mqttConfig.username,
    password: mqttConfig.password,
    clientId: mqttConfig.clientId,
    clean: true,
    connectTimeout: 8000,
    reconnectPeriod: 3000
  });
  mqttClient.on("connect", () => {
    mqttClient.subscribe([
      mqttConfig.topics.availability,
      mqttConfig.topics.status,
      mqttConfig.topics.rede,
      mqttConfig.topics.cmdResult,
      mqttConfig.topics.configStatus,
      mqttConfig.topics.retroHistory,
      mqttConfig.topics.retroEvent,
      mqttConfig.topics.eventos
    ]);
    renderConnection();
    toast("MQTT conectado. Sincronizando com a central.");
    setTimeout(() => command("READ_CONFIG"), 300);
    setTimeout(() => command("READ_RETRO_LOG"), 600);
  });
  mqttClient.on("reconnect", renderConnection);
  mqttClient.on("close", () => { centralAvailable = null; renderConnection(); });
  mqttClient.on("error", err => console.log("MQTT erro:", err.message || err));
  mqttClient.on("message", (topic, payload, packet) => {
    const text = payload.toString().trim();

    if (topic === mqttConfig.topics.availability) {
      applyCentralStatusText(text.toLowerCase());
      return;
    }

    // Compatibilidade temporaria com versoes antigas que publicavam online/offline em status.
    if (topic === mqttConfig.topics.status && (text === "online" || text === "offline")) {
      applyCentralStatusText(text.toLowerCase());
      return;
    }

    let doc;
    try { doc = JSON.parse(text); } catch (err) { console.log("Payload nao JSON", topic, text); return; }

    if (topic === mqttConfig.topics.status) applyStatus(doc);
    if (topic === mqttConfig.topics.rede) applyRede(doc);
    if (topic === mqttConfig.topics.configStatus) applyConfig(doc);
    if (topic === mqttConfig.topics.cmdResult) applyCmdResult(doc);
    if (topic === mqttConfig.topics.retroHistory) applyRetroHistory(doc);
    if (topic === mqttConfig.topics.retroEvent) applyRetroEvent(doc);
    if (topic === mqttConfig.topics.eventos) addCentralEvent(doc);
  });
}

document.addEventListener("click", event => {
  const tab = event.target.closest(".tab");
  if (tab) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + tab.dataset.view));
    return;
  }
  const btn = event.target.closest("button");
  if (!btn) return;
  if (btn.id === "powerBtn") {
    if (!hasStatus || state.sistemaLigado === null || state.sistemaLigado === undefined) {
      toast("Aguardando status da central.", false);
      return;
    }
    command(state.sistemaLigado ? "POWER_OFF" : "POWER_ON");
  }
  if (btn.classList.contains("save-config")) saveConfig(btn.dataset.group);
  if (btn.classList.contains("read-config")) command("READ_CONFIG");
  if (btn.id === "tareBtn") {
    command("TARA_CLORO");
  }
  if (btn.id === "readRetroBtn") command("READ_RETRO_LOG");
  if (btn.id === "clearDebugBtn") { events.length = 0; renderAlarms(); renderDebug(); }

  if (btn.classList.contains("manual-toggle")) {
    const well = Number(btn.dataset.well);
    const bit = 1 << (well - 1);
    manualDraftMask ^= bit;
    manualDraftMask &= 0x07;
    renderWells();
  }

  if (btn.id === "applyManualGroupBtn") {
    command("DEFINIR_GRUPO_MANUAL", { grupo: manualDraftMask });
  }

  if (btn.id === "clearManualGroupBtn") {
    manualDraftMask = 0;
    renderWells();
    command("DEFINIR_GRUPO_MANUAL", { grupo: 0 });
  }

  if (btn.classList.contains("reset-fault")) command("RESET_FALHA", { poco: Number(btn.dataset.well) });
});

document.querySelectorAll("[data-config]").forEach(el => {
  const eventName = el.tagName === "SELECT" ? "change" : "input";
  el.addEventListener(eventName, () => {
    setFieldState(el.id, "dirty");
    updateRetroResult();
    renderStages();
  });
});

setInterval(renderConnection, 1000);
updateRetroResult();
renderAll();
connectMqtt();

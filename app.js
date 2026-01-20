// --- 1. CONFIGURAÇÃO DO BROKER MQTT (EMQX) ---
const MQTT_CONFIG = {
    host: "v05ef722.ala.us-east-1.emqxsl.com",
    port: 8084, 
    clientId: "Fenix_App_" + Math.random().toString(16).substr(2, 8),
    useSSL: true,
    path: "/mqtt",
    user: "Admin", 
    pass: "Admin"
};

// --- 2. INICIALIZAÇÃO DO CLIENTE ---
const client = new Paho.MQTT.Client(MQTT_CONFIG.host, MQTT_CONFIG.port, MQTT_CONFIG.path, MQTT_CONFIG.clientId);

const options = {
    useSSL: MQTT_CONFIG.useSSL,
    timeout: 3,
    keepAliveInterval: 60,
    cleanSession: true,
    userName: MQTT_CONFIG.user,
    password: MQTT_CONFIG.pass,
    onSuccess: onConnect,
    onFailure: (err) => {
        console.error("Erro na conexão MQTT:", err);
        document.getElementById("mqtt_status").innerText = "MQTT: Erro";
    }
};

// --- 3. EVENTOS DE CONEXÃO ---
function onConnect() {
    console.log("Conectado ao Broker EMQX");
    const mqttStatus = document.getElementById("mqtt_status");
    mqttStatus.innerText = "MQTT: On";
    mqttStatus.className = "status-on";
    
    // Inscrição nos tópicos
    client.subscribe("fenix/central/dashboard");
    client.subscribe("fenix/central/log");
    client.subscribe("fenix/central/alarmes");
    client.subscribe("fenix/central/historico");
    client.subscribe("config/central/status_atual");

    // Sincronização responsiva: pede os dados assim que conecta
    enviar("config/central/get_status", { request: "sync" });
}

client.onConnectionLost = (responseObject) => {
    const mqttStatus = document.getElementById("mqtt_status");
    const centralStatus = document.getElementById("central_status");
    mqttStatus.innerText = "MQTT: Off";
    mqttStatus.className = "status-off";
    centralStatus.className = "status-off";
    
    if (responseObject.errorCode !== 0) {
        console.log("Conexão perdida, tentando reconectar...");
        setTimeout(() => client.connect(options), 5000);
    }
};

client.onMessageArrived = (message) => {
    try {
        const topic = message.destinationName;
        const data = JSON.parse(message.payloadString);
        // Uso do requestAnimationFrame para garantir fluidez na UI
        requestAnimationFrame(() => processarMensagem(topic, data));
    } catch (e) {
        console.warn("Erro ao processar JSON:", e);
    }
};

client.connect(options);

// --- 4. PROCESSAMENTO DE MENSAGENS RESPONSIVO ---
function processarMensagem(topic, data) {
    if (topic === "fenix/central/dashboard") {
        atualizarUI(data);
        const centralStatus = document.getElementById("central_status");
        centralStatus.innerText = "Central: On";
        centralStatus.className = "status-on";
    }
    
    if (topic === "config/central/status_atual") {
        sincronizarCamposConfig(data);
    }

    if (topic === "fenix/central/log" && typeof adicionarAoLog === "function") {
        adicionarAoLog(data.msg_log);
    }

    if (topic === "fenix/central/alarmes" && typeof renderizarAlarmes === "function") {
        renderizarAlarmes(data);
    }
}

// --- 5. ATUALIZAÇÃO DA INTERFACE (UI) ---
function atualizarUI(data) {
    // Atualização em lote dos campos de status
    const camposGerais = ["sistema", "passo", "boia", "operacao", "retroA", "retroB", "ativo", "manual_sel", "rodizio_min"];
    camposGerais.forEach(id => {
        const el = document.getElementById("status_" + id);
        if(el && data[id] !== undefined) el.innerText = data[id];
    });

    // Monitoramento dos 3 Poços
    for (let i = 1; i <= 3; i++) {
        const prefix = `p${i}_`;
        
        // Elementos de texto
        const elOnline = document.getElementById(prefix + "online");
        const elFluxo = document.getElementById(prefix + "fluxo");
        const elTimer = document.getElementById(prefix + "timer");
        
        if (elOnline) elOnline.innerText = data[prefix + "on"] || "-";
        if (elFluxo) elFluxo.innerText = data[prefix + "flx"] || "-";
        if (elTimer) elTimer.innerText = data[prefix + "rod"] || "00:00";
        
        // Dados de Consumo
        const parcTime = data[prefix + "parc"] || "00:00";
        const elDataDash = document.getElementById(prefix + "data_dash");
        const elTimerDash = document.getElementById(prefix + "timer_total_dash");
        
        if (elDataDash) elDataDash.innerText = data[prefix + "dt"] || "-";
        if (elTimerDash) elTimerDash.innerText = parcTime;

        // Animação Responsiva do Motor (CSS spinning)
        const motorIcon = document.getElementById(prefix + "motor");
        if(motorIcon) {
            if(data[prefix + "flx"] === "Presente") motorIcon.classList.add("spinning");
            else motorIcon.classList.remove("spinning");
        }

        // Cálculos Financeiros
        if(data[prefix + "parc_seg"] !== undefined) {
            calcularFinanceiro(i, data[prefix + "parc_seg"]);
        }
    }

    // Cloro (Barra de progresso responsiva)
    const elCloroPeso = document.getElementById("cloro_peso");
    const elCloroBar = document.getElementById("cloro_bar");
    const elCloroTxt = document.getElementById("cloro_pct_txt");

    if(data.cloro_kg !== undefined && elCloroPeso) elCloroPeso.innerText = data.cloro_kg + " kg";
    if(data.cloro_pct !== undefined) {
        if(elCloroBar) elCloroBar.style.width = data.cloro_pct + "%";
        if(elCloroTxt) elCloroTxt.innerText = data.cloro_pct + "%";
    }
}

// --- 6. CÁLCULOS E SINCRONIZAÇÃO ---
function calcularFinanceiro(id, segsTotal) {
    const elKw = document.getElementById(`cfg_p${id}_kw`);
    const elPreco = document.getElementById("cfg_preco_kwh");
    
    const kw = (elKw ? parseFloat(elKw.value) : 0) || 0;
    const preco = (elPreco ? parseFloat(elPreco.value) : 0) || 0;
    
    const kwh = (segsTotal / 3600) * kw;
    const custo = kwh * preco;

    // Atualiza todos os campos de valor simultaneamente
    const targets = [`p${id}_kwh_dash`, `p${id}_kw_parcial` , `p${id}_valor_dash`, `p${id}_valor` ];
    targets.forEach(t => {
        const el = document.getElementById(t);
        if(el) {
            if(t.includes("kwh") || t.includes("kw_")) el.innerText = kwh.toFixed(2) + " kWh";
            else el.innerText = "R$ " + custo.toLocaleString('pt-BR', {minimumFractionDigits: 2});
        }
    });
}

function sincronizarCamposConfig(data) {
    const mapping = {
        'set_rh': 'cfg_rodizio_h',
        'set_rm': 'cfg_rodizio_m',
        'cfg_rA': 'select_retroA',
        'cfg_rB': 'select_retroB',
        'man_sel': 'select_manual',
        'set_t_off': 'cfg_timeout_offline',
        'set_t_fb': 'cfg_timeout_feedback',
        'set_t_ench': 'cfg_timeout_enchimento',
        'set_p_cloro': 'cfg_peso_critico'
    };

    for (let key in mapping) {
        const el = document.getElementById(mapping[key]);
        if (el && data[key] !== undefined) el.value = data[key];
    }
}

// --- 7. COMANDOS (PUBLISH) ---
function enviar(topico, payload) {
    if (!client.isConnected()) return;
    const message = new Paho.MQTT.Message(JSON.stringify(payload));
    message.destinationName = topico;
    message.qos = 1; // Garante a entrega
    client.send(message);
}

// Listeners de Eventos
document.addEventListener('DOMContentLoaded', () => {
    const btnConfig = document.getElementById("btn_salvar_config");
    if(btnConfig) {
        btnConfig.onclick = () => {
            enviar("config/central/ajustes", {
                set_rh: document.getElementById("cfg_rodizio_h").value,
                set_rm: document.getElementById("cfg_rodizio_m").value,
                cfg_rA: document.getElementById("select_retroA").value,
                cfg_rB: document.getElementById("select_retroB").value,
                man_sel: document.getElementById("select_manual").value
            });
        };
    }

    const btnSeg = document.getElementById("btn_salvar_seguranca");
    if(btnSeg) {
        btnSeg.onclick = () => {
            enviar("config/central/ajustes", {
                set_t_off: document.getElementById("cfg_timeout_offline").value,
                set_t_fb: document.getElementById("cfg_timeout_feedback").value,
                set_t_ench: document.getElementById("cfg_timeout_enchimento").value,
                set_p_cloro: document.getElementById("cfg_peso_critico").value
            });
        };
    }
});
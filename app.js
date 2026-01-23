document.addEventListener("DOMContentLoaded", () => {
    const MQTT_CONFIG = {
        host: "v05ef722.ala.us-east-1.emqxsl.com",
        port: 8084,
        path: "/mqtt",
        clientId: "Fenix_App_" + Math.random().toString(16).substr(2, 8),
        useSSL: true,
        user: "Admin",
        pass: "Admin"
    };

    const client = new Paho.MQTT.Client(MQTT_CONFIG.host, MQTT_CONFIG.port, MQTT_CONFIG.path, MQTT_CONFIG.clientId);

    // --- FUNÇÃO: ENVIAR COMANDO (TARA) ---
    window.enviarComando = function(tipo) {
        if (client && client.isConnected()) {
            let payload = {};
            if (tipo === 'tara_balanca') {
                payload = { tara_balanca: 1 };
            }
            const message = new Paho.MQTT.Message(JSON.stringify(payload));
            message.destinationName = "fenix/central/comando";
            client.send(message);
            console.log("Comando enviado:", payload);
        } else {
            alert("Erro: MQTT não conectado!");
        }
    };

    // --- FUNÇÃO PARA PEDIR SINCRONIZAÇÃO ---
    window.solicitarSincronizacaoAjustes = function() {
        if (client && client.isConnected()) {
            const message = new Paho.MQTT.Message(JSON.stringify({ acao: "sincronizar_ajustes" }));
            message.destinationName = "fenix/central/comando";
            client.send(message);
            console.log("Solicitação de sincronização enviada!");
        }
    };

    const options = {
        useSSL: true,
        timeout: 5,
        userName: "Admin",
        password: "Admin",
        onSuccess: () => {
            document.getElementById("mqtt_status").innerText = "MQTT: On";
            document.getElementById("mqtt_status").className = "status-on";
            client.subscribe("fenix/central/#");
            
            setTimeout(() => {
                window.solicitarSincronizacaoAjustes();
                console.log("Sincronização automática inicial disparada.");
            }, 500);
        },
        onFailure: () => {
            document.getElementById("mqtt_status").innerText = "MQTT: Erro";
            document.getElementById("mqtt_status").className = "status-off";
        }
    };

    function enviar(topico, payload) {
        if (client && client.isConnected() && topico) {
            try {
                const message = new Paho.MQTT.Message(JSON.stringify(payload));
                message.destinationName = topico;
                client.send(message);
                console.log("Enviado para:", topico, payload);
            } catch (e) { console.error("Erro ao enviar MQTT:", e); }
        } else {
            console.warn("MQTT não conectado ou tópico ausente.");
        }
    }

    client.onMessageArrived = (message) => {
        try {
            const data = JSON.parse(message.payloadString);
            const topic = message.destinationName;

            // --- SINCRONIZAÇÃO DE AJUSTES ---
            if (topic.includes("config_atual")) {
                if(data.cfg_rodizio_h !== undefined) document.getElementById("cfg_rodizio_h").value = data.cfg_rodizio_h;
                if(data.cfg_rodizio_m !== undefined) document.getElementById("cfg_rodizio_m").value = data.cfg_rodizio_m;
                if(data.select_retroA !== undefined) document.getElementById("select_retroA").value = data.select_retroA;
                if(data.select_retroB !== undefined) document.getElementById("select_retroB").value = data.select_retroB;
                if(data.select_manual !== undefined) document.getElementById("select_manual").value = data.select_manual;

                if(data.cfg_timeout_offline !== undefined) document.getElementById("cfg_timeout_offline").value = data.cfg_timeout_offline;
                if(data.cfg_timeout_feedback !== undefined) document.getElementById("cfg_timeout_feedback").value = data.cfg_timeout_feedback;
                if(data.cfg_timeout_enchimento !== undefined) document.getElementById("cfg_timeout_enchimento").value = data.cfg_timeout_enchimento;
                if(data.cfg_peso_critico !== undefined) document.getElementById("cfg_peso_critico").value = data.cfg_peso_critico;

                if(data.cfg_preco_kwh !== undefined) document.getElementById("cfg_preco_kwh").value = data.cfg_preco_kwh;
                if(data.cfg_p1_kw !== undefined) document.getElementById("cfg_p1_kw").value = data.cfg_p1_kw;
                if(data.cfg_p2_kw !== undefined) document.getElementById("cfg_p2_kw").value = data.cfg_p2_kw;
                if(data.cfg_p3_kw !== undefined) document.getElementById("cfg_p3_kw").value = data.cfg_p3_kw;
                
                if(data.p1_w !== undefined) document.getElementById("cfg_peso_p1").value = data.p1_w;
                if(data.p2_w !== undefined) document.getElementById("cfg_peso_p2").value = data.p2_w;
                if(data.p3_w !== undefined) document.getElementById("cfg_peso_p3").value = data.p3_w;
                if(data.t_efic !== undefined) document.getElementById("cfg_tempo_eficiencia").value = data.t_efic;

                console.log("Ajustes sincronizados!");
            }

            // --- PROCESSAMENTO DO DASHBOARD ---
            if (topic.includes("dashboard")) {
                console.log("Dados recebidos:", data);

                // 1. Atualiza Status Geral
                if (data.sistema) document.getElementById("status_sistema").innerText = data.sistema;
                if (data.passo) document.getElementById("status_passo").innerText = data.passo;
                if (data.boia) document.getElementById("status_boia").innerText = data.boia;
                
                document.getElementById("status_operacao").innerText = data.operacao || "Automático";
                document.getElementById("status_retroA").innerText = data.retroA || "-";
                document.getElementById("status_retroB").innerText = data.retroB || "-";
                document.getElementById("status_ativo").innerText = data.ativo || "Nenhum";
                document.getElementById("status_manual_sel").innerText = data.manual_sel || "-";
                document.getElementById("status_rodizio_min").innerText = data.rodizio_min || "0";

                // 2. Atualiza o Cloro
                const cloroEl = document.getElementById("cloro_kg_dash");
                if (cloroEl && data.cl_kg !== undefined) {
                    cloroEl.innerText = Number(data.cl_kg).toFixed(2);
                }

                // 3. Atualiza os Poços 1, 2 e 3
                for (let i = 1; i <= 3; i++) {
                    const p_prefix = `p${i}_`;
                    
                    // Status e Fluxo
                    const st = document.getElementById(p_prefix + "online");
                    if (st && data[p_prefix + "st"]) st.innerText = data[p_prefix + "st"];
                    
                    const flx = document.getElementById(p_prefix + "fluxo");
                    if (flx && data[p_prefix + "flx"]) flx.innerText = data[p_prefix + "flx"];

                    // Horas Equivalentes e Partidas
                    const hEq = document.getElementById(p_prefix + "hora_eq");
                    const hEqCons = document.getElementById(p_prefix + "hora_eq_cons");
                    if (data[p_prefix + "hora_eq"] !== undefined) {
                        const val = data[p_prefix + "hora_eq"] + " Eq/h";
                        if (hEq) hEq.innerText = val;
                        if (hEqCons) hEqCons.innerText = val;
                    }

                    const part = document.getElementById(p_prefix + "partidas");
                    const partCons = document.getElementById(p_prefix + "partidas_cons");
                    if (data[p_prefix + "partidas"] !== undefined) {
                        const val = data[p_prefix + "partidas"];
                        if (part) part.innerText = val;
                        if (partCons) partCons.innerText = val;
                    }

                    // Timers e Energia
                    if (data[p_prefix + "tmr"]) document.getElementById(p_prefix + "timer").innerText = data[p_prefix + "tmr"];
                    if (data[p_prefix + "total"]) document.getElementById(p_prefix + "timer_total").innerText = data[p_prefix + "total"];
                    
                    if (data[p_prefix + "parc"]) {
                        const dP = document.getElementById(p_prefix + "timer_parcial_dash");
                        const cP = document.getElementById(p_prefix + "timer_parcial");
                        if (dP) dP.innerText = data[p_prefix + "parc"];
                        if (cP) cP.innerText = data[p_prefix + "parc"];
                    }

                    if (data[p_prefix + "kwh"]) document.getElementById(p_prefix + "kwh_dash").innerText = data[p_prefix + "kwh"] + " kWh";

                    if (data[p_prefix + "rs"]) {
                        const val = "R$ " + data[p_prefix + "rs"];
                        if (document.getElementById(p_prefix + "valor_dash")) document.getElementById(p_prefix + "valor_dash").innerText = val;
                        if (document.getElementById(p_prefix + "valor")) document.getElementById(p_prefix + "valor").innerText = val;
                    }
                    
                    // Animação do motor
                    const motor = document.getElementById(p_prefix + "motor");
                    if (motor) {
                        if (data[p_prefix + "flx"] === "Presente") motor.classList.add("spinning");
                        else motor.classList.remove("spinning");
                    }
                }
            }

            // --- ALARMES E HISTÓRICO ---
            if (topic.includes("alarmes")) {
                const alarmList = document.getElementById("alarm_list");
                if (alarmList && data.alertas) {
                    alarmList.innerHTML = ""; 
                    data.alertas.forEach(msg => {
                        const li = document.createElement("li");
                        li.style.color = "#fca5a5";
                        li.innerHTML = `<strong><i data-lucide="alert-circle"></i></strong> ${msg}`;
                        alarmList.appendChild(li);
                    });
                }
                lucide.createIcons();
            }

            if (topic.includes("historico")) {
                if (data.tipo === "relatorio_retro") {
                    const txt = `Data: ${data.data} | Início: ${data.inicio} | Fim: ${data.fim} | Poços: ${data.pocos}`;
                    const l = document.getElementById("lista_historico_retro");
                    if (l) { const li = document.createElement("li"); li.innerHTML = `<strong><i data-lucide="refresh-cw"></i> RETRO:</strong> ${txt}`; l.prepend(li); }
                } else if (data.tipo === "evento") {
                    const l = document.getElementById("history_list");
                    if (l) { const li = document.createElement("li"); li.innerHTML = `<strong>[${new Date().toLocaleTimeString()}]</strong> ${data.msg}`; l.prepend(li); }
                }
                lucide.createIcons();
            }
        } catch (e) { console.warn("Erro no processamento da mensagem", e); }
    };

    // --- EVENT LISTENERS (BOTÕES SALVAR) ---
    document.getElementById("btn_salvar_config")?.addEventListener("click", () => {
        enviar("fenix/central/config", { 
            rodizio_h: Number(document.getElementById("cfg_rodizio_h").value), 
            rodizio_m: Number(document.getElementById("cfg_rodizio_m").value),
            retroA: Number(document.getElementById("select_retroA").value),
            retroB: Number(document.getElementById("select_retroB").value),
            manual: Number(document.getElementById("select_manual").value)
        });
    });

    document.getElementById("btn_salvar_seguranca")?.addEventListener("click", () => {
        enviar("fenix/central/seguranca", {
            timeout_off: Number(document.getElementById("cfg_timeout_offline").value),
            timeout_feed: Number(document.getElementById("cfg_timeout_feedback").value),
            timeout_ench: Number(document.getElementById("cfg_timeout_enchimento").value),
            cloro_critico: Number(document.getElementById("cfg_peso_critico").value)
        });
    });

    document.getElementById("btn_salvar_energia")?.addEventListener("click", () => {
        enviar("fenix/central/energia", { 
            preco_kwh: Number(document.getElementById("cfg_preco_kwh").value), 
            p1_kw: Number(document.getElementById("cfg_p1_kw").value), 
            p2_kw: Number(document.getElementById("cfg_p2_kw").value), 
            p3_kw: Number(document.getElementById("cfg_p3_kw").value) 
        });
    });

    document.getElementById("btn_salvar_hidraulica")?.addEventListener("click", () => {
        enviar("fenix/central/config_hidraulica", {
            p1_w: Number(document.getElementById("cfg_peso_p1").value),
            p2_w: Number(document.getElementById("cfg_peso_p2").value),
            p3_w: Number(document.getElementById("cfg_peso_p3").value),
            t_efic: Number(document.getElementById("cfg_tempo_eficiencia").value)
        });
        alert("Configurações Hidráulicas Enviadas!");
    });

    document.getElementById("btn_power_central")?.addEventListener("click", () => {
        enviar("fenix/central/comando", { acao: "toggle_power" });
    });

    document.getElementById("btn_reset_alarmes")?.addEventListener("click", () => {
        enviar("fenix/central/comando", { acao: "reset_alarmes" });
    });

    [1, 2, 3].forEach(i => {
        document.getElementById(`btn_reset_p${i}`)?.addEventListener("click", () => {
            enviar("fenix/central/comando", { acao: "reset_parcial", poco: i });
        });
    });

    client.connect(options);
});

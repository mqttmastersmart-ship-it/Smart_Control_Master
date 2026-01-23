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

    // --- FUNÇÕES GLOBAIS ---
    window.enviarComando = function(tipo) {
        if (client && client.isConnected()) {
            let payload = (tipo === 'tara_balanca') ? { tara_balanca: 1 } : {};
            const message = new Paho.MQTT.Message(JSON.stringify(payload));
            message.destinationName = "fenix/central/comando";
            client.send(message);
            console.log("Comando enviado:", tipo);
        }
    };

    window.solicitarSincronizacaoAjustes = function() {
        if (client && client.isConnected()) {
            const message = new Paho.MQTT.Message(JSON.stringify({ acao: "sincronizar_ajustes" }));
            message.destinationName = "fenix/central/comando";
            client.send(message);
            console.log("Solicitando sincronização à Central...");
        }
    };

    const options = {
        useSSL: true,
        timeout: 5,
        userName: MQTT_CONFIG.user,
        password: MQTT_CONFIG.pass,
        onSuccess: () => {
            document.getElementById("mqtt_status").innerText = "MQTT: On";
            document.getElementById("mqtt_status").className = "status-on";
            client.subscribe("fenix/central/#");
            // Pede os dados da memória assim que conecta
            setTimeout(window.solicitarSincronizacaoAjustes, 1000);
        },
        onFailure: () => {
            document.getElementById("mqtt_status").innerText = "MQTT: Erro";
            document.getElementById("mqtt_status").className = "status-off";
        }
    };

    function enviar(topico, payload) {
        if (client && client.isConnected()) {
            const message = new Paho.MQTT.Message(JSON.stringify(payload));
            message.destinationName = topico;
            client.send(message);
            console.log("Enviado para " + topico, payload);
        }
    }

    // --- RECEBIMENTO DE MENSAGENS ---
    client.onMessageArrived = (message) => {
        try {
            const data = JSON.parse(message.payloadString);
            const topic = message.destinationName;

            // 1. CARREGAR AJUSTES (Tópico config_atual)
            if (topic.includes("config_atual")) {
                console.log("Ajustes recebidos da Central:", data);
                
                // Central e Rodízio
                if(data.cfg_rodizio_h !== undefined) document.getElementById("cfg_rodizio_h").value = data.cfg_rodizio_h;
                if(data.cfg_rodizio_m !== undefined) document.getElementById("cfg_rodizio_m").value = data.cfg_rodizio_m;
                if(data.p1_w !== undefined) document.getElementById("cfg_peso_p1").value = data.p1_w;
                if(data.p2_w !== undefined) document.getElementById("cfg_peso_p2").value = data.p2_w;
                if(data.p3_w !== undefined) document.getElementById("cfg_peso_p3").value = data.p3_w;
                if(data.t_efic !== undefined) document.getElementById("cfg_tempo_eficiencia").value = data.t_efic;

                // Segurança
                if(data.cfg_timeout_offline !== undefined) document.getElementById("cfg_timeout_offline").value = data.cfg_timeout_offline;
                if(data.cfg_timeout_feedback !== undefined) document.getElementById("cfg_timeout_feedback").value = data.cfg_timeout_feedback;
                if(data.cfg_timeout_enchimento !== undefined) document.getElementById("cfg_timeout_enchimento").value = data.cfg_timeout_enchimento;
                if(data.cfg_peso_critico !== undefined) document.getElementById("cfg_peso_critico").value = data.cfg_peso_critico;

                // Energia
                if(data.cfg_preco_kwh !== undefined) document.getElementById("cfg_preco_kwh").value = data.cfg_preco_kwh;
                if(data.cfg_p1_kw !== undefined) document.getElementById("cfg_p1_kw").value = data.cfg_p1_kw;
                if(data.cfg_p2_kw !== undefined) document.getElementById("cfg_p2_kw").value = data.cfg_p2_kw;
                if(data.cfg_p3_kw !== undefined) document.getElementById("cfg_p3_kw").value = data.cfg_p3_kw;

                // Selects (Retro e Manual)
                if(data.select_retroA !== undefined) document.getElementById("select_retroA").value = data.select_retroA;
                if(data.select_retroB !== undefined) document.getElementById("select_retroB").value = data.select_retroB;
                if(data.select_manual !== undefined) document.getElementById("select_manual").value = data.select_manual;
            }

            // 2. DASHBOARD (Tópico dashboard)
            if (topic.includes("dashboard")) {
                // Status Geral
                document.getElementById("status_sistema").innerText = data.sistema || "-";
                document.getElementById("status_passo").innerText = data.passo || "-";
                document.getElementById("status_boia").innerText = data.boia || "-";
                document.getElementById("status_operacao").innerText = data.operacao || "Automático";
                document.getElementById("status_retroA").innerText = data.retroA || "-";
                document.getElementById("status_retroB").innerText = data.retroB || "-";
                document.getElementById("status_ativo").innerText = data.ativo || "Nenhum";
                document.getElementById("status_manual_sel").innerText = data.manual_sel || "-";
                document.getElementById("status_rodizio_min").innerText = data.rodizio_min || "0";

                if (data.cl_kg !== undefined) {
                    document.getElementById("cloro_kg_dash").innerText = Number(data.cl_kg).toFixed(2);
                }

                // Atualização dos 3 Poços
                for (let i = 1; i <= 3; i++) {
                    const p = `p${i}_`;
                    if (data[p+'st']) document.getElementById(p+'online').innerText = data[p+'st'];
                    if (data[p+'flx']) document.getElementById(p+'fluxo').innerText = data[p+'flx'];
                    if (data[p+'tmr']) document.getElementById(p+'timer').innerText = data[p+'tmr'];
                    if (data[p+'total']) document.getElementById(p+'timer_total').innerText = data[p+'total'];
                    
                    // Hora Equivalente e Partidas
                    if (data[p+'hora_eq'] !== undefined) {
                        const val = data[p+'hora_eq'] + " Eq/h";
                        if (document.getElementById(p+'hora_eq')) document.getElementById(p+'hora_eq').innerText = val;
                        if (document.getElementById(p+'hora_eq_cons')) document.getElementById(p+'hora_eq_cons').innerText = val;
                    }
                    if (data[p+'partidas'] !== undefined) {
                        const val = data[p+'partidas'];
                        if (document.getElementById(p+'partidas')) document.getElementById(p+'partidas').innerText = val;
                        if (document.getElementById(p+'partidas_cons')) document.getElementById(p+'partidas_cons').innerText = val;
                    }

                    // Energia e Valores
                    if (data[p+'kwh']) document.getElementById(p+'kwh_dash').innerText = data[p+'kwh'] + " kWh";
                    if (data[p+'rs']) {
                        const val = "R$ " + data[p+'rs'];
                        if (document.getElementById(p+'valor_dash')) document.getElementById(p+'valor_dash').innerText = val;
                        if (document.getElementById(p+'valor')) document.getElementById(p+'valor').innerText = val;
                    }

                    // Motores girando
                    const motor = document.getElementById(p+'motor');
                    if (motor) {
                        if (data[p+'flx'] === "Presente") motor.classList.add("spinning");
                        else motor.classList.remove("spinning");
                    }
                }
            }

            // 3. ALARMES E HISTÓRICO
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
        } catch (e) { console.error("Erro ao processar mensagem:", e); }
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

    [1, 2, 3].forEach(i => {
        document.getElementById(`btn_reset_p${i}`)?.addEventListener("click", () => {
            enviar("fenix/central/comando", { acao: "reset_parcial", poco: i });
        });
    });

    document.getElementById("btn_power_central")?.addEventListener("click", () => {
        enviar("fenix/central/comando", { acao: "toggle_power" });
    });

    client.connect(options);
});

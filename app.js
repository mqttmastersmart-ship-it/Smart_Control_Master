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
            
            // 1. Inscrição nos tópicos
            client.subscribe("fenix/central/#");
            
            // --- ALTERAÇÃO REALIZADA: SINCRONIZAÇÃO AO CONECTAR ---
            // Dispara o pedido de memória assim que conecta, para carregar os valores iniciais
            setTimeout(() => {
                window.solicitarSincronizacaoAjustes();
                console.log("Sincronização automática inicial disparada após conexão MQTT.");
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

            if (topic === "fenix/central/config_atual") {
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
                
                console.log("Ajustes sincronizados com a memória da Central.");
            }

            if (topic === "fenix/central/dashboard") {
                const fields = ['sistema', 'passo', 'boia', 'operacao', 'ativo', 'rodizio_min', 'retroA', 'retroB', 'manual_sel'];
                fields.forEach(f => {
                    const el = document.getElementById("status_" + f);
                    if(el && data[f]) el.innerText = data[f];
                });

                const cloroEl = document.getElementById("cloro_kg_dash");
                if (cloroEl && data.cl_kg !== undefined) {
                    cloroEl.innerText = data.cl_kg.toFixed(2);
                }

                for (let i = 1; i <= 3; i++) {
                    if (data[`p${i}_st`]) document.getElementById(`p${i}_online`).innerText = data[`p${i}_st`];
                    if (data[`p${i}_flx`]) document.getElementById(`p${i}_fluxo`).innerText = data[`p${i}_flx`];
                    if (data[`p${i}_tmr`]) document.getElementById(`p${i}_timer`).innerText = data[`p${i}_tmr`];
                    if (data[`p${i}_total`]) document.getElementById(`p${i}_timer_total`).innerText = data[`p${i}_total`];
                    if (data[`p${i}_reset`]) {
                        document.getElementById(`p${i}_data_dash`).innerText = data[`p${i}_reset`];
                        document.getElementById(`p${i}_data_cons`).innerText = data[`p${i}_reset`];
                    }
                    if (data[`p${i}_parc`]) {
                        const dP = document.getElementById(`p${i}_timer_parcial_dash`);
                        const cP = document.getElementById(`p${i}_timer_parcial`);
                        if (dP) dP.innerText = data[`p${i}_parc`];
                        if (cP) cP.innerText = data[`p${i}_parc`];
                    }
                    if (data[`p${i}_kwh`]) document.getElementById(`p${i}_kwh_dash`).innerText = data[`p${i}_kwh`] + " kWh";
                    if (data[`p${i}_rs`]) {
                        document.getElementById(`p${i}_valor_dash`).innerText = "R$ " + data[`p${i}_rs`];
                        document.getElementById(`p${i}_valor`).innerText = "R$ " + data[`p${i}_rs`];
                    }
                    const motor = document.getElementById(`p${i}_motor`);
                    if (motor && data[`p${i}_flx`] === "Presente") motor.classList.add("spinning");
                    else if (motor) motor.classList.remove("spinning");
                }
            }

            if (topic === "fenix/central/alarmes") {
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

            if (topic === "fenix/central/historico") {
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
        } catch (e) { console.warn("Erro no processamento da mensagem"); }
    };

    // --- ESCUTADOR DE ABA: MANTIDO PARA SINCRONIZAÇÃO MANUAL NO CLIQUE ---
    const btnAjustes = document.querySelector('button[onclick*="ajustes"]') || document.getElementById("btn_ajustes");
    if (btnAjustes) {
        btnAjustes.addEventListener("click", () => {
            setTimeout(() => {
                window.solicitarSincronizacaoAjustes();
            }, 200);
        });
    }

    // --- EVENT LISTENERS (BOTÕES SALVAR) ---
    document.getElementById("btn_salvar_config")?.addEventListener("click", () => {
        enviar("fenix/central/config", { 
            rodizio_h: document.getElementById("cfg_rodizio_h").value, 
            rodizio_m: document.getElementById("cfg_rodizio_m").value,
            retroA: document.getElementById("select_retroA").value,
            retroB: document.getElementById("select_retroB").value,
            manual: document.getElementById("select_manual").value
        });
    });

    document.getElementById("btn_salvar_seguranca")?.addEventListener("click", () => {
        enviar("fenix/central/seguranca", {
            timeout_off: document.getElementById("cfg_timeout_offline").value,
            timeout_feed: document.getElementById("cfg_timeout_feedback").value,
            timeout_ench: document.getElementById("cfg_timeout_enchimento").value,
            cloro_critico: document.getElementById("cfg_peso_critico").value
        });
    });

    document.getElementById("btn_salvar_energia")?.addEventListener("click", () => {
        enviar("fenix/central/energia", { 
            preco_kwh: document.getElementById("cfg_preco_kwh").value, 
            p1_kw: document.getElementById("cfg_p1_kw").value, 
            p2_kw: document.getElementById("cfg_p2_kw").value, 
            p3_kw: document.getElementById("cfg_p3_kw").value 
        });
    });

    document.getElementById("btn_power_central")?.addEventListener("click", () => {
        enviar("fenix/central/comando", { acao: "toggle_power" });
    });

    document.getElementById("btn_reset_alarmes")?.addEventListener("click", () => {
        enviar("fenix/central/comando", { acao: "reset_alarmes" });
        const list = document.getElementById("alarm_list");
        if(list) list.innerHTML = "<li style='color:#94a3b8'>Reset enviado...</li>";
    });

    [1, 2, 3].forEach(i => {
        document.getElementById(`btn_reset_p${i}`)?.addEventListener("click", () => {
            enviar("fenix/central/comando", { acao: "reset_parcial", poco: i });
        });
    });

    client.connect(options);
});

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

    // FUNÇÃO: ENVIAR COMANDOS GLOBAIS
    window.enviarComando = function(tipo) {
        if (client && client.isConnected()) {
            let payload = (tipo === 'tara_balanca') ? { tara_balanca: 1 } : { acao: tipo };
            const message = new Paho.MQTT.Message(JSON.stringify(payload));
            message.destinationName = "fenix/central/comando";
            client.send(message);
            console.log("Comando enviado:", payload);
        }
    };

    // FUNÇÃO AUXILIAR PARA ENVIAR JSON
    function enviarJSON(topico, objeto) {
        if (client && client.isConnected()) {
            const message = new Paho.MQTT.Message(JSON.stringify(objeto));
            message.destinationName = topico;
            client.send(message);
            console.log("Enviado para " + topico + ":", objeto);
        } else {
            alert("Erro: MQTT desconectado");
        }
    }

    const options = {
        useSSL: true,
        timeout: 5,
        userName: MQTT_CONFIG.user,
        password: MQTT_CONFIG.pass,
        onSuccess: () => {
            document.getElementById("mqtt_status").innerText = "MQTT: On";
            document.getElementById("mqtt_status").className = "status-on";
            client.subscribe("fenix/central/#");
            
            // Solicita dados da memória do ESP32
            setTimeout(() => {
                enviarJSON("fenix/central/comando", { acao: "sincronizar_ajustes" });
            }, 1000);
        },
        onFailure: () => {
            document.getElementById("mqtt_status").innerText = "MQTT: Erro";
            document.getElementById("mqtt_status").className = "status-off";
        }
    };

    client.onMessageArrived = (message) => {
        try {
            const data = JSON.parse(message.payloadString);
            const topic = message.destinationName;

            // 1. RECEBENDO AJUSTES DA MEMÓRIA
            if (topic.includes("config_atual")) {
                if(data.cfg_rodizio_h !== undefined) document.getElementById("cfg_rodizio_h").value = data.cfg_rodizio_h;
                if(data.p1_w !== undefined) document.getElementById("cfg_peso_p1").value = data.p1_w;
                if(data.p2_w !== undefined) document.getElementById("cfg_peso_p2").value = data.p2_w;
                if(data.p3_w !== undefined) document.getElementById("cfg_peso_p3").value = data.p3_w;
                if(data.t_efic !== undefined) document.getElementById("cfg_tempo_eficiencia").value = data.t_efic;
                console.log("Ajustes sincronizados!");
            }

            // 2. RECEBENDO DADOS DO DASHBOARD
            if (topic.includes("dashboard")) {
                // Status Geral
                document.getElementById("status_sistema").innerText = data.sistema || "-";
                document.getElementById("status_passo").innerText = data.passo || "-";
                document.getElementById("status_boia").innerText = data.boia || "-";
                document.getElementById("status_ativo").innerText = data.ativo || "Nenhum";
                
                // Cloro
                if(data.cl_kg !== undefined) document.getElementById("cloro_kg_dash").innerText = Number(data.cl_kg).toFixed(2);

                // Dados de cada Poço (Loop 1 a 3)
                for (let i = 1; i <= 3; i++) {
                    const p = `p${i}_`;
                    if (data[p+'st']) document.getElementById(p+'online').innerText = data[p+'st'];
                    if (data[p+'flx']) document.getElementById(p+'fluxo').innerText = data[p+'flx'];
                    if (data[p+'hora_eq']) {
                        document.getElementById(p+'hora_eq').innerText = data[p+'hora_eq'] + " Eq/h";
                        if(document.getElementById(p+'hora_eq_cons')) document.getElementById(p+'hora_eq_cons').innerText = data[p+'hora_eq'] + " Eq/h";
                    }
                    if (data[p+'partidas'] !== undefined) {
                        document.getElementById(p+'partidas').innerText = data[p+'partidas'];
                        if(document.getElementById(p+'partidas_cons')) document.getElementById(p+'partidas_cons').innerText = data[p+'partidas'];
                    }
                    if (data[p+'total']) document.getElementById(p+'timer_total').innerText = data[p+'total'];
                    if (data[p+'parc']) {
                        if(document.getElementById(p+'timer_parcial_dash')) document.getElementById(p+'timer_parcial_dash').innerText = data[p+'parc'];
                        if(document.getElementById(p+'timer_parcial')) document.getElementById(p+'timer_parcial').innerText = data[p+'parc'];
                    }
                    if (data[p+'rs']) {
                        if(document.getElementById(p+'valor_dash')) document.getElementById(p+'valor_dash').innerText = "R$ " + data[p+'rs'];
                        if(document.getElementById(p+'valor')) document.getElementById(p+'valor').innerText = "R$ " + data[p+'rs'];
                    }

                    // Animação do motor
                    const motor = document.getElementById(p+'motor');
                    if (motor) {
                        if (data[p+'flx'] === "Presente") motor.classList.add("spinning");
                        else motor.classList.remove("spinning");
                    }
                }
            }
        } catch (e) { console.error("Erro no processamento do JSON:", e); }
    };

    // --- EVENTOS DOS BOTÕES SALVAR ---
    
    // Salvar Hidráulica (Pesos)
    document.getElementById("btn_salvar_hidraulica")?.addEventListener("click", () => {
        const payload = {
            p1_w: parseFloat(document.getElementById("cfg_peso_p1").value),
            p2_w: parseFloat(document.getElementById("cfg_peso_p2").value),
            p3_w: parseFloat(document.getElementById("cfg_peso_p3").value),
            t_efic: parseInt(document.getElementById("cfg_tempo_eficiencia").value)
        };
        enviarJSON("fenix/central/config_hidraulica", payload);
        alert("Configurações Hidráulicas Enviadas!");
    });

    // Salvar Configurações Gerais (Rodízio)
    document.getElementById("btn_salvar_config")?.addEventListener("click", () => {
        const payload = {
            rodizio_h: parseInt(document.getElementById("cfg_rodizio_h").value),
            rodizio_m: parseInt(document.getElementById("cfg_rodizio_m").value),
            retroA: parseInt(document.getElementById("select_retroA").value),
            retroB: parseInt(document.getElementById("select_retroB").value),
            manual: parseInt(document.getElementById("select_manual").value)
        };
        enviarJSON("fenix/central/config", payload);
        alert("Configurações Gerais Enviadas!");
    });

    // Reset de Poços Individuais
    [1, 2, 3].forEach(i => {
        document.getElementById(`btn_reset_p${i}`)?.addEventListener("click", () => {
            enviarJSON("fenix/central/comando", { acao: "reset_parcial", poco: i });
        });
    });

    // Power Central
    document.getElementById("btn_power_central")?.addEventListener("click", () => {
        window.enviarComando("toggle_power");
    });

    client.connect(options);
});

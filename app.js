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

    // FUNÇÃO: ENVIAR COMANDOS
    window.enviarComando = function(tipo) {
        if (client && client.isConnected()) {
            let payload = (tipo === 'tara_balanca') ? { tara_balanca: 1 } : { acao: tipo };
            const message = new Paho.MQTT.Message(JSON.stringify(payload));
            message.destinationName = "fenix/central/comando";
            client.send(message);
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
            client.subscribe("fenix/central/#"); // Escuta tudo da central
            
            // Pede sincronização logo ao conectar
            setTimeout(() => {
                const msg = new Paho.MQTT.Message(JSON.stringify({ acao: "sincronizar_ajustes" }));
                msg.destinationName = "fenix/central/comando";
                client.send(msg);
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

            // --- 1. SINCRONIZAR AJUSTES (Aba Configurações) ---
            if (topic.includes("config_atual")) {
                console.log("Ajustes recebidos:", data);
                if(data.cfg_rodizio_h !== undefined) document.getElementById("cfg_rodizio_h").value = data.cfg_rodizio_h;
                // Mapeia os nomes curtos do ESP para os IDs longos do HTML
                if(data.p1_w !== undefined) document.getElementById("cfg_peso_p1").value = data.p1_w;
                if(data.p2_w !== undefined) document.getElementById("cfg_peso_p2").value = data.p2_w;
                if(data.p3_w !== undefined) document.getElementById("cfg_peso_p3").value = data.p3_w;
                if(data.t_efic !== undefined) document.getElementById("cfg_tempo_eficiencia").value = data.t_efic;
            }

            // --- 2. DASHBOARD (Tela Principal) ---
            if (topic.includes("dashboard")) {
                // Status Geral
                if(data.sistema) document.getElementById("status_sistema").innerText = data.sistema;
                if(data.passo) document.getElementById("status_passo").innerText = data.passo;
                if(data.boia) document.getElementById("status_boia").innerText = data.boia;
                if(data.ativo !== undefined) document.getElementById("status_ativo").innerText = data.ativo || "Nenhum";
                
                // Cloro
                if(data.cl_kg !== undefined) document.getElementById("cloro_kg_dash").innerText = Number(data.cl_kg).toFixed(2);

                // Dados dos Poços (Loop para P1, P2 e P3)
                for (let i = 1; i <= 3; i++) {
                    const st = data[`p${i}_st`];
                    const flx = data[`p${i}_flx`];
                    const hEq = data[`p${i}_hora_eq`];
                    const part = data[`p${i}_partidas`];
                    const kwh = data[`p${i}_kwh`];
                    const rs = data[`p${i}_rs`];

                    if(st) document.getElementById(`p${i}_online`).innerText = st;
                    if(flx) document.getElementById(`p${i}_fluxo`).innerText = flx;
                    if(hEq) document.getElementById(`p${i}_hora_eq`).innerText = hEq + " Eq/h";
                    if(part !== undefined) document.getElementById(`p${i}_partidas`).innerText = part;
                    if(kwh) document.getElementById(`p${i}_kwh_dash`).innerText = kwh + " kWh";
                    if(rs) document.getElementById(`p${i}_valor_dash`).innerText = "R$ " + rs;

                    // Animação do motor
                    const motorIcon = document.getElementById(`p${i}_motor`);
                    if(motorIcon) {
                        if(flx === "Presente") motorIcon.classList.add("spinning");
                        else motorIcon.classList.remove("spinning");
                    }
                }
            }
        } catch (e) { console.error("Erro no processamento:", e); }
    };

    // BOTÃO SALVAR HIDRÁULICA
    document.getElementById("btn_salvar_hidraulica")?.addEventListener("click", () => {
        const payload = {
            p1_w: Number(document.getElementById("cfg_peso_p1").value),
            p2_w: Number(document.getElementById("cfg_peso_p2").value),
            p3_w: Number(document.getElementById("cfg_peso_p3").value),
            t_efic: Number(document.getElementById("cfg_tempo_eficiencia").value)
        };
        const message = new Paho.MQTT.Message(JSON.stringify(payload));
        message.destinationName = "fenix/central/config_hidraulica"; // Certifique-se que o ESP escuta este tópico ou "config"
        client.send(message);
        alert("Configurações enviadas!");
    });

    client.connect(options);
});

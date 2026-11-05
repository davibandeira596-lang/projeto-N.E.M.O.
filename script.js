const max_data = 10; 
const historicoLeituras = []; 

let ultimoRecebimentoTempo = Date.now();
let monitorConexaoTimer = null;
let ultimosValoresValidos = { temp: null, ph: null, tds: null, turb: null };

function criarGrafico(ctxId, label, color) {
    const ctx = document.getElementById(ctxId).getContext('2d');
    const backgroundColor = color.replace(/[\d\.]+\)$/g, '0.2)');

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                borderColor: color,
                backgroundColor: backgroundColor,
                borderWidth: 2,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: true, title: { display: false } },
                y: { beginAtZero: false }
            }
        }
    });
}

const graficoTemp = criarGrafico('graficoTemp', 'Temperatura (°C)', '#df5a65');
const graficoPh   = criarGrafico('graficoPh', 'pH da água', '#30c0af');
const graficoTds  = criarGrafico('graficoTds', 'TDS (ppm)', '#e6836b');
const graficoTurb = criarGrafico('graficoTurb', 'Turbidez (NTU)', '#0794e0');

function adicionarDado(grafico, valor) {
    const horaAtual = new Date().toLocaleTimeString();
    if (grafico.data.labels.length >= max_data) {
        grafico.data.labels.shift();
        grafico.data.datasets[0].data.shift();
    }
    grafico.data.labels.push(horaAtual);
    grafico.data.datasets[0].data.push(valor);
    grafico.update();
}

function validarDadoSemRuido(chave, valor, variacaoMaxima) {
    if (ultimosValoresValidos[chave] === null) {
        ultimosValoresValidos[chave] = valor;
        return valor;
    }
    const diferenca = Math.abs(valor - ultimosValoresValidos[chave]);
    if (diferenca > variacaoMaxima) {
        console.warn(`Pico de ruído ignorado em ${chave}: valor ${valor}`);
        return ultimosValoresValidos[chave];
    }
    ultimosValoresValidos[chave] = valor;
    return valor;
}

const modelo_url_padrao = "./my_model/";
let modelo, webcam, caixalegenda, maxPredictions;

document.addEventListener("DOMContentLoaded", () => {
    const salvarUrl = localStorage.getItem("modelo_url");
    if (salvarUrl) {
        document.getElementById("entrada-url").value = salvarUrl;
    }
});

async function inicCamera() {
    let usuarioUrl = document.getElementById("entrada-url").value.trim();

    if (!usuarioUrl) {
        usuarioUrl = modelo_url_padrao; 
    } else {
        if (!usuarioUrl.endsWith("/")) {
            usuarioUrl += "/";
        }
        localStorage.setItem("modelo_url", usuarioUrl);
    }

    const caminhoModelo = usuarioUrl + "model.json";
    const caminhometadata = usuarioUrl + "metadata.json";
    
    try {
        modelo = await tmImage.load(caminhoModelo, caminhometadata);
        maxPredictions = modelo.getTotalClasses();

        const flip = true; 
        webcam = new tmImage.Webcam(240, 240, flip);
        await webcam.setup();
        await webcam.play();
        window.requestAnimationFrame(loopcamera);

        const caixawebcam = document.getElementById("caixa-webcam");
        caixawebcam.innerHTML = '';
        caixawebcam.appendChild(webcam.canvas);

        caixalegenda = document.getElementById("legenda");
        caixalegenda.innerHTML = '';
        for (let i = 0; i < maxPredictions; i++) {
            const elemento = document.createElement("div");
            elemento.className = "legenda-item";
            caixalegenda.appendChild(elemento);
        }

        const statusConexao = document.getElementById("status-conexao");
        statusConexao.innerText = "Status: Câmara e Modelo de IA iniciados com sucesso!";
        statusConexao.style.color = "green";

    } catch (error) {
        console.error("Erro ao inicializar Teachable Machine:", error);
        alert("Erro ao carregar o modelo de inteligência artificial. Verifique o link informado.");
    }
}

async function loopcamera() {
    webcam.update();
    await preverImagem();
    window.requestAnimationFrame(loopcamera);
}

async function preverImagem() {
    if (!modelo || !caixalegenda) return;
    
    const previsoes = await modelo.predict(webcam.canvas);
    for (let i = 0; i < maxPredictions; i++) {
        const porcentagem = (previsoes[i].probability * 100).toFixed(0);
        const previsaoclasse = `${previsoes[i].className}: ${porcentagem}%`;
        if (caixalegenda.childNodes[i]) {
            caixalegenda.childNodes[i].innerHTML = previsaoclasse;
        }
    }
}

function iniciarMonitorConexao() {
    if (monitorConexaoTimer) clearInterval(monitorConexaoTimer);
    
    monitorConexaoTimer = setInterval(() => {
        const tempoSemDados = Date.now() - ultimoRecebimentoTempo;
        const statusConexao = document.getElementById("status-conexao");
        
        if (tempoSemDados > 3500) {
            statusConexao.innerText = "Status: ⚠️ Ligação interrompida / Aguardando dados do Arduino...";
            statusConexao.style.color = "orange";
        }
    }, 2000);
}

async function conectarArduino() {
    if (!("serial" in navigator)) {
        alert("API Serial não suportada neste navegador. Utilize Google Chrome, Microsoft Edge ou Brave.");
        return;
    }

    try {
        const porta = await navigator.serial.requestPort();
        await porta.open({ baudRate: 9600 });

        const statusConexao = document.getElementById("status-conexao");
        statusConexao.innerText = "Status: Conectado ao Arduino e a receber dados";
        statusConexao.style.color = "green";

        ultimoRecebimentoTempo = Date.now();
        iniciarMonitorConexao();

        const decodificador = new TextDecoderStream();
        porta.readable.pipeTo(decodificador.writable);
        const leitor = decodificador.readable.getReader();

        let buffer = '';

        while (true) {
            const { value, done } = await leitor.read();
            if (done) break;

            buffer += value;
            const linhas = buffer.split('\n');
            buffer = linhas.pop();

            for (const linha of linhas) {
                const linhaLimpa = linha.trim();
                if (linhaLimpa.startsWith("{") && linhaLimpa.endsWith("}")) {
                    try {
                        const dados = JSON.parse(linhaLimpa);
                        ultimoRecebimentoTempo = Date.now();
                        statusConexao.innerText = "Status: Conectado ao Arduino";
                        statusConexao.style.color = "green";

                        const dataHoraAtual = new Date();
                        const timestamp = dataHoraAtual.toLocaleTimeString();

                        const registroLeitura = {
                            data: dataHoraAtual.toLocaleDateString(),
                            hora: timestamp,
                            temp: dados.temp,
                            ph: dados.ph,
                            tds: dados.tds,
                            turb: dados.turb
                        };

                        if (dados.temp !== undefined) {
                            const tempFiltrada = validarDadoSemRuido('temp', dados.temp, 5.0);
                            document.getElementById("temp").innerText = tempFiltrada;
                            adicionarDado(graficoTemp, tempFiltrada);
                            registroLeitura.temp = tempFiltrada;
                        }

                        if (dados.ph !== undefined) {
                            const phFiltrado = validarDadoSemRuido('ph', dados.ph, 3.0);
                            document.getElementById("ph").innerText = phFiltrado;
                            adicionarDado(graficoPh, phFiltrado);
                            registroLeitura.ph = phFiltrado;
                        }

                        if (dados.tds !== undefined) {
                            const tdsFiltrado = validarDadoSemRuido('tds', dados.tds, 300.0);
                            document.getElementById("tds").innerText = tdsFiltrado;
                            adicionarDado(graficoTds, tdsFiltrado);
                            registroLeitura.tds = tdsFiltrado;
                        }

                        if (dados.turb !== undefined) {
                            const turbFiltrada = validarDadoSemRuido('turb', dados.turb, 100.0);
                            document.getElementById("turb").innerText = turbFiltrada;
                            adicionarDado(graficoTurb, turbFiltrada);
                            registroLeitura.turb = turbFiltrada;
                        }

                        historicoLeituras.push(registroLeitura);

                    } catch (e) {
                        console.warn("Erro no parse JSON:", e);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Erro ao ligar ao Arduino:", error);
        const statusConexao = document.getElementById("status-conexao");
        statusConexao.innerText = "Status: Erro de ligação com o Arduino";
        statusConexao.style.color = "red";
    }
}

function exportarCSV() {
    if (historicoLeituras.length === 0) {
        alert("Nenhum dado recolhido para exportação.");
        return;
    }

    let csvConteudo = "data:text/csv;charset=utf-8,Data,Hora,Temperatura (C),pH,TDS (ppm),Turbidez (NTU)\n";

    historicoLeituras.forEach(r => {
        csvConteudo += `${r.data},${r.hora},${r.temp},${r.ph},${r.tds},${r.turb}\n`;
    });

    const encodedUri = encodeURI(csvConteudo);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_NEMO_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

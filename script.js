const max_data = 10; // Número máximo de dados a serem armazenados

function criarGrafico(ctxId, label, color) {
    const ctx = document.getElementById(ctxId).getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                borderColor: color,
                backgroundColor: color + '22', // Adiciona transparência
                borderWidth: 2,
                fill: true,
                tension: '0.3'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {display: true, title: {display: false }},
                y: {beginAtZero: false }
            }
        }
    });
}

const graficoTemp = criarGrafico('graficoTemp', 'Temperatura (°C)', '#e63946');
const graficoPh = criarGrafico('graficoPh', 'pH da água', '#2a9d8f');
const graficoTds = criarGrafico('graficoTds', 'TDS (ppm)', '#e76f51');
const graficoTurb = criarGrafico('graficoTurb', 'Turbidez (NTU)', '#0077b6');

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

const modelo_url = "./my_model/"; // Substitua pelo caminho correto do seu modelo
let modelo, webcam, labelContainer, maxPredictions;

async function inicCamera() {
    const caminhoModelo = modelo_url + "model.json";
    const caminhometadata = modelo_url + "metadata.json";
    
    try {
        modelo = await tmImage.load(caminhoModelo, caminhometadata);
        maxPredictions = modelo.getTotalClasses();

        const flip = true; // Inverter a imagem da webcam
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
    } catch (error) {
        console.error("Erro ao inicializar teachable machine:", error);
        alert("Erro ao carregar o modelo de aprendizado de máquina. Verifique a pasta do modelo e tente novamente.");
    }
}

async function loopcamera() {
    webcam.update();
    await preverImagem();
    window.requestAnimationFrame(loopcamera);
}

async function preverImagem() {
    const previsoes = await modelo.predict(webcam.canvas);
    for (let i = 0; i < maxPredictions; i++) {
        const porcentagem = (previsoes[i].probability * 100).toFixed(0);
        const previsaoclasse = `${previsoes[i].className}: ${porcentagem}%`;
        caixalegenda.childNodes[i].innerHTML = previsaoclasse;
    }
}

async function conectarArduino() {
    if (!("serial" in navigator)) {
        alert("API Serial não suportada neste navegador.");
        return;
    }

    try {
        const porta = await navigator.serial.requestPort();
        await porta.open({ baudRate: 9600 });

        const statusConexao = document.getElementById("status-conexao");
        statusConexao.innerText = "Status: Conectado ao Arduino";
        statusConexao.style.color = "green";

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

                        if (dados.temp !== undefined) {
                            document.getElementById("temp").innerText = dados.temp;
                            adicionarDado(graficoTemp, (dados.temp));
                        }
                        if (dados.ph !== undefined) {
                            document.getElementById("ph").innerText = dados.ph;
                            adicionarDado(graficoPh, (dados.ph));
                        }
                        if (dados.tds !== undefined) {
                            document.getElementById("tds").innerText = dados.tds;
                            adicionarDado(graficoTds, (dados.tds));
                        }
                        if (dados.turb !== undefined) {
                            document.getElementById("turb").innerText = dados.turb;
                            adicionarDado(graficoTurb, (dados.turb));
                        }
                    } catch (e) {
                        console.warn("Erro ao analisar JSON:", e);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Erro ao conectar ao Arduino:", error);
        const statusConexao = document.getElementById("status-conexao");
        statusConexao.innerText = "Status: Erro na conexão";
        statusConexao.style.color = "red";
    }
}


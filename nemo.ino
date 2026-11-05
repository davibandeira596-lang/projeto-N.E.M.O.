#include <OneWire.h>
#include <DallasTemperature.h>

// Definição dos Pinos de Hardware
const int PIN_DS18B20 = 2;   // Digital: DS18B20 (Temperatura)
const int PIN_TDS     = A1;  // Analógico: TDS V1.0
const int PIN_PH      = A2;  // Analógico: pH-4502C
const int PIN_TURBID  = A3;  // Analógico: ST100 (Turbidez)

// Configuração do barramento 1-Wire
OneWire oneWire(PIN_DS18B20);
DallasTemperature sensors(&oneWire);

// Controlo de tempo não-bloqueante
unsigned long tempoAnterior = 0;
const long intervaloLeitura = 1000; // Envia a cada 1000ms (1s)

float temperaturaGlobal = 25.0;

// Função auxiliar para amostragem e suavização de sinais analógicos
float lerAnalogicoMedio(int pino, int amostras = 5) {
  long soma = 0;
  for (int i = 0; i < amostras; i++) {
    soma += analogRead(pino);
    delay(2);
  }
  return (float)soma / amostras;
}

void setup() {
  // Exigido pelo script.js do site
  Serial.begin(9600);
  sensors.begin();
  
  pinMode(PIN_TDS, INPUT);
  pinMode(PIN_PH, INPUT);
  pinMode(PIN_TURBID, INPUT);
}

void loop() {
  unsigned long tempoAtual = millis();

  if (tempoAtual - tempoAnterior >= intervaloLeitura) {
    tempoAnterior = tempoAtual;

    // 1. Temperatura
    sensors.requestTemperatures();
    float tempC = sensors.getTempCByIndex(0);
    if (tempC != DEVICE_DISCONNECTED_C && tempC > -40.0 && tempC < 85.0) {
      temperaturaGlobal = tempC;
    }

    // 2. TDS (com filtro e compensação térmica)
    float leituraTDS_raw = lerAnalogicoMedio(PIN_TDS);
    float tensaoTDS = leituraTDS_raw * (5.0 / 1023.0);
    float tensaoCompensadaTDS = tensaoTDS / (1.0 + 0.02 * (temperaturaGlobal - 25.0));
    float valorTDS = (133.42 * pow(tensaoCompensadaTDS, 3) - 255.86 * pow(tensaoCompensadaTDS, 2) + 857.39 * tensaoCompensadaTDS) * 0.5;
    if (valorTDS < 0) valorTDS = 0;

    // 3. pH (com amostragem suave)
    float leituraPH_raw = lerAnalogicoMedio(PIN_PH);
    float tensaoPH = leituraPH_raw * (5.0 / 1023.0);
    float valorPH = 7.0 + ((2.5 - tensaoPH) / 0.18);
    if (valorPH < 0) valorPH = 0;
    if (valorPH > 14) valorPH = 14;

    // 4. Turbidez (ST100 em NTU estimado)
    float leituraTurbid_raw = lerAnalogicoMedio(PIN_TURBID);
    float tensaoTurbidez = leituraTurbid_raw * (5.0 / 1023.0);
    float valorNTU = (5.0 - tensaoTurbidez) * 100.0;
    if (valorNTU < 0) valorNTU = 0;

    // --- FORMATAÇÃO DE JSON SEM ALOCAÇÃO DINÂMICA DE MEMÓRIA ---
    char bufferJson[128];
    snprintf(bufferJson, sizeof(bufferJson),
             "{\"temp\":%.1f,\"ph\":%.2f,\"tds\":%.1f,\"turb\":%.1f}",
             temperaturaGlobal, valorPH, valorTDS, valorNTU);

    Serial.println(bufferJson);
  }
}
# VólticvS ⚡ — Asesor Energético con IA

Proyecto final del desafío **Alura Agente** (Oracle ONE G-9). Un agente conversacional
que actúa como asesor energético: pregunta sobre los artefactos e iluminación del hogar,
estima el consumo eléctrico mensual y calcula cuánto se puede ahorrar en pesos chilenos (CLP)
aplicando buenas prácticas simples (desconectar cargadores en standby, cambiar a LED,
hervir solo el agua necesaria, etc.).

## Arquitectura (v2 — interfaz web)

El proyecto evolucionó de un chat de texto libre a un **formulario web estructurado**.
Esto tiene una ventaja clave: como los datos vienen de checkboxes/inputs y no de texto
libre, ya no depende de que el modelo "adivine" correctamente qué artefacto mencionó el
usuario — se eliminan los errores de extracción.

```
Usuario ──> Formulario HTML/CSS/JS  ──POST /api/calcular──>  Flask
                                                                │
                                        Motor de cálculo (Python puro, determinista)
                                                                │
                                        Groq (Llama 3.3) redacta SOLO la narrativa final,
                                        usando los números ya calculados (nunca los inventa)
                                                                │
                                        JSON de vuelta ──> JS anima el medidor y la tabla
```

- `app.py`: servidor Flask, expone `/` (formulario) y `/api/calcular` (cálculo + narrativa).
- `templates/index.html`: formulario con checklist de artefactos, iluminación, CCTV,
  hervidor, y una sección para agregar artefactos personalizados (para casos como un
  taller de mueblista, un estudio de arquitectura, o una consulta médica en casa).
- `static/css/style.css`: identidad visual "medidor eléctrico" (fondo azul-tinta,
  acento amarillo-voltaje, números en fuente monoespaciada tipo display digital).
- `static/js/app.js`: arma el payload desde el formulario, llama al backend, y anima
  el medidor de kWh.
- `src/calculos.py`, `src/tools.py`, `src/agente.py`: el motor de cálculo se mantiene
  igual; `agente.py` queda como una versión CLI alternativa (chat de texto libre), útil
  para pruebas rápidas pero no es la interfaz principal del proyecto.

### Cómo ejecutar la versión web

```bash
python app.py
```
Luego abre `http://127.0.0.1:5000` en el navegador.

## Arquitectura (v1 — chat de texto libre, versión previa)

El proyecto separa deliberadamente el **cálculo** de la **conversación**:

```
Usuario ──> Agente LLM (Groq / Llama 3.3)  ──tool calling──>  Motor de cálculo (Python puro)
              │                                                        │
              └── redacta la respuesta en lenguaje natural ◄───────────┘
                       usando los números YA calculados
```

- `data/consumo_referencia.json`: tabla de referencia de consumo (Watts) de artefactos
  comunes, iluminación incandescente vs. LED, y parámetros físicos para el cálculo de
  agua caliente.
- `src/calculos.py`: funciones deterministas (sin IA) que hacen toda la matemática:
  consumo mensual, ahorro por standby, ahorro LED, ahorro por hervir solo lo necesario,
  y conversión kWh → CLP.
- `src/tools.py`: expone esas funciones como *tools* de LangChain para que el modelo
  las pueda invocar.
- `src/agente.py`: el agente conversacional (persona "VólticvS"), con el bucle de
  tool-calling y el prompt de sistema.

**Por qué el LLM no calcula los números directamente:** los modelos de lenguaje no son
confiables para aritmética exacta. Todo el consumo y ahorro se calcula con funciones de
Python; el modelo solo extrae variables de la conversación, llama a las herramientas, y
redacta la respuesta final con los resultados reales.

## Ejemplos de preguntas y respuestas

**Usuario:** "Tengo 4 cargadores de celular enchufados todo el día pero solo cargo el
teléfono 2 horas."
**VólticvS:** calcula el consumo en standby de los 4 cargadores vs. desconectarlos, y
entrega el ahorro mensual en kWh y CLP.

**Usuario:** "Tengo 6 ampolletas incandescentes encendidas como 5 horas al día."
**VólticvS:** compara el consumo incandescente vs. LED equivalente y entrega el ahorro
mensual y anual en CLP.

**Usuario:** "Siempre lleno el hervidor completo (1.7 litros) pero solo tomo una taza
de té, unas 3 veces al día."
**VólticvS:** calcula la energía desperdiciada en calentar agua de más y el ahorro anual
de hervir solo lo necesario.

## Alcance actual vs. roadmap (mirada de producto)

**Lo que funciona hoy (verificado):**
- Cálculo determinista de consumo/ahorro por artefacto, con separación explícita entre
  consumo activo y consumo fantasma/standby (configurable por ítem).
- Selector de país con tarifa referencial de partida (solo Chile tiene un valor
  precargado; el resto son placeholders a completar).
- Comparador de categorías de productos (arquitectura lista, catálogo de EJEMPLO).

**Decisiones de alcance deliberadas (y por qué):**
- **Tarifas eléctricas oficiales en tiempo real** (ej. scrapear cne.cl): no implementado.
  Requeriría un scraper específico por país/distribuidora, frágil ante cambios de HTML,
  y para varios países no existe una API pública estandarizada. Se optó por un valor
  referencial + que el usuario ingrese el de su boleta real, que es más confiable que
  un scraper roto en producción.
- **Comparador de productos con precios reales** (ej. aspiradoras/aires acondicionados
  de retailers reales): no implementado con datos reales. Requiere una API de shopping
  (de pago, o scraping con riesgo legal/técnico) para no inventar marcas, modelos o
  precios. Se dejó la arquitectura y un catálogo de ejemplo claramente marcado como tal,
  para conectar una fuente real más adelante.
- Ambas decisiones priorizan **no mostrar información falsa presentada como real**
  sobre completar la función a toda costa — importante para la credibilidad del agente.

1. Clonar el repositorio e instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```
2. Copiar `.env.example` a `.env` y agregar tu API key gratuita de
   [Groq](https://console.groq.com/keys):
   ```bash
   cp .env.example .env
   ```
3. Ejecutar el agente:
   ```bash
   python -m src.agente
   ```

## Deploy en OCI

*(pendiente — se agregará el enlace o captura de pantalla de la aplicación corriendo en
Oracle Cloud una vez completado el deploy)*

## Estado del proyecto

- [x] Motor de cálculo determinístico
- [x] Agente conversacional local (Groq + LangChain)
- [ ] Módulo de análisis de compra de equipos (ej. aires acondicionados) — fuera del MVP actual
- [ ] Deploy en OCI Compute

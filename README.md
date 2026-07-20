#    ⚡⚡ VólticvS ⚡⚡ 
#  Asesor Energético con IA

Proyecto final del desafío **Alura Agente** (Oracle ONE G-9). Un agente conversacional
que actúa como asesor energético: pregunta sobre los artefactos e iluminación del hogar,
estima el consumo eléctrico mensual y calcula cuánto se puede ahorrar en pesos chilenos (CLP)
aplicando buenas prácticas simples (desconectar cargadores en standby, cambiar a LED,
hervir solo el agua necesaria, etc.).

## 🌐 Aplicación en línea (OCI)

**URL pública:** http://146.181.37.129:5000

Desplegado en una instancia **Oracle Cloud Infrastructure Compute** (VM.Standard.E2.1.Micro,
Always Free, Ubuntu 24.04, región `sa-santiago-1`), corriendo como servicio `systemd`
(`asesor-energetico.service`) — persiste aunque se cierre la sesión SSH y se reinicia
automáticamente si el proceso llega a fallar.

*(Agregar aquí una captura de pantalla de la aplicación funcionando, ej. `docs/screenshot.png`)*

## Arquitectura (v2 — interfaz web, versión actual en producción)

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

- `app.py`: servidor Flask, expone `/` (formulario), `/api/calcular`, `/api/paises` y
  `/api/comparar` (calculo + narrativa).
- `templates/index.html`: formulario con selector de país, checklist de artefactos,
  iluminación (LED, incandescente, fluorescente, CFL, halógena, neón), CCTV, hervidor, y
  una sección para agregar artefactos personalizados (mueblista, arquitecto, consulta médica, etc.).
- `static/css/style.css`: identidad visual "medidor eléctrico" (fondo azul-tinta,
  acento amarillo-voltaje, números en fuente monoespaciada tipo display digital).
- `static/js/app.js`: arma el payload desde el formulario, llama al backend, y anima
  el medidor de kWh.
- `src/calculos.py`: motor de cálculo determinista — consumo activo vs. standby/fantasma
  (configurable por ítem), frecuencia semanal de uso (para lavadora/secadora/etc., no
  asume uso diario), comparador de categorías de productos, y tarifas por país.
- `src/tools.py`, `src/agente.py`: versión CLI alternativa (chat de texto libre,
  LangChain + tool calling), útil para pruebas rápidas pero no es la interfaz principal.

**Por qué el LLM no calcula los números directamente:** los modelos de lenguaje no son
confiables para aritmética exacta. Todo el consumo y ahorro se calcula con funciones de
Python; el modelo solo redacta la respuesta final con los resultados ya calculados.

## Ejemplos de uso

- Marcas "Cargador de celular", indicas 1 hora de carga activa al día, y decides si
  queda enchufado el resto del día (consumo fantasma) o no → VólticvS calcula el
  consumo real y el ahorro de desconectarlo cuando no lo usas.
- Marcas "Lavadora de ropa" con 3 veces por semana (no todos los días) → el cálculo ya
  no infla el consumo asumiendo uso diario.
- Marcas varios tipos de iluminación a la vez (LED + tubos fluorescentes, por ejemplo)
  y ves el ahorro potencial de migrar todo a LED.
- Seleccionas tu país → se ajusta la moneda y una tarifa referencial de partida (siempre
  puedes corregirla con el valor real de tu boleta).

## Cómo ejecutarlo localmente

1. Clonar el repositorio e instalar dependencias:
   ```bash
   python -m venv venv
   source venv/bin/activate  # En Windows: venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
2. Copiar `.env.example` a `.env` y agregar tu API key gratuita de
   [Groq](https://console.groq.com/keys):
   ```bash
   cp .env.example .env
   ```
3. Ejecutar la versión web (interfaz principal):
   ```bash
   python app.py
   ```
   Luego abre `http://127.0.0.1:5000` en el navegador.

4. (Opcional) Ejecutar la versión CLI de chat libre:
   ```bash
   python -m src.agente
   ```

## Alcance actual vs. roadmap (mirada de producto)

**Lo que funciona hoy (verificado, en producción):**
- Cálculo determinista de consumo/ahorro por artefacto, con separación explícita entre
  consumo activo y consumo fantasma/standby, y frecuencia de uso semanal configurable.
- Selector de país con tarifa referencial de partida (solo Chile tiene un valor
  precargado; el resto son placeholders a completar).
- Comparador de categorías de productos (arquitectura lista, catálogo de EJEMPLO).
- Deploy público 24/7 en OCI Compute, corriendo como servicio systemd.

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

## Estado del proyecto

- [x] Motor de cálculo determinístico (consumo activo/standby, frecuencia semanal)
- [x] Interfaz web (Flask + HTML/CSS/JS) con checklist estructurado
- [x] Agente conversacional CLI alternativo (Groq + LangChain)
- [x] Deploy en OCI Compute (Always Free, systemd, acceso público 24/7)
- [ ] Módulo de análisis de compra de equipos con datos reales — fuera del MVP actual
- [ ] Tarifas eléctricas oficiales en tiempo real por país — fuera del MVP actual
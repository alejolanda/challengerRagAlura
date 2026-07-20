import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from src import calculos

load_dotenv()

app = Flask(__name__)

SYSTEM_PROMPT_NARRADOR = """Eres "VólticvS", un asesor energético con buen humor de Chile.
Ya se calcularon con exactitud el consumo y el ahorro potencial del hogar del usuario;
tu única tarea es redactar un resumen breve (4 a 6 frases) explicando los resultados de
forma cálida, clara y con un toque de humor.

REGLA ABSOLUTA: no inventes ni cambies ningún número. Usa EXACTAMENTE los valores en
kWh y CLP que te entrego. Si necesitas redondear, usa el mismo valor que te dieron.
Destaca cuál es la mayor oportunidad de ahorro y da 5 - 7 recomendaciones concretas.
No repitas toda la lista de artefactos, enfócate en lo más relevante.

Debes realizar una proyeccion en el tiempo ademas a los 3 meses, 6 meses, 12 meses, a los 2 años y 5 años.
"""


def generar_narrativa(resumen: dict) -> str:
    try:
        llm = ChatGroq(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            temperature=0.5,
            api_key=os.getenv("GROQ_API_KEY"),
        )
        mensaje = f"Estos son los resultados calculados para este hogar: {resumen}"
        respuesta = llm.invoke([SystemMessage(content=SYSTEM_PROMPT_NARRADOR), HumanMessage(content=mensaje)])
        return respuesta.content
    except Exception:
        # Si no hay API key configurada o falla la llamada, igual entregamos
        # un resumen útil basado 100% en los números ya calculados.
        return (
            f"Tu consumo estimado es de {resumen['total_kwh_mes']} kWh al mes "
            f"(~${resumen['total_clp_mes']:,.0f} CLP). Podrías ahorrar hasta "
            f"${resumen['ahorro_potencial_clp_mes']:,.0f} CLP al mes aplicando los cambios sugeridos."
        )


def generar_recomendaciones(desglose: list) -> list:
    """
    Convierte el desglose numérico en frases de recomendación concretas,
    cada una con el ahorro mensual y anual ya calculado (determinista, sin IA).
    Ordenadas de mayor a menor impacto de ahorro.
    """
    candidatas = []
    for item in desglose:
        ahorro_mes = item.get("ahorro_clp_mes", 0)
        if not ahorro_mes or ahorro_mes <= 0:
            continue
        ahorro_anio = round(ahorro_mes * 12)
        nombre = item["nombre"]

        if "kwh_mes_si_fuera_led" in item:
            frase = f"Cambia tu {nombre.lower()} a LED"
        elif "kwh_mes_llenado_habitual" in item:
            frase = "Hierve solo el agua que necesitas en vez de llenar el hervidor completo"
        elif "kwh_mes_optimo" in item:
            frase = f"Desconecta {nombre.lower()} cuando no lo estés usando"
        else:
            frase = f"Optimiza el uso de {nombre.lower()}"

        texto = f"{frase}: ahorras ${ahorro_mes:,.0f}/mes (${ahorro_anio:,.0f} al año)."
        candidatas.append((ahorro_mes, texto))

    candidatas.sort(key=lambda par: par[0], reverse=True)
    return [texto for _, texto in candidatas]


@app.route("/api/paises")
def paises():
    datos = {k: v for k, v in calculos.REFERENCIA["paises"].items() if not k.startswith("_")}
    return jsonify(datos)


@app.route("/api/comparar", methods=["POST"])
def comparar():
    datos = request.get_json(force=True)
    try:
        resultado = calculos.comparar_categoria(
            datos["categoria"], float(datos["horas_uso_diario"]), float(datos.get("tarifa_clp_kwh", 230))
        )
        return jsonify(resultado)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/calcular", methods=["POST"])
def calcular():
    datos = request.get_json(force=True)
    tarifa = float(datos.get("tarifa_clp_kwh", 150))

    desglose = []
    total_kwh_mes = 0.0
    ahorro_potencial_clp_mes = 0.0

    # Electrodomésticos de la tabla de referencia
    for item in datos.get("electrodomesticos", []):
        try:
            resultado = calculos.consumo_mensual_standby(
                item["clave"],
                float(item["horas"]),
                int(item.get("cantidad", 1)),
                queda_conectado=bool(item.get("queda_conectado", True)),
                veces_semana=float(item.get("veces_semana", 7)),
            )
            resultado["tarifa_aplicada"] = tarifa
            desglose.append(resultado)
            total_kwh_mes += resultado["kwh_mes_actual"]
            ahorro_potencial_clp_mes += resultado.get("ahorro_clp_mes", 0)
        except ValueError:
            continue  # clave desconocida, se ignora en vez de romper el cálculo

    # Iluminación (puede haber varios tipos a la vez: LED + fluorescente, etc.)
    for item in datos.get("iluminacion", []):
        try:
            resultado = calculos.consumo_iluminacion(item["tipo"], int(item["cantidad"]), float(item["horas"]))
            desglose.append(resultado)
            total_kwh_mes += resultado["kwh_mes_actual"]
            ahorro_potencial_clp_mes += resultado.get("ahorro_clp_mes", 0)
        except (ValueError, KeyError):
            continue

    # Hervidor de agua
    hervidor = datos.get("hervidor")
    if hervidor and hervidor.get("tiene"):
        resultado = calculos.ahorro_hervidor(
            float(hervidor["litros_habitual"]), float(hervidor["litros_necesario"]), int(hervidor.get("usos_dia", 1))
        )
        resultado["nombre"] = "Hervidor de agua"
        desglose.append(resultado)
        total_kwh_mes += resultado["kwh_mes_llenado_habitual"]
        ahorro_potencial_clp_mes += resultado.get("ahorro_clp_mes", 0)

    # Artefactos personalizados (mueblista, arquitecto, médico, etc.)
    for item in datos.get("personalizados", []):
        resultado = calculos.consumo_personalizado(
            item.get("nombre", "Artefacto personalizado"),
            float(item["watts"]),
            float(item["horas"]),
            cantidad=int(item.get("cantidad", 1)),
        )
        desglose.append(resultado)
        total_kwh_mes += resultado["kwh_mes_actual"]

    total_clp_mes = calculos.kwh_a_clp(total_kwh_mes, tarifa)

    resumen = {
        "total_kwh_mes": round(total_kwh_mes, 2),
        "total_clp_mes": round(total_clp_mes, 0),
        "ahorro_potencial_clp_mes": round(ahorro_potencial_clp_mes, 0),
        "desglose": desglose,
        "recomendaciones": generar_recomendaciones(desglose),
        "proyeccion": {
            "ahorro_1_mes": round(ahorro_potencial_clp_mes, 0),
            "ahorro_6_meses": round(ahorro_potencial_clp_mes * 6, 0),
            "ahorro_1_anio": round(ahorro_potencial_clp_mes * 12, 0),
            "ahorro_5_anios": round(ahorro_potencial_clp_mes * 60, 0),
        },
    }

    resumen["narrativa"] = generar_narrativa(resumen)
    return jsonify(resumen)


if __name__ == "__main__":
    puerto = int(os.getenv("PORT", 5000))
    modo_debug = os.getenv("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=puerto, debug=modo_debug)
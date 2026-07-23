"""
Extracción best-effort de datos desde una boleta eléctrica en PDF.

IMPORTANTE: esto es una heurística basada en expresiones regulares sobre el
texto de la boleta, no una lectura oficial/verificada. El resultado se
presenta al usuario como una DETECCIÓN que debe confirmar, nunca se aplica
automáticamente sin su acción explícita.
"""
import re

import pdfplumber


def extraer_texto_pdf(archivo) -> str:
    """Extrae todo el texto de un PDF a partir de un stream de archivo."""
    texto_completo = []
    with pdfplumber.open(archivo) as pdf:
        for pagina in pdf.pages:
            texto = pagina.extract_text()
            if texto:
                texto_completo.append(texto)
    return "\n".join(texto_completo)


def _parsear_numero_clp(texto_numero: str) -> float:
    """Convierte '45.230' o '45,230' (formato chileno de miles) a float."""
    limpio = texto_numero.strip().replace(".", "").replace(",", ".")
    # Si quedó más de un punto decimal (caso raro), nos quedamos con el último
    partes = limpio.split(".")
    if len(partes) > 2:
        limpio = "".join(partes[:-1]) + "." + partes[-1]
    return float(limpio)


def extraer_datos_boleta(texto: str) -> dict:
    """
    Busca en el texto de la boleta:
    - consumo en kWh
    - monto total a pagar (CLP)
    Y calcula la tarifa efectiva (CLP/kWh) si ambos se encuentran.
    Cualquiera de los dos puede no encontrarse: se devuelve None en ese caso.
    """
    texto_norm = texto.replace("\xa0", " ")

    patrones_kwh = [
        r"consumo[^\d]{0,40}?(\d{1,5}(?:[.,]\d+)?)\s*kwh",
        r"(\d{1,5}(?:[.,]\d+)?)\s*kwh",
    ]
    kwh_detectado = None
    for patron in patrones_kwh:
        coincidencia = re.search(patron, texto_norm, re.IGNORECASE)
        if coincidencia:
            try:
                kwh_detectado = float(coincidencia.group(1).replace(".", "").replace(",", "."))
                break
            except ValueError:
                continue

    patrones_monto = [
        r"total\s+a\s+pagar[^\d]{0,15}\$?\s*([\d.,]+)",
        r"monto\s+total[^\d]{0,15}\$?\s*([\d.,]+)",
        r"total\s+facturado[^\d]{0,15}\$?\s*([\d.,]+)",
    ]
    monto_detectado = None
    for patron in patrones_monto:
        coincidencia = re.search(patron, texto_norm, re.IGNORECASE)
        if coincidencia:
            try:
                monto_detectado = _parsear_numero_clp(coincidencia.group(1))
                break
            except ValueError:
                continue

    tarifa_calculada = None
    if kwh_detectado and monto_detectado and kwh_detectado > 0:
        tarifa_calculada = round(monto_detectado / kwh_detectado, 1)

    return {
        "kwh_detectado": kwh_detectado,
        "monto_total_detectado": monto_detectado,
        "tarifa_calculada": tarifa_calculada,
        "es_deteccion_automatica": True,
    }

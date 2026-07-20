const formulario = document.getElementById("formularioEnergia");
const resultadosSeccion = document.getElementById("resultados");
const meterValue = document.getElementById("meterValue");

// Agregar "veces por semana" a TODOS los artefactos con horas de uso que no lo tengan ya
document.querySelectorAll(".item.item--con-horas").forEach((item) => {
  const campos = item.querySelector(".item__fields");
  if (campos && !item.querySelector(".veces-semana")) {
    const etiqueta = document.createElement("label");
    etiqueta.innerHTML = 'Veces por semana <input type="number" min="1" max="7" value="7" class="veces-semana">';
    campos.appendChild(etiqueta);
  }
});

// Cargar países desde el backend
async function cargarPaises() {
  const selectPais = document.getElementById("selectPais");
  try {
    const respuesta = await fetch("/api/paises");
    const paises = await respuesta.json();
    selectPais.innerHTML = "";
    Object.entries(paises).forEach(([codigo, datos]) => {
      const opcion = document.createElement("option");
      opcion.value = codigo;
      opcion.textContent = `${datos.nombre} (${datos.moneda})`;
      selectPais.appendChild(opcion);
    });
    selectPais.value = "CL";
    actualizarTarifaPorPais(paises, "CL");
    selectPais.addEventListener("change", () => actualizarTarifaPorPais(paises, selectPais.value));
  } catch (error) {
    selectPais.innerHTML = '<option value="">No se pudo cargar la lista de países</option>';
  }
}

function actualizarTarifaPorPais(paises, codigo) {
  const datos = paises[codigo];
  const campoTarifa = document.getElementById("tarifaClp");
  const fuenteTexto = document.getElementById("fuenteTarifa");
  if (datos.tarifa_kwh_referencial) {
    campoTarifa.value = datos.tarifa_kwh_referencial;
  }
  fuenteTexto.textContent = `Fuente de referencia: ${datos.fuente}. Verifica el valor vigente ahí o usa el de tu boleta.`;
}
cargarPaises();

// Habilitar/deshabilitar campos según checkbox marcado (electrodomésticos e iluminación)
document.querySelectorAll(".item").forEach((item) => {
  const check = item.querySelector(".chk-artefacto, .chk-iluminacion");
  if (!check) return;
  check.addEventListener("change", () => {
    item.classList.toggle("activo", check.checked);
  });
});

// Mostrar/ocultar bloques condicionales según radio buttons (CCTV, hervidor)
function toggleCondicional(nombreRadio, valorQueMuestra, contenedorId) {
  const contenedor = document.getElementById(contenedorId);
  document.querySelectorAll(`input[name="${nombreRadio}"]`).forEach((radio) => {
    radio.addEventListener("change", () => {
      contenedor.hidden = radio.value !== valorQueMuestra || !radio.checked;
    });
  });
}
toggleCondicional("cctv", "si", "camposCctv");
toggleCondicional("hervidor", "si", "camposHervidor");

// Artefactos personalizados dinámicos
const listaPersonalizados = document.getElementById("listaPersonalizados");
const templatePersonalizado = document.getElementById("templatePersonalizado");

document.getElementById("btnAgregarPersonalizado").addEventListener("click", () => {
  const nodo = templatePersonalizado.content.cloneNode(true);
  const fila = nodo.querySelector(".personalizado");
  fila.querySelector(".btn--eliminar").addEventListener("click", () => fila.remove());
  listaPersonalizados.appendChild(nodo);
});

// Animación del medidor: cuenta desde el valor actual hasta el nuevo total
function animarMedidor(valorFinal) {
  const valorInicial = parseFloat(meterValue.textContent) || 0;
  const duracionMs = 700;
  const inicio = performance.now();

  function paso(ahora) {
    const progreso = Math.min((ahora - inicio) / duracionMs, 1);
    const valorActual = valorInicial + (valorFinal - valorInicial) * progreso;
    meterValue.textContent = valorActual.toFixed(1);
    if (progreso < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

function recolectarElectrodomesticos() {
  const items = [];
  document.querySelectorAll(".item[data-clave]").forEach((item) => {
    const check = item.querySelector(".chk-artefacto");
    if (!check.checked) return;
    const quedaConectadoInput = item.querySelector(".queda-conectado");
    const vecesSemanaInput = item.querySelector(".veces-semana");
    items.push({
      clave: item.dataset.clave,
      cantidad: parseFloat(item.querySelector(".cantidad").value) || 0,
      horas: parseFloat(item.querySelector(".horas").value) || 0,
      queda_conectado: quedaConectadoInput ? quedaConectadoInput.checked : true,
      veces_semana: vecesSemanaInput ? parseFloat(vecesSemanaInput.value) || 7 : 7,
    });
  });
  return items;
}

function recolectarIluminacion() {
  const items = [];
  document.querySelectorAll(".item[data-tipo]").forEach((item) => {
    const check = item.querySelector(".chk-iluminacion");
    if (!check.checked) return;
    items.push({
      tipo: item.dataset.tipo,
      cantidad: parseFloat(item.querySelector(".cantidad").value) || 0,
      horas: parseFloat(item.querySelector(".horas").value) || 0,
    });
  });
  return items;
}

function recolectarPersonalizados() {
  const items = [];
  listaPersonalizados.querySelectorAll(".personalizado").forEach((fila) => {
    const nombre = fila.querySelector(".p-nombre").value.trim();
    const watts = parseFloat(fila.querySelector(".p-watts").value);
    if (!nombre || !watts) return;
    items.push({
      nombre,
      watts,
      horas: parseFloat(fila.querySelector(".p-horas").value) || 0,
      cantidad: parseFloat(fila.querySelector(".p-cantidad").value) || 1,
    });
  });
  return items;
}

formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const payload = {
    electrodomesticos: recolectarElectrodomesticos(),
    iluminacion: recolectarIluminacion(),
    cctv: null,
    hervidor: null,
    personalizados: recolectarPersonalizados(),
    tarifa_clp_kwh: parseFloat(document.getElementById("tarifaClp").value) || 150,
  };

  if (document.querySelector('input[name="cctv"]:checked').value === "si") {
    const cantidadCamaras = parseFloat(document.getElementById("cantidadCamaras").value) || 0;
    payload.electrodomesticos.push({ clave: "camara_seguridad", cantidad: cantidadCamaras, horas: 24 });
    if (document.getElementById("tieneDvr").checked) {
      payload.electrodomesticos.push({ clave: "dvr_nvr", cantidad: 1, horas: 24 });
    }
  }

  if (document.querySelector('input[name="hervidor"]:checked').value === "si") {
    payload.hervidor = {
      tiene: true,
      litros_habitual: parseFloat(document.getElementById("litrosHabitual").value) || 0,
      litros_necesario: parseFloat(document.getElementById("litrosNecesario").value) || 0,
      usos_dia: parseFloat(document.getElementById("usosDia").value) || 0,
    };
  }

  const botonSubmit = formulario.querySelector(".btn--primary");
  botonSubmit.disabled = true;
  botonSubmit.textContent = "Calculando…";

  try {
    const respuesta = await fetch("/api/calcular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const resultado = await respuesta.json();
    mostrarResultados(resultado);
  } catch (error) {
    alert("Ocurrió un problema al calcular. Revisa que el servidor Flask esté corriendo.");
    console.error(error);
  } finally {
    botonSubmit.disabled = false;
    botonSubmit.textContent = "Calcular mi consumo y ahorro";
  }
});

// Comparador de categorías (ej. aspiradoras)
document.querySelectorAll(".btn--comparar").forEach((boton) => {
  boton.addEventListener("click", async () => {
    const item = boton.closest(".item");
    const horas = parseFloat(item.querySelector(".horas").value) || 0.1;
    const tarifa = parseFloat(document.getElementById("tarifaClp").value) || 150;
    const contenedor = item.querySelector(".comparador-resultado");

    boton.textContent = "Comparando…";
    try {
      const respuesta = await fetch("/api/comparar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria: boton.dataset.categoria, horas_uso_diario: horas, tarifa_clp_kwh: tarifa }),
      });
      const resultado = await respuesta.json();
      if (resultado.error) {
        contenedor.innerHTML = `<p class="aviso">${resultado.error}</p>`;
      } else {
        const filas = resultado.opciones
          .map((op) => `<tr><td>${op.nombre}</td><td>${op.watts}W</td><td>${op.kwh_mes} kWh/mes</td><td>$${op.clp_mes.toLocaleString("es-CL")}/mes</td></tr>`)
          .join("");
        contenedor.innerHTML = `
          <table>
            <thead><tr><th>Opción</th><th>Potencia</th><th>Consumo</th><th>Costo</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
          <p class="aviso">⚠️ Catálogo de ejemplo — reemplazar por datos reales de retailers antes de usar como recomendación real.</p>`;
      }
      contenedor.hidden = false;
    } catch (error) {
      contenedor.innerHTML = '<p class="aviso">No se pudo comparar en este momento.</p>';
      contenedor.hidden = false;
    } finally {
      boton.textContent = "Ver alternativas más eficientes";
    }
  });
});

// Nuevo cálculo / nueva persona
document.getElementById("btnNuevoCalculo").addEventListener("click", () => {
  formulario.reset();
  document.querySelectorAll(".item.activo").forEach((item) => item.classList.remove("activo"));
  listaPersonalizados.innerHTML = "";
  resultadosSeccion.hidden = true;
  meterValue.textContent = "000.0";
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function mostrarResultados(resultado) {
  resultadosSeccion.hidden = false;
  document.getElementById("narrativa").textContent = resultado.narrativa;
  document.getElementById("totalKwh").textContent = `${resultado.total_kwh_mes} kWh`;
  document.getElementById("totalClp").textContent = `$${resultado.total_clp_mes.toLocaleString("es-CL")}`;
  document.getElementById("ahorroClp").textContent = `$${resultado.ahorro_potencial_clp_mes.toLocaleString("es-CL")}`;

  // Recomendaciones en frases
  const listaRecomendaciones = document.getElementById("listaRecomendaciones");
  listaRecomendaciones.innerHTML = "";
  if (resultado.recomendaciones && resultado.recomendaciones.length > 0) {
    resultado.recomendaciones.forEach((frase) => {
      const li = document.createElement("li");
      li.textContent = frase;
      listaRecomendaciones.appendChild(li);
    });
  } else {
    const li = document.createElement("li");
    li.textContent = "No encontramos oportunidades de ahorro adicionales con lo que marcaste — ¡ya vas bien!";
    listaRecomendaciones.appendChild(li);
  }

  // Proyección en el tiempo
  if (resultado.proyeccion) {
    document.getElementById("proy1Mes").textContent = `$${resultado.proyeccion.ahorro_1_mes.toLocaleString("es-CL")}`;
    document.getElementById("proy6Meses").textContent = `$${resultado.proyeccion.ahorro_6_meses.toLocaleString("es-CL")}`;
    document.getElementById("proy1Anio").textContent = `$${resultado.proyeccion.ahorro_1_anio.toLocaleString("es-CL")}`;
    document.getElementById("proy5Anios").textContent = `$${resultado.proyeccion.ahorro_5_anios.toLocaleString("es-CL")}`;
  }

  const cuerpo = document.getElementById("desgloseBody");
  cuerpo.innerHTML = "";
  resultado.desglose.forEach((item) => {
    const fila = document.createElement("tr");
    const kwh = item.kwh_mes_actual ?? item.kwh_mes_llenado_habitual ?? "—";
    const ahorro = item.ahorro_clp_mes ?? 0;
    fila.innerHTML = `<td>${item.nombre}</td><td>${kwh}</td><td>${ahorro ? "$" + ahorro.toLocaleString("es-CL") : "—"}</td>`;
    cuerpo.appendChild(fila);
  });

  animarMedidor(resultado.total_kwh_mes);
  resultadosSeccion.scrollIntoView({ behavior: "smooth" });
}

document.getElementById("btnImprimir").addEventListener("click", () => {
  window.print();
});
# Manual de usuario: Probador de colorimetría personal

Esta aplicación te ayuda a descubrir qué colores de ropa te favorecen. Simula lo que hace una asesora de imagen: colocar telas de distintos colores bajo tu rostro y comparar cuáles te sientan mejor.

Es una guía orientativa, no un diagnóstico. El resultado sale de tus propias observaciones.

## 1. Abrir la aplicación

La aplicación es una página web: no hay nada que instalar ni ningún servidor. Ábrela en el navegador con la dirección donde esté publicada (por ejemplo, la de GitHub Pages). Funciona igual en el ordenador y en el teléfono.

Para probarla en tu propio equipo sin publicarla, abre una terminal en la carpeta del proyecto y ejecuta:

```bash
npm start
```

Deja esa ventana abierta y entra en **http://127.0.0.1:3000**. Para apagarla, pulsa `Ctrl + C`.

## 2. Antes de empezar

Para que la prueba sea fiable:

- Ponte frente a una ventana con luz de día indirecta. Evita focos amarillos o luces de colores.
- Sin maquillaje, sin filtros y con el cabello tal como lo llevas normalmente.
- Usa siempre la misma luz y la misma distancia durante toda la sesión.

## 3. Crear una sesión

En la pantalla inicial escribe un **Nombre de la sesión** (por ejemplo, "Prueba con luz de mañana"), añade notas si quieres y pulsa **Crear sesión**.

Todo lo que hagas queda guardado en esa sesión, dentro de este navegador. En **Sesiones anteriores** puedes volver a abrirla, renombrarla o borrarla.

## 4. Poner tu rostro

En **1. Tu imagen: cámara o foto** tienes tres opciones:

| Botón | Qué hace |
|---|---|
| **Activar cámara** | Te ves en vivo, como en un espejo. |
| **Tomar foto** | Congela la imagen de la cámara para trabajar con calma. |
| **Subir foto** | Usa una foto que ya tengas guardada. |

Recomendación: usa una foto fija, de frente y con buena luz. Así comparas todos los colores sobre la misma imagen.

Tu foto se guarda solo en este navegador y en este dispositivo. No se envía a ningún servidor.

## 5. Analizar mi rostro (opcional)

Con una foto puesta, pulsa **Analizar mi rostro** y marca tres puntos sobre la imagen:

1. **Piel**: en la mejilla o la frente, donde no haya sombra ni brillo.
2. **Cabello**.
3. **Ojos**: sobre el iris.

Puedes repetir cualquier punto u **Omitir este paso** en cabello y ojos. Al pulsar **Confirmar y estimar**, la aplicación calcula una **Estimación automática**: si tus colores tienden a cálidos o fríos, claros u oscuros, y las tres estaciones más probables.

Tómalo como una pista para saber por qué colores empezar. La cámara altera los colores según la luz, así que esta estimación es menos fiable que tus propias valoraciones.

## 6. Probar colores

En **2. Elige un color para probar** toca cualquier color: aparece como una tela debajo de tu rostro.

- **Ajustar la tela a mis hombros automáticamente**: activado de entrada. La aplicación localiza tus hombros y tu cuello y coloca la tela sola; con la cámara en vivo te sigue si te mueves. Necesita conexión a internet la primera vez, para descargar el detector; tu imagen se analiza en tu dispositivo y no se envía. Si no te encuentra (muy cerca, de perfil o con poca luz), usa los dos controles siguientes.
- **Altura de la tela**: sube o baja la tela hasta que quede justo bajo la barbilla.
- **Ancho del cuello**: abre o cierra el escote hasta que coincida con tu cuello y la tela caiga sobre tus hombros.
- **Comparar dos colores lado a lado**: marca esta casilla para ver un color en cada mitad y decidir entre ambos.
- **Filtros** (Subtono, Profundidad, Estación): reducen la lista. Si hiciste el análisis del rostro, puedes ver solo los colores sugeridos.
- **Capturar con tela (PNG)**: descarga una imagen de tu rostro con el color puesto.

## 7. Evaluar cada color

En **3. Evalúa cómo te queda**, mira tu rostro (no la tela) y responde cuatro preguntas:

- ¿La piel se ve más uniforme?
- ¿Resalta mis ojos?
- ¿Reduce sombras o rojeces?
- ¿Armoniza con mis rasgos?

Cada una se responde con **Nada, Poco, Algo, Mucho** o **No sé**. "No sé" no resta puntos: simplemente no cuenta.

Pulsa **Guardar y siguiente** para pasar al próximo color. Un color que te favorece hace que la piel se vea pareja y descansada; uno que no, marca ojeras, apaga el rostro o hace que primero se vea la tela y después tú.

No juzgues por si el color te gusta, sino por cómo se ve tu cara con él.

## 8. Mi paleta

A medida que valoras, **Mi paleta** se arma sola:

- **Me favorecen**: colores con puntuación de 60 % o más.
- **Mejor evitar**: colores con menos de 40 %.

Los que quedan en medio no aparecen en ninguna de las dos listas.

## 9. Ver los resultados

En la pestaña **Resultados** encuentras:

- **Estación sugerida**: aparece cuando has valorado al menos **12 colores**. Indica tu estación (por ejemplo, "Otoño Cálido"), una segunda opción y el nivel de confianza.
- **Estimación automática**: la del análisis de tu rostro, y si coincide con tus valoraciones.
- **Colores recomendados y a evitar**.
- **Tus ejes**: cómo te sientan los cálidos frente a los fríos, los claros frente a los oscuros y los suaves frente a los brillantes.
- **Ranking** de todos los colores que valoraste.

Para un resultado más seguro, valora colores de las cuatro familias (primavera, verano, otoño e invierno), no solo los que ya te gustan. Con 24 colores o más la confianza mejora.

Si la estimación automática y tus valoraciones no coinciden, fíate de tus valoraciones.

## 10. Informe

En la pestaña **Informe**:

- **Descargar informe final (PDF)**: una ficha de una página con tu foto, tu estación, tu paleta recomendada, los colores a evitar y consejos de maquillaje, cabello, ropa y metales. Antes de descargarla ves una vista previa. Si aún no has valorado 12 colores, la ficha usa la estimación de tu rostro y lo indica; si tampoco hay estimación, el botón aparece apagado y te dice qué falta.
- **Imprimir o guardar como PDF**: el informe detallado, con la tabla de todas tus puntuaciones. Abre la impresión del navegador; elige "Guardar como PDF" como impresora.
- **Descargar lámina (PNG)**: una sola imagen con tu rostro y cada color recomendado puesto debajo, útil para llevar en el teléfono cuando vayas de compras.

La lámina con tu rostro solo aparece si la sesión tiene una foto.

## 11. Copia de seguridad

Tus sesiones, valoraciones y fotos viven solo en el navegador donde las creaste. En la pantalla inicial, en **Copia de seguridad**:

- **Guardar copia**: descarga un archivo `.json` con todo (las fotos son opcionales). Guárdalo donde quieras.
- **Restaurar copia**: elige ese archivo y sus sesiones se añaden a las que ya tengas. Si restauras la misma copia dos veces, no se duplican.

Sirve también para pasar tus datos del ordenador al teléfono: guarda la copia en uno, envíate el archivo y restáuralo en el otro.

Haz una copia de vez en cuando: si borras los datos de navegación, o el navegador necesita espacio, las sesiones pueden perderse.

## Preguntas frecuentes

**La cámara no se enciende.** Revisa que el navegador tenga permiso para usarla y que ninguna otra aplicación la esté ocupando. Mientras tanto puedes usar **Subir foto**.

**No aparece mi estación.** Necesitas al menos 12 colores valorados. La pantalla te indica cuántos faltan.

**El resultado cambia de una sesión a otra.** Suele deberse a la luz. Repite la prueba con luz de día y compara las sesiones.

**¿Dónde se guardan mis datos?** Todo (sesiones, puntuaciones y foto) se guarda solo en el navegador y el dispositivo donde usas la aplicación. No se envía nada a ningún servidor.

**Cambié de navegador o de dispositivo y no veo mis sesiones.** Es normal: cada navegador guarda lo suyo. Usa **Guardar copia** en el navegador de origen y **Restaurar copia** en el nuevo.

**Tenía sesiones de la versión anterior (la que se encendía con un servidor).** Están exportadas en `data/copia-inicial.json`: restáuralas con **Restaurar copia**.

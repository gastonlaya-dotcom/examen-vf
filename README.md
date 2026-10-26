# Examen V/F

App web estilo Mentimeter para tomar exámenes de **50 preguntas Verdadero/Falso** en clase. Los alumnos entran con el celular escaneando un QR, sin instalar nada ni crear cuentas.

- **Alumno** (`index.html`): se registra con nombre, apellido, curso y DNI o registro → responde de a una pregunta (V, F o sin responder) → **Verificar resultados** (correctas, incorrectas, sin responder, puntaje) → **Corregir respuestas** (hasta 3 veces, navegando libremente por las 50 sin saber cuáles están bien) o **Enviar resultados**.
- **Puntaje**: correcta +1 · incorrecta −1 · sin responder 0.
- **Tiempo por pregunta** (configurable, por defecto 60 segundos): en la primera pasada, si se termina el tiempo sin respuesta, la pregunta queda en blanco y pasa sola a la siguiente. Con el timer activo no se puede volver atrás en esa pasada; el reloj sigue corriendo aunque se recargue la página. Las correcciones no tienen tiempo. 0 = sin límite.
- **Docente** (`admin.html`): carga las preguntas desde Excel, muestra el QR, abre o cierra el ingreso, y consulta el repositorio de exámenes con todas las preguntas, la opción elegida por cada alumno y el puntaje final. Exporta todo a Excel.

## Cómo está armada

| Parte | Dónde vive | Qué hace |
|---|---|---|
| Frontend (este repo) | GitHub Pages | Las pantallas del alumno y del docente. No contiene las respuestas correctas. |
| Backend (`apps-script/Code.gs`) | Una Google Sheet tuya con Apps Script | Guarda preguntas, respuestas correctas, exámenes y calcula el puntaje. Las respuestas correctas **nunca** se mandan al celular del alumno. |

La Google Sheet tiene cuatro hojas: `Config`, `Preguntas`, `Examenes` (una fila por alumno) y `Detalle` (una fila por alumno × pregunta al enviar).

Reglas que controla el servidor (no se pueden saltear desde el navegador):
- Un DNI/registro = un examen. Si alguien intenta entrar con el mismo DNI desde otro celular, queda bloqueado hasta que el docente habilite el reingreso (conserva respuestas y correcciones usadas).
- Máximo de correcciones configurable (por defecto 3). Se envían las respuestas de la última verificación.
- Una vez enviado, el examen no se puede modificar.

## Instalación (una sola vez, ~10 minutos)

### 1. Backend en Google Sheets
1. Creá una Google Sheet nueva (por ejemplo, "Examen VF – Resultados").
2. Menú **Extensiones → Apps Script**. Borrá el contenido de `Código.gs` y pegá todo el archivo [`apps-script/Code.gs`](apps-script/Code.gs). Guardá.
3. Arriba elegí la función **`setup`** y tocá **Ejecutar**. Aceptá los permisos (es tu propia cuenta). Se crean las hojas y se cargan 50 preguntas de ejemplo.
4. En la hoja **Config**, cambiá `admin_password` (por defecto `docente2026`).
5. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
6. Copiá la **URL de la aplicación web** (termina en `/exec`).

> Si más adelante cambiás `Code.gs`, usá **Implementar → Administrar implementaciones → Editar → Versión nueva** para que la URL siga siendo la misma.

### 2. Frontend en GitHub Pages
1. En el repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
2. Pegá la URL `/exec` en [`config.js`](config.js) (`API_URL`). Es opcional: si no la ponés, el panel docente te la pide y la incluye dentro del QR.

### 3. Usarlo en clase
1. Abrí `https://<tu-usuario>.github.io/examen-vf/admin.html` y entrá con la contraseña.
2. **Preguntas**: subí tu Excel (columnas `Pregunta` y `Respuesta` con V/F). Hay una plantilla en [`plantilla/preguntas_ejemplo.xlsx`](plantilla/preguntas_ejemplo.xlsx) y un botón para descargarla.
3. **QR y acceso**: proyectá el QR en pantalla completa.
4. **Resultados**: se actualiza solo. Tocá un alumno para ver su examen completo. Al terminar, exportá a Excel y usá **Archivar** para dejar todo listo para el próximo examen (se guarda una copia con fecha dentro de la Sheet).

## Notas
- Las 50 preguntas de ejemplo son públicas en este repo: reemplazalas por las tuyas desde el panel antes de un examen real. Las preguntas que subís por Excel quedan solo en tu Google Sheet.
- Capacidad: Apps Script procesa unas 30 solicitudes simultáneas. La app hace pocas llamadas por alumno (ingreso, verificaciones y envío) y reintenta sola si el servidor está ocupado, así que un curso de 60–80 alumnos funciona bien.
- Si un alumno pierde el celular o se le cierra el navegador, puede reabrir el link en el mismo dispositivo y sigue donde estaba. En otro dispositivo, el docente usa **Habilitar reingreso**.
- Si un alumno necesita rendir de nuevo, el docente elimina su examen desde el detalle.

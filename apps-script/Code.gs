/**
 * Examen V/F — backend en Google Apps Script.
 * La Google Sheet que contiene este script es la base de datos:
 *   Config     → título, contraseña de administrador, abierto/cerrado, etc.
 *   Preguntas  → N | Pregunta | Respuesta (V/F). Las respuestas correctas nunca se envían al alumno.
 *   Examenes   → una fila por alumno con sus respuestas, verificaciones y puntaje.
 *   Detalle    → una fila por alumno × pregunta al enviar (el repositorio de exámenes).
 *
 * Instalación: ver README.md del repositorio. Resumen: pegar este archivo en
 * Extensiones → Apps Script, ejecutar setup() una vez y desplegar como aplicación web
 * (Ejecutar como: yo · Quién tiene acceso: cualquier usuario).
 */

var TZ = 'America/Argentina/Buenos_Aires';
var SH = { CONFIG: 'Config', PREG: 'Preguntas', EXAM: 'Examenes', DET: 'Detalle' };
var EXAM_H = ['id', 'token', 'creado', 'nombre', 'apellido', 'curso', 'dni', 'estado', 'verificaciones',
  'respuestas', 'orden', 'correctas', 'incorrectas', 'sin_responder', 'puntaje', 'enviado'];
var DET_H = ['examen_id', 'enviado', 'apellido', 'nombre', 'curso', 'dni', 'n', 'pregunta',
  'respuesta_correcta', 'respuesta_elegida', 'resultado', 'puntos'];
var CONFIG_DEFAULTS = [
  ['titulo', 'Examen Verdadero o Falso', 'Título que ven los alumnos'],
  ['admin_password', 'docente2026', 'Contraseña del panel de administración (cambiala)'],
  ['abierto', 'SI', 'SI = se aceptan nuevos registros · NO = examen cerrado'],
  ['max_correcciones', '3', 'Cantidad máxima de correcciones por alumno'],
  ['mezclar', 'NO', 'SI = cada alumno recibe las preguntas en orden aleatorio'],
  ['cursos', '', 'Lista de cursos separados por coma (vacío = texto libre)']
];
var SEED = [["Un sistema de información incluye personas, procedimientos, datos y tecnología, no solo computadoras.", "V"], ["Dato e información son sinónimos en la gestión empresarial.", "F"], ["La información tiene valor cuando es oportuna, precisa y relevante para quien decide.", "V"], ["Un ERP integra en una única base de datos los procesos de distintas áreas de la empresa.", "V"], ["Un ERP se implementa siempre sin necesidad de revisar los procesos de negocio de la empresa.", "F"], ["La memoria RAM conserva su contenido cuando se apaga el equipo.", "F"], ["Un disco SSD no tiene partes mecánicas móviles.", "V"], ["La computación en la nube permite pagar por uso en lugar de invertir en infraestructura propia.", "V"], ["En el modelo SaaS, el cliente es responsable de administrar los servidores donde corre la aplicación.", "F"], ["IaaS provee infraestructura (servidores, almacenamiento, red) como servicio.", "V"], ["El sistema operativo es un software de aplicación.", "F"], ["El software de código abierto nunca tiene costos asociados de implementación ni de soporte.", "F"], ["Un algoritmo es una secuencia finita de pasos para resolver un problema.", "V"], ["RFID permite identificar objetos sin línea de visión directa, a diferencia del código de barras.", "V"], ["La mayor parte del tráfico internacional de Internet viaja por satélites.", "F"], ["TCP/IP es el conjunto de protocolos sobre el que funciona Internet.", "V"], ["Una red LAN cubre áreas geográficas extensas, como países o continentes.", "F"], ["La Business Intelligence transforma datos en información para la toma de decisiones.", "V"], ["Un data warehouse está optimizado principalmente para registrar transacciones operativas en tiempo real.", "F"], ["La minería de datos busca patrones y relaciones no evidentes en grandes volúmenes de datos.", "V"], ["Un tablero de control debería mostrar todos los indicadores disponibles, sin priorizar.", "F"], ["La inteligencia artificial generativa puede producir respuestas incorrectas con apariencia convincente.", "V"], ["COBIT es un marco de referencia para el gobierno y la gestión de las TI.", "V"], ["La gobernanza de IT es responsabilidad exclusiva del área de sistemas.", "F"], ["Alinear la estrategia de IT con la estrategia del negocio es un objetivo central de la gobernanza de IT.", "V"], ["El CHAOS Report del Standish Group analiza el éxito y el fracaso de proyectos de software.", "V"], ["Según el CHAOS Report, la mayoría de los proyectos de software terminan en el tiempo, costo y alcance previstos.", "F"], ["Las metodologías ágiles entregan el producto en incrementos cortos e iterativos.", "V"], ["En una metodología en cascada, cada etapa comienza cuando finaliza la anterior.", "V"], ["Scrum es una metodología en cascada.", "F"], ["El involucramiento de los usuarios es un factor clave de éxito en los proyectos de sistemas.", "V"], ["Desarrollar software a medida suele ser más rápido y barato que adquirir un paquete estándar.", "F"], ["Al tercerizar un servicio de IT, la empresa deja de necesitar controlar al proveedor.", "F"], ["Un acuerdo de nivel de servicio (SLA) define parámetros medibles de calidad que el proveedor se compromete a cumplir.", "V"], ["El costo total de propiedad (TCO) considera solo el precio de compra del equipamiento.", "F"], ["En una contratación de tecnología conviene definir los criterios de evaluación antes de recibir las propuestas.", "V"], ["Confidencialidad, integridad y disponibilidad son los pilares de la seguridad de la información.", "V"], ["Un firewall alcanza por sí solo para proteger a una organización de todos los ataques informáticos.", "F"], ["El phishing busca engañar a las personas para que entreguen credenciales o información sensible.", "V"], ["El ransomware cifra los datos de la víctima y exige un pago para liberarlos.", "V"], ["Tener backups probados periódicamente es una medida clave frente a un ataque de ransomware.", "V"], ["La autenticación de dos factores combina, por ejemplo, algo que sabés con algo que tenés.", "V"], ["Un plan de continuidad del negocio solo es necesario en empresas de más de mil empleados.", "F"], ["El e-business abarca únicamente la venta de productos por Internet.", "F"], ["El modelo B2B se refiere a transacciones entre empresas.", "V"], ["Las plataformas digitales pueden convertir en commodity a las empresas que dependen de ellas para llegar a sus clientes.", "V"], ["La Industria 4.0 se caracteriza por integrar sistemas físicos y digitales, como sensores conectados e IoT.", "V"], ["Internet de las Cosas (IoT) se refiere exclusivamente a la conexión de computadoras personales a Internet.", "F"], ["El diagrama de un circuito administrativo permite detectar controles internos y puntos de mejora del proceso.", "V"], ["Digitalizar un proceso ineficiente lo vuelve eficiente automáticamente.", "F"]];

/* ───────────────────────── Instalación ───────────────────────── */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = sheet_(SH.CONFIG, ['clave', 'valor', 'descripcion']);
  if (cfg.getLastRow() < 2) cfg.getRange(2, 1, CONFIG_DEFAULTS.length, 3).setValues(CONFIG_DEFAULTS);
  cfg.getRange('B:B').setNumberFormat('@');
  var p = sheet_(SH.PREG, ['n', 'pregunta', 'respuesta']);
  p.getRange('A:C').setNumberFormat('@');
  if (p.getLastRow() < 2 && SEED.length) {
    p.getRange(2, 1, SEED.length, 3).setValues(SEED.map(function (q, i) { return [String(i + 1), q[0], q[1]]; }));
  }
  var e = sheet_(SH.EXAM, EXAM_H); e.getRange('A:P').setNumberFormat('@');
  var d = sheet_(SH.DET, DET_H); d.getRange('A:L').setNumberFormat('@');
  var s1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  clearCache_();
  Logger.log('Listo. Ahora: Implementar → Nueva implementación → Aplicación web.');
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ───────────────────────── HTTP ───────────────────────── */

function doGet() { return out_({ ok: true, app: 'examen-vf' }); }

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'Solicitud inválida.' }); }
  try {
    var fn = ACTIONS[req.action];
    if (!fn) throw fail_('Acción desconocida.');
    var res = fn(req) || {};
    res.ok = true;
    return out_(res);
  } catch (err) {
    return out_({ ok: false, error: err.userMessage || ('Error del servidor: ' + err.message), code: err.code || null });
  }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(msg, code) { var e = new Error(msg); e.userMessage = msg; e.code = code || null; return e; }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function str_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss') : String(v == null ? '' : v); }

/* ───────────────────────── Datos ───────────────────────── */

function clearCache_() { CacheService.getScriptCache().removeAll(['cfg', 'preg']); }

function config_() {
  var c = CacheService.getScriptCache(), hit = c.get('cfg');
  if (hit) return JSON.parse(hit);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.CONFIG);
  if (!sh) throw fail_('Falta ejecutar setup() en la planilla.', 'setup');
  var cfg = {};
  CONFIG_DEFAULTS.forEach(function (r) { cfg[r[0]] = r[1]; });
  sh.getDataRange().getValues().slice(1).forEach(function (r) { if (r[0]) cfg[String(r[0]).trim()] = str_(r[1]).trim(); });
  cfg.max_correcciones = Math.max(0, parseInt(cfg.max_correcciones, 10) || 0);
  cfg.abierto = String(cfg.abierto).toUpperCase() === 'SI' ? 'SI' : 'NO';
  cfg.mezclar = String(cfg.mezclar).toUpperCase() === 'SI' ? 'SI' : 'NO';
  c.put('cfg', JSON.stringify(cfg), 60);
  return cfg;
}

function setConfigValue_(key, value) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.CONFIG);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(String(value)); return; }
  }
  sh.appendRow([key, String(value), '']);
}

function normAns_(v) {
  if (v === true) return 'V';
  if (v === false) return 'F';
  var s = String(v == null ? '' : v).trim().toUpperCase();
  if (['V', 'VERDADERO', 'VERDADERA', 'TRUE', 'SI', 'SÍ', '1'].indexOf(s) >= 0) return 'V';
  if (['F', 'FALSO', 'FALSA', 'FALSE', 'NO', '0'].indexOf(s) >= 0) return 'F';
  return '';
}

function questions_() {
  var c = CacheService.getScriptCache(), hit = c.get('preg');
  if (hit) return JSON.parse(hit);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.PREG);
  var qs = [];
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
      var t = str_(r[1]).trim();
      if (t) qs.push({ n: qs.length + 1, texto: t, respuesta: normAns_(r[2]) });
    });
  }
  try { c.put('preg', JSON.stringify(qs), 300); } catch (e) { /* demasiado grande para caché */ }
  return qs;
}

function examSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.EXAM); }

function rowToExam_(r, rowNum) {
  var o = { row: rowNum };
  EXAM_H.forEach(function (h, i) { o[h] = str_(r[i]); });
  o.verificaciones = parseInt(o.verificaciones, 10) || 0;
  try { o.respuestas = o.respuestas ? JSON.parse(o.respuestas) : {}; } catch (e) { o.respuestas = {}; }
  try { o.orden = o.orden ? JSON.parse(o.orden) : null; } catch (e) { o.orden = null; }
  return o;
}

function exams_() {
  var sh = examSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, EXAM_H.length).getValues()
    .map(function (r, i) { return rowToExam_(r, i + 2); })
    .filter(function (x) { return x.id; });
}

function findExam_(id) {
  var list = exams_();
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

function writeExam_(x) {
  var fresh = findExam_(x.id);           // releer la fila por si cambió de posición
  if (!fresh) throw fail_('El examen ya no existe. Volvé a registrarte.', 'not_found');
  var row = EXAM_H.map(function (h) {
    if (h === 'respuestas') return JSON.stringify(x.respuestas || {});
    if (h === 'orden') return x.orden ? JSON.stringify(x.orden) : '';
    return x[h] == null ? '' : String(x[h]);
  });
  examSheet_().getRange(fresh.row, 1, 1, EXAM_H.length).setValues([row]);
}

function cleanAnswers_(raw, qs) {
  var out = {};
  if (!raw || typeof raw !== 'object') return out;
  qs.forEach(function (q) { var a = normAns_(raw[q.n]); if (a) out[q.n] = a; });
  return out;
}

function score_(answers, qs) {
  var r = { correctas: 0, incorrectas: 0, sin_responder: 0, puntaje: 0, total: qs.length };
  qs.forEach(function (q) {
    var a = answers[q.n];
    if (!a) r.sin_responder++;
    else if (a === q.respuesta) r.correctas++;
    else r.incorrectas++;
  });
  r.puntaje = r.correctas - r.incorrectas;
  return r;
}

function normDni_(s) { return String(s || '').replace(/[.\s-]/g, '').toUpperCase(); }

function shuffle_(n) {
  var a = []; for (var i = 1; i <= n; i++) a.push(i);
  for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
  return a;
}

function studentPayload_(x, cfg, qs) {
  var order = (x.orden && x.orden.length === qs.length) ? x.orden : qs.map(function (q) { return q.n; });
  var byN = {}; qs.forEach(function (q) { byN[q.n] = q; });
  var p = {
    examId: x.id, token: x.token, titulo: cfg.titulo,
    alumno: { nombre: x.nombre, apellido: x.apellido, curso: x.curso, dni: x.dni },
    preguntas: order.filter(function (n) { return byN[n]; }).map(function (n) { return { n: n, texto: byN[n].texto }; }),
    respuestas: x.respuestas || {},
    verificaciones: x.verificaciones,
    maxCorrecciones: cfg.max_correcciones,
    estado: x.estado
  };
  if (x.estado === 'enviado') {
    p.resultado = { correctas: +x.correctas, incorrectas: +x.incorrectas, sin_responder: +x.sin_responder, puntaje: +x.puntaje, total: qs.length };
    p.enviado = x.enviado;
  } else if (x.verificaciones > 0) {
    p.resultado = score_(x.respuestas || {}, qs);
  }
  return p;
}

function authExam_(req) {
  var x = findExam_(String(req.examId || ''));
  if (!x) throw fail_('No encontramos tu examen. Volvé a registrarte.', 'not_found');
  if (!x.token || x.token !== String(req.token || '')) throw fail_('Este examen se abrió en otro dispositivo. Pedile al docente que habilite el reingreso.', 'in_use');
  return x;
}

/* ───────────────────────── Acciones del alumno ───────────────────────── */

var ACTIONS = {};

ACTIONS.info = function () {
  var cfg = config_();
  return {
    titulo: cfg.titulo, abierto: cfg.abierto === 'SI', totalPreguntas: questions_().length,
    maxCorrecciones: cfg.max_correcciones,
    cursos: cfg.cursos ? cfg.cursos.split(',').map(function (s) { return s.trim(); }).filter(String) : []
  };
};

ACTIONS.register = function (req) {
  var nombre = String(req.nombre || '').trim(), apellido = String(req.apellido || '').trim();
  var curso = String(req.curso || '').trim(), dni = normDni_(req.dni);
  if (!nombre || !apellido || !curso || !dni) throw fail_('Completá nombre, apellido, curso y DNI o registro.');
  if (nombre.length > 80 || apellido.length > 80 || curso.length > 80 || dni.length > 30) throw fail_('Algún dato es demasiado largo.');
  var cfg = config_(), qs = questions_();
  if (!qs.length) throw fail_('El examen todavía no tiene preguntas cargadas.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw fail_('Hay mucha gente entrando a la vez. Probá de nuevo en unos segundos.', 'busy');
  try {
    var list = exams_(), x = null;
    for (var i = 0; i < list.length; i++) if (list[i].dni === dni) { x = list[i]; break; }
    if (x) {
      if (x.estado === 'enviado') return studentPayload_(x, cfg, qs);
      if (x.token && x.token !== String(req.token || '')) {
        throw fail_('Ya hay un examen en curso con este DNI o registro en otro dispositivo. Pedile al docente que habilite el reingreso.', 'in_use');
      }
      if (!x.token) { x.token = Utilities.getUuid(); writeExam_(x); }
      return studentPayload_(x, cfg, qs);
    }
    if (cfg.abierto !== 'SI') throw fail_('El examen está cerrado. Consultá con tu docente.', 'closed');
    x = {
      id: Utilities.getUuid().replace(/-/g, '').slice(0, 10), token: Utilities.getUuid(), creado: now_(),
      nombre: nombre, apellido: apellido, curso: curso, dni: dni, estado: 'en_curso', verificaciones: 0,
      respuestas: {}, orden: cfg.mezclar === 'SI' ? shuffle_(qs.length) : null,
      correctas: '', incorrectas: '', sin_responder: '', puntaje: '', enviado: ''
    };
    var row = EXAM_H.map(function (h) {
      if (h === 'respuestas') return '{}';
      if (h === 'orden') return x.orden ? JSON.stringify(x.orden) : '';
      return String(x[h]);
    });
    var sh = examSheet_();
    sh.getRange(sh.getLastRow() + 1, 1, 1, EXAM_H.length).setValues([row]);
    return studentPayload_(x, cfg, qs);
  } finally { lock.releaseLock(); }
};

ACTIONS.verify = function (req) {
  var x = authExam_(req), cfg = config_(), qs = questions_();
  if (x.estado === 'enviado') throw fail_('Este examen ya fue enviado.', 'sent');
  if (x.verificaciones >= 1 + cfg.max_correcciones) throw fail_('Ya usaste todas tus correcciones. Solo podés enviar el examen.', 'no_corrections');
  x.respuestas = cleanAnswers_(req.respuestas, qs);
  x.verificaciones = x.verificaciones + 1;
  writeExam_(x);
  return {
    resultado: score_(x.respuestas, qs), verificaciones: x.verificaciones,
    correccionesRestantes: Math.max(0, cfg.max_correcciones - (x.verificaciones - 1))
  };
};

ACTIONS.submit = function (req) {
  var x = authExam_(req), qs = questions_();
  if (x.estado === 'enviado') {
    return { resultado: { correctas: +x.correctas, incorrectas: +x.incorrectas, sin_responder: +x.sin_responder, puntaje: +x.puntaje, total: qs.length }, enviado: x.enviado };
  }
  // Se envían las respuestas de la última verificación (las que el alumno vio puntuadas).
  var ans = x.verificaciones > 0 ? x.respuestas : cleanAnswers_(req.respuestas, qs);
  var r = score_(ans, qs);
  x.respuestas = ans; x.estado = 'enviado'; x.enviado = now_();
  x.correctas = r.correctas; x.incorrectas = r.incorrectas; x.sin_responder = r.sin_responder; x.puntaje = r.puntaje;

  var rows = qs.map(function (q) {
    var a = ans[q.n] || '';
    var res = !a ? 'Sin responder' : (a === q.respuesta ? 'Correcta' : 'Incorrecta');
    return [x.id, x.enviado, x.apellido, x.nombre, x.curso, x.dni, String(q.n), q.texto, q.respuesta, a, res,
      String(!a ? 0 : (a === q.respuesta ? 1 : -1))];
  });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw fail_('El servidor está ocupado. Tocá Enviar de nuevo en unos segundos.', 'busy');
  try {
    writeExam_(x);
    var d = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.DET);
    d.getRange(d.getLastRow() + 1, 1, rows.length, DET_H.length).setValues(rows);
  } finally { lock.releaseLock(); }
  return { resultado: r, enviado: x.enviado };
};

/* ───────────────────────── Acciones del administrador ───────────────────────── */

function admin_(req) {
  var cfg = config_();
  if (!req.password || String(req.password) !== String(cfg.admin_password)) throw fail_('Contraseña incorrecta.', 'auth');
  return cfg;
}

function publicCfg_(cfg) {
  return { titulo: cfg.titulo, abierto: cfg.abierto, max_correcciones: cfg.max_correcciones, mezclar: cfg.mezclar, cursos: cfg.cursos };
}

function examSummary_(x, total) {
  return {
    id: x.id, creado: x.creado, nombre: x.nombre, apellido: x.apellido, curso: x.curso, dni: x.dni,
    estado: x.estado, verificaciones: x.verificaciones, correccionesUsadas: Math.max(0, x.verificaciones - 1),
    respondidas: Object.keys(x.respuestas || {}).length, total: total,
    correctas: x.correctas, incorrectas: x.incorrectas, sin_responder: x.sin_responder, puntaje: x.puntaje,
    enviado: x.enviado, vinculado: !!x.token
  };
}

ACTIONS.adminLogin = function (req) {
  var cfg = admin_(req);
  return { config: publicCfg_(cfg), totalPreguntas: questions_().length };
};

ACTIONS.adminGetQuestions = function (req) {
  admin_(req);
  return { preguntas: questions_() };
};

ACTIONS.adminSetQuestions = function (req) {
  admin_(req);
  var list = Array.isArray(req.preguntas) ? req.preguntas : [];
  var rows = [];
  list.forEach(function (q, i) {
    var t = String(q.texto || '').trim(), a = normAns_(q.respuesta);
    if (!t) return;
    if (!a) throw fail_('La pregunta ' + (i + 1) + ' no tiene una respuesta válida (V o F).');
    rows.push([String(rows.length + 1), t, a]);
  });
  if (!rows.length) throw fail_('El archivo no tiene preguntas válidas.');
  if (!req.force && exams_().length) {
    throw fail_('Ya hay exámenes registrados con las preguntas actuales. Archivalos antes o confirmá que querés reemplazar igual.', 'has_exams');
  }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.PREG);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 3).clearContent();
  sh.getRange(2, 1, rows.length, 3).setNumberFormat('@').setValues(rows);
  clearCache_();
  return { total: rows.length };
};

ACTIONS.adminSetConfig = function (req) {
  admin_(req);
  var c = req.config || {};
  if (c.titulo != null) setConfigValue_('titulo', String(c.titulo).trim().slice(0, 120) || 'Examen Verdadero o Falso');
  if (c.abierto != null) setConfigValue_('abierto', c.abierto === true || String(c.abierto).toUpperCase() === 'SI' ? 'SI' : 'NO');
  if (c.max_correcciones != null) setConfigValue_('max_correcciones', String(Math.max(0, Math.min(20, parseInt(c.max_correcciones, 10) || 0))));
  if (c.mezclar != null) setConfigValue_('mezclar', c.mezclar === true || String(c.mezclar).toUpperCase() === 'SI' ? 'SI' : 'NO');
  if (c.cursos != null) setConfigValue_('cursos', String(c.cursos));
  if (c.nueva_password) {
    if (String(c.nueva_password).length < 6) throw fail_('La contraseña nueva debe tener al menos 6 caracteres.');
    setConfigValue_('admin_password', String(c.nueva_password));
  }
  clearCache_();
  return { config: publicCfg_(config_()) };
};

ACTIONS.adminListExams = function (req) {
  admin_(req);
  var total = questions_().length;
  return { examenes: exams_().map(function (x) { return examSummary_(x, total); }), totalPreguntas: total };
};

ACTIONS.adminGetExam = function (req) {
  admin_(req);
  var x = findExam_(String(req.id || ''));
  if (!x) throw fail_('Examen no encontrado.', 'not_found');
  var qs = questions_(), detalle = [];
  if (x.estado === 'enviado') {
    var d = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.DET);
    if (d.getLastRow() > 1) {
      d.getRange(2, 1, d.getLastRow() - 1, DET_H.length).getValues().forEach(function (r) {
        if (str_(r[0]) === x.id) detalle.push({ n: +r[6], pregunta: str_(r[7]), correcta: str_(r[8]), elegida: str_(r[9]), resultado: str_(r[10]), puntos: +r[11] });
      });
    }
  } else {
    qs.forEach(function (q) {
      var a = x.respuestas[q.n] || '';
      detalle.push({ n: q.n, pregunta: q.texto, correcta: q.respuesta, elegida: a,
        resultado: !a ? 'Sin responder' : (a === q.respuesta ? 'Correcta' : 'Incorrecta'),
        puntos: !a ? 0 : (a === q.respuesta ? 1 : -1) });
    });
  }
  detalle.sort(function (a, b) { return a.n - b.n; });
  var sum = examSummary_(x, qs.length);
  if (x.estado !== 'enviado') {
    var r = score_(x.respuestas, qs);
    sum.parcial = r;
  }
  return { examen: sum, detalle: detalle };
};

ACTIONS.adminUnlock = function (req) {
  admin_(req);
  var x = findExam_(String(req.id || ''));
  if (!x) throw fail_('Examen no encontrado.', 'not_found');
  x.token = ''; writeExam_(x);
  return {};
};

ACTIONS.adminDeleteExam = function (req) {
  admin_(req);
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    var x = findExam_(String(req.id || ''));
    if (!x) throw fail_('Examen no encontrado.', 'not_found');
    examSheet_().deleteRow(x.row);
    var d = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.DET);
    if (d.getLastRow() > 1) {
      var ids = d.getRange(2, 1, d.getLastRow() - 1, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) if (str_(ids[i][0]) === x.id) d.deleteRow(i + 2);
    }
  } finally { lock.releaseLock(); }
  return {};
};

ACTIONS.adminArchive = function (req) {
  admin_(req);
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HHmm');
    [SH.EXAM, SH.DET].forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (sh.getLastRow() < 2) return;
      sh.copyTo(ss).setName(name + ' ' + stamp);
      sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    });
    return { archivo: stamp };
  } finally { lock.releaseLock(); }
};

ACTIONS.adminExport = function (req) {
  admin_(req);
  var total = questions_().length;
  var d = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.DET), det = [];
  if (d.getLastRow() > 1) {
    det = d.getRange(2, 1, d.getLastRow() - 1, DET_H.length).getValues().map(function (r) {
      var o = {}; DET_H.forEach(function (h, i) { o[h] = str_(r[i]); }); return o;
    });
  }
  return { examenes: exams_().map(function (x) { return examSummary_(x, total); }), detalle: det };
};

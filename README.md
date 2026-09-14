# Trackeo

Cronómetro personal de trabajo. Medís una tarea, la tarea vive dentro de un proyecto, y el
total de un proyecto es la suma de sus tareas.

## Dónde está

**https://miliobrien.github.io/trackeo/**

Anda siempre, desde cualquier compu o celular, sin tener nada corriendo. Cada vez que se sube
un cambio a `main`, GitHub corre los tests y publica la versión nueva sola.

### Tenerla como app

- **En la compu, con Chrome:** abrí el enlace y tocá el ícono de instalar a la derecha de la
  barra de direcciones, o menú, Transmitir, guardar y compartir, Instalar página como app.
  Queda un ícono en el escritorio y en el menú Inicio, y abre en su propia ventana.
- **En el celular:** abrí el enlace, menú, Agregar a pantalla principal.

La primera vez en cada dispositivo tocá Sincronizar y entrá con tu mail. Después te recuerda.

El registro de cuentas nuevas está cerrado en Supabase: cualquiera puede abrir el enlace, pero
solo tu cuenta entra.

## Para desarrollar

```bash
npm run dev
```

Se abre en `http://localhost:3000`. Es solo para probar cambios antes de subirlos. El puerto está fijo a propósito, por dos razones que
están explicadas en `vite.config.ts`: el navegador guarda tus datos por dirección exacta, y
esa es la dirección a la que Supabase devuelve el enlace de acceso.

1. La primera vez, escribí el nombre de un proyecto y apretá **Crear**.
2. Escribí en qué estás trabajando y apretá **Enter** o **Empezar**.
3. Cuando terminás, **Enter** de nuevo o **Frenar**.

Arrancar una tarea nueva sin frenar la anterior cierra la anterior sola. Nunca hay dos
cronómetros corriendo.

El tiempo transcurrido aparece también en el título de la pestaña, así que lo ves desde otra
ventana.

## Lo que ves en pantalla

- **La franja de horas** es tu día completo de 00 a 24. Cada bloque de trabajo es un segmento
  del color de su proyecto, y los huecos son los huecos.
- **La barra de fecha** manda sobre la franja y la lista. Las flechas mueven un día, el campo
  salta a cualquier fecha, y a la derecha está el total de ese día. No podés adelantarte más
  allá de hoy porque no hay nada que ver ahí.
- **La lista** muestra los bloques del día elegido. La `×` de cada fila borra un bloque, y
  pregunta antes.
- **Total por proyecto** suma todo lo registrado desde siempre, sin importar qué día estés
  mirando. Es la respuesta a cuánto te llevó cada trabajo.

Mientras no toques la fecha, la app sigue al reloj: si la dejás abierta y pasa la medianoche,
la vista salta sola al día nuevo. En cuanto navegás a otro día se queda ahí hasta que le des
**Volver a hoy**.

Un bloque que cruza la medianoche cuenta entero en el día en que empezó.

## Corregir horarios

Tocá el horario de cualquier fila y se abren dos campos. Funciona igual en cualquier día: con
las flechas vas al día que quieras y corregís ahí. La duración de arriba se actualiza mientras
escribís, así que ves el resultado antes de guardar. En un bloque que todavía corre solo se
mueve el inicio, para el día que arrancás el cronómetro veinte minutos tarde.

Tres cosas que hace por vos:

- Si el fin queda antes del inicio, lo entiende como un bloque que pasó la medianoche.
- No te deja poner una hora que todavía no llegó.
- Te avisa si el bloque corregido se pisa con otro, porque esas horas se contarían dos veces.
  Es un aviso, no un impedimento: si de verdad trabajaste así, guardá igual.

## Tus datos

Todo se guarda primero en este navegador, en IndexedDB. Cerrar la pestaña, cerrar Chrome o
apagar la compu no borra nada. La app arranca y funciona sin internet y sin cuenta.

### Sincronizar entre dispositivos

Apretá **Sincronizar** en el encabezado y poné tu correo. Te llega un enlace, lo abrís en
esta compu y listo, no hay contraseña. Desde ese momento la compu y el celular ven lo mismo.

El indicador del encabezado dice en qué anda:

| Dice | Significa |
|---|---|
| Solo en esta compu | No entraste. Todo funciona, pero no sale de este navegador |
| Guardando cambios | Hay cambios locales esperando al servidor |
| Sincronizando | Está hablando con el servidor ahora |
| Sincronizado | La compu y el servidor dicen lo mismo |
| Sin conexión, se guarda igual | Sigue midiendo; sube todo cuando vuelva internet |

Sincroniza al entrar, al volver a la pestaña, cada minuto, y un segundo y medio después de
cada cambio tuyo. Si el mismo registro se tocó en los dos lados, gana el más reciente.

### Respaldo en archivo

**Exportar** baja un JSON con todo y **Importar** lo vuelve a cargar. Sirve igual aunque
sincronices, para tener una copia que no dependa de ninguna cuenta.

### Lo que sí borra los datos locales

Limpiar los datos del sitio en Chrome, o abrir la app en incógnito. Si sincronizás, volvés a
entrar y baja todo de nuevo. Si no, esa copia se pierde, por eso conviene exportar.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests de la lógica de tiempo |
| `npm run build` | Compila a `dist/` |
| `npm run lint` | Revisa el código |

## Cómo está armado

Vite, React y TypeScript, con Tailwind para los estilos y Dexie sobre IndexedDB. Dexie
publica consultas reactivas, así que la base de datos es el estado de la app y no hay una
biblioteca de estado aparte.

```
src/db/schema.ts     Tablas y tipos
src/db/repo.ts       Toda escritura pasa por acá
src/lib/time.ts      Duraciones, límites de día, posición en la franja
src/hooks/useNow.ts  El tick del cronómetro
src/sync/engine.ts   Enviar, traer y resolver conflictos
src/sync/rows.ts     Traducción entre la forma local y la de Postgres
src/components/      Interfaz
```

Las credenciales de Supabase viven en `.env.local`, que no se versiona. `.env.example` dice
qué va adentro. La clave publicable se envía al navegador a propósito: no habilita nada por
sí sola, porque cada tabla está detrás de una política que solo deja tocar las filas propias
a quien inició sesión.

Cuatro decisiones que conviene no revertir sin pensarlas:

**El tiempo transcurrido se calcula, nunca se acumula.** Cada tick hace
`Date.now() - startedAt`. Un contador que suma de a un segundo se atrasa en silencio cuando
la máquina se suspende o cuando el navegador ralentiza una pestaña de fondo.

**Todo instante es un epoch en milisegundos.** Inmune al horario de verano y a los ajustes
del reloj del sistema. Se convierte a hora local solo para mostrarlo.

**Nada se borra de verdad.** Un registro eliminado queda marcado con `deletedAt` y las
lecturas lo saltean. Si se borrara la fila, el otro dispositivo la volvería a subir en la
sincronización siguiente y el borrado se desharía solo.

**El servidor lleva dos relojes y cada uno tiene su tarea.** `updated_at` lo escribe el
dispositivo que hizo el cambio y decide qué versión gana. `synced_at` lo escribe la base y
solo sirve para preguntar qué cambió desde la última vez, sin depender de qué hora crea que
es cada máquina.

## Qué falta

En orden de utilidad: totales por semana y por mes en vez de solo por día y desde siempre,
cargar un bloque entero a mano para un trabajo que hiciste sin la app abierta, y tarifa por
hora por proyecto.

Para usarla desde el celular hace falta publicarla en algún lado, y ahí hay que cambiar el
Site URL del proyecto en Supabase, en Authentication, URL Configuration, para que el enlace
de acceso apunte a la dirección publicada y no a localhost.

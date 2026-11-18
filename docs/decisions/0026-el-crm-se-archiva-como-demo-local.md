# 0026 — El CRM se archiva como demo en localhost

- Estado: **aceptada** (decisión del usuario del 2026-11-18, al aprobar el
  [brief-13.6](brief-13.6-el-archivo-como-demo-local.md) con D-1 a D-8 en su opción (a)). Lo pidió
  el proyecto **Vixora CRM** en su ADR 0004 (D-8 bis, variante d2, 2026-11-18), que hereda el
  droplet de 2 GB y destruye el de 1 GB.
- Fecha: 2026-11-18
- Nivel: no hay código de producto ni migraciones, así que la escala de validación no aplica a la
  decisión. Cada cosa ejecutada tiene su nivel propio en [evidencia-13.6](evidencia-13.6-archivo.md):
  backup **restaurado y verificado**, servicios **apagados, leído en systemd**, demo **corriendo
  en local**.
- **Estado del proyecto desde esta fecha: archivado / demo en localhost.**

## Contexto

El CRM corría en dos droplets propios: `crm-production` (`crm.vixoraai.app`, 2 GB) y
`crm-staging` (`staging.vixoraai.app`, 1 GB), con backups diarios, una copia externa cifrada en un
bucket de Spaces, un ejercicio de restauración mensual, la lectura de la cotización y avisos en
Healthchecks.io y DigitalOcean. Su único consumidor, el agente de WhatsApp, leía y escribía en
producción solo en las organizaciones de demostración. Ningún negocio real llegó a cargarse: la
13.5.2-b esperaba uno desde el 2026-10-01.

Vixora CRM necesita esos droplets. El CRM deja de estar desplegado y pasa a correr en la máquina
del operador.

## Decisión

1. **El CRM queda archivado como demo en localhost.** Corre con `npm run dev` sobre la base
   `crm_demo` del Postgres de `docker-compose.yml`, que es **el backup final de producción
   restaurado**, con sus organizaciones de demostración y sus usuarios. La guía es
   [docs/runbooks/demo-local.md](../runbooks/demo-local.md).
2. **El backup final** de los dos entornos se tomó con las aplicaciones detenidas, se restauró en
   una base aparte y se comparó contra su manifiesto, con el hash de cada imagen y dos controles
   negativos. Queda **cifrado con `age`** en dos lugares de la máquina del operador:
   `%USERPROFILE%\Backups\crm-final-2026-11-18`, con los `.age`, sus sumas y los `.recuentos`, y
   `%USERPROFILE%\OneDrive\Backups\crm-final-2026-11-18`, solo con los `.age` y sus sumas. La clave
   privada vive aparte de las dos.
3. **En los dos droplets**, la aplicación y los timers del CRM están **detenidos y
   deshabilitados**. `nginx`, `postgresql` y `certbot` siguen corriendo hasta que Vixora CRM
   destruya o recree. **No se borró nada del disco.** Los avisos externos están borrados o
   pausados.
4. **Los droplets quedan libres para Vixora CRM**, con una condición para los dos: guardan **dumps
   en claro** (`/var/backups/crm-production` y `/var/backups/crm-staging`) y **los secretos**
   (`/etc/crm-production/` y `/etc/crm-staging/`). «Libre» significa **destruirlo o
   reconstruirlo** (*rebuild*), no reutilizarlo tal como está.
5. **El bucket `crm-production-backups` no se toca**. Tiene 32 backups `.age` de producción, con
   sus sumas y sus `.recuentos`: uno por día del 2026-10-20 al 2026-11-18, más el final. Son 96
   objetos y 19,8 MiB, listados el 2026-11-18. Nada lo poda ni le agrega. Vixora CRM decide en su 1.6
   si lo reutiliza. Si no, se vacía y se borra con autorización en ese turno. Cuesta **USD 5 por
   mes** hasta esa decisión.
6. **La Fase 13 cierra por archivo** con la 13.6. **La 13.5.2-b queda descartada**: sin
   producción no hay dónde dar de alta un negocio real. **La Fase 14 queda planificada y sin
   abrir**: su gate es la Fase 13 cerrada, y un cierre por archivo no cumple lo que ese gate
   protegía, que es tener dónde cargar los datos migrados.
7. **El nivel máximo alcanzable pasa a ser validado en integración.** Sin un entorno equivalente
   a producción, ninguna subfase llega a validado en staging. La **24.9.1 sigue pausada** con su
   brief intacto; quien la retome enmienda su nivel objetivo en su propio brief.
8. **El agente queda fuera de esta decisión.** No puede alcanzar `localhost` desde su n8n remoto,
   y su tabla cerrada de hosts no admite otro. Apuntarlo a la demo es **trabajo pendiente de su
   proyecto**, con su propio brief. Antes de apagar, el agente dejó sin definir sus interruptores
   del CRM y vació su `crm_outbox`. Los contratos (`read-v1`, `read-v2`, `read-v3`,
   `ingestion-v2`) no cambian.

## Consecuencias

- **El costo de esta decisión sola no cambia**: no destruye nada. Lo bajan la destrucción de
  `crm-staging` por Vixora, en el precio de su plan, y el borrado del bucket, USD 5, si Vixora no
  lo reutiliza.
- **Lo que deja de tener sentido** mientras dure el archivo, sin borrarse del repositorio:
  `deploy/production/` y `deploy/staging/` (se conservan como registro y sus guardas siguen en
  verde), los runbooks de alertas, de alta de un negocio y de observación del primer negocio, y el
  paso de despliegue del protocolo de cierre.
- **La demo no tiene backups.** `crm_demo` vive en un volumen de Docker. Si se pierde, se vuelve a
  restaurar desde el backup final con la guía. **La restauración solo se puede verificar con la
  carpeta local**, porque la copia de OneDrive no trae los `.recuentos`. Con OneDrive sola se
  restaura, pero queda sin verificar. El bucket sí tiene los `.recuentos`, mientras exista.
- **Las contraseñas de la demo son las de producción del 2026-11-18**, porque el backup las trae.
- **Volver a desplegar** es una decisión nueva, con su ADR: un entorno nuevo, restaurado desde el
  backup final con [restaurar-la-base.md](../runbooks/restaurar-la-base.md).

## Alternativas descartadas

- **Dejar la Fase 13 abierta, en pausa.** Mantiene abierta una fase cuyo entorno ya no existe.
- **Borrar el bucket al cerrar.** Baja USD 5 por mes, pero le quita a Vixora la opción de
  reutilizarlo.
- **Correr la demo con los seeds sintéticos.** Pierde los recorridos de todas las fases, que viven
  en la base de producción.
- **No cerrar la 13.6 hasta que el agente corra contra la demo.** Ata el cierre a trabajo de otro
  proyecto.

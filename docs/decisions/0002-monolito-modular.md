# 0002 — Monolito modular, no microservicios

- Estado: aceptada (principio fijado por el usuario en la instrucción inicial, 2026-09-11)
- Fecha: 2026-09-11

## Contexto

El MVP tiene un alcance acotado: catálogo e inventario, clientes, conversaciones de consulta, métricas y autenticación. No hay tráfico productivo ni una necesidad demostrada de escalar módulos por separado.

## Decisión

Una única aplicación TypeScript desplegable, organizada en módulos internos con responsabilidad única y dependencias explícitas (ver [architecture/Overview.md](../architecture/Overview.md)). Sin microservicios, colas, event sourcing, Kubernetes ni infraestructura distribuida.

## Alternativas descartadas

- Microservicios por dominio: complejidad operativa (despliegues, red, consistencia distribuida) sin beneficio a esta escala.
- Arquitectura orientada a eventos con colas: agrega entrega asíncrona y reintentos que el MVP no necesita. Los cambios de stock se resuelven con una transacción de base de datos.

## Consecuencias

- Despliegue, operación y pruebas más simples.
- Los límites entre módulos se sostienen por disciplina de código y revisión, no por aislamiento de proceso. Una fuga de dependencia entre módulos es un hallazgo de revisión.
- Separar un módulo en el futuro exige primero un contrato interno estable, que este diseño ya obliga a tener.

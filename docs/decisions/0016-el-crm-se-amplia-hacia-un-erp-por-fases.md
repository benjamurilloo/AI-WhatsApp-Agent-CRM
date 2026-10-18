# 0016 — El CRM se amplía hacia un ERP, por fases

- Estado: **aceptada** (decisión del usuario del 2026-10-05, con la recomendación del punto 3). **Reemplaza el punto 7 del [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)** y las exclusiones del ERP en [Scope.md](../product/Scope.md).
- Fecha: 2026-10-05
- *Nota del 2026-10-13*: **la cuenta corriente de clientes**, que el punto 1 deja «sin fase hasta que el uso los pida», **entra en la Fase 21** por decisión del usuario de ese día, al aprobar el [brief-21.1](brief-21.1-adr-de-cobros-y-caja.md). La diseña el [ADR 0022](0022-cobros-y-caja.md), punto 9. El texto de este ADR no cambia. El punto 5 sigue igual, y el ADR 0022 lo aplica: el agente no registra ni lee cobros, caja ni cuentas corrientes.
- *Nota del 2026-10-15*: **la cuenta corriente con proveedores** entra en la Fase 22, con los pagos a proveedores, por decisión del usuario de ese día al aprobar el [brief-22.1](brief-22.1-adr-de-compras-y-proveedores.md). La diseña el [ADR 0023](0023-compras-y-proveedores.md), puntos 8 y 9. El texto de este ADR no cambia. El módulo del punto 4 es `purchasing`, y los pagos viven en `cash`. El punto 5 sigue igual: el agente no registra ni lee compras, proveedores, costos ni pagos. Los gastos que no son compras siguen sin fase.
- *Nota del 2026-10-18 por el [ADR 0025](0025-tipo-de-cambio.md), punto 9*: el punto 7 se precisa sin cambiar su texto. **Leer una fuente externa no es producir un efecto externo**, pero desde el 0025 **un proceso nuevo del CRM solo sale a internet si un ADR lo autoriza, contra el host que nombra**. El 0025 autoriza uno, el lector de la cotización, contra `dolarapi.com`. Los procesos que ya salían (el heartbeat, la copia externa de los backups y certbot, de la Fase 13) quedan registrados sin cambios. La aplicación web sigue sin salir a internet.

## Contexto

El MVP excluyó el ERP de forma explícita: ventas, compras, proveedores, pagos, caja y contabilidad ([Scope.md](../product/Scope.md)). `CLAUDE.md` lo convirtió en una prohibición absoluta, y el ADR 0014 (punto 7) fijó cuándo podía revisarse: **después de que la integración con el agente estuviera en producción**, por decisión del usuario.

El 2026-10-05, al revisar los bocetos de las pantallas de detalle de la Fase 15, apareció el primer campo que pertenece a ese terreno: el **costo** de un producto, con su margen. El usuario decidió ese día empezar a planificar el CRM completo —pedidos, compras, ventas y caja—, con estas condiciones:

- se construye **a medida que se trabaja con el primer cliente**, sin prometerle el ERP completo;
- la Fase 15, la estética, sigue primero; después, las herramientas de operación (Fase 16) y los datos ampliados (Fase 17);
- el orden de las fases del ERP lo aprobó el usuario: **bases, pedidos, ventas, caja y cobros, y compras con proveedores al final**.

Dos hechos pesan en el diseño:

- **El CRM ya tiene la base**: organizaciones, clientes, productos con precio histórico y moneda, stock que nunca queda negativo ([ADR 0008](0008-stock-nunca-negativo.md)) con movimientos inmutables, tablas de solo inserción con rol de aplicación ([ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)) y auditoría.
- **No hay todavía un negocio real** en el que validar un circuito de ventas o de caja. Diseñar hoy el ERP en detalle sería diseñar sin el uso que debería guiarlo.

## Decisión

1. **El producto se amplía hacia un ERP del negocio que atiende**, por fases propias de este repositorio, con el mismo método, el mismo backlog en Notion y los mismos gates. El orden es el que aprobó el usuario el 2026-10-05 ([Roadmap](../planning/Roadmap.md)):
   - **Fase 18 — Bases del ERP**: el costo del producto con historial, la numeración de comprobantes, la moneda y los impuestos como datos;
   - **Fase 19 — Pedidos**;
   - **Fase 20 — Ventas**;
   - **Fase 21 — Caja y cobros**;
   - **Fase 22 — Compras y proveedores**.

   La contabilidad general, la cuenta corriente, las listas de precios y los depósitos múltiples quedan **sin fase** hasta que el uso los pida.
2. **Se planifica todo y se detalla solo la fase próxima.** Las Fases 18 a 22 quedan **diseñadas a grandes rasgos** en el Roadmap. Cada una se detalla al abrirse, con su brief, a partir de cómo opera en ese momento el negocio real. Ninguna tabla entra antes de su fase: la regla de «nada de tablas vacías ni de módulos especulativos» sigue vigente.
3. **Cuándo se abre la Fase 18**: con la Fase 13 cerrada (el primer negocio atendido, 13.5.2-b), o antes solo por decisión explícita del usuario registrada con fecha. El ADR 0014 la ataba a la integración en producción. Como las Fases 15 a 17 van primero, esto no demora el plan. *Decidido por el usuario el 2026-10-05, con la recomendación.*
4. **Lo que el ERP hereda sin discusión**:
   - el dinero es `numeric` con moneda explícita, nunca un número de punto flotante, como `product_prices`;
   - todo lo que mueve dinero o stock es **de solo inserción**: un comprobante emitido no se edita, se anula con otro;
   - el stock sigue sin quedar negativo (ADR 0008): un pedido o una venta que lo dejaría negativo se rechaza;
   - aislamiento por organización, auditoría y autorización en el servidor, como en el resto del CRM;
   - monolito modular ([ADR 0002](0002-monolito-modular.md)): cada fase agrega su módulo en `src/modules/` (por ejemplo `orders`, `sales`, `cash`, `purchasing`), con sus fronteras.
5. **El agente y el dinero.** El agente **nunca registra un cobro, un pago ni un movimiento de caja**. «Quiere señar» sigue siendo una etiqueta (Fase 16). Que el agente pueda dejar un pedido en estado «pendiente», para que lo confirme una persona, se decide en la Fase 19 con su propio contrato versionado, diseñado desde el modelo del CRM (ADR 0014).
6. **Comprobantes internos, no fiscales.** La Fase 20 emite comprobantes internos, marcados como no válidos como factura. La **factura electrónica de ARCA** (certificados, puntos de venta, homologación, obligaciones legales) exige un **ADR propio**, cuando un cliente la necesite. Hasta entonces, el CRM no se presenta como sistema de facturación.
7. **Lo que no cambia**: todo lo de Airtable sigue prohibido en cualquier forma; el repositorio del agente sigue siendo solo contexto de negocio; el CRM sigue sin producir efectos externos salvo que un ADR lo decida.

## Alternativas descartadas

- **Diseñar ahora todo el ERP en detalle**: produciría tablas y pantallas para un negocio que todavía no existe, que es lo que la regla de «nada especulativo» busca evitar.
- **Ventas antes que pedidos**: en un negocio que vende por WhatsApp, la conversación termina en un pedido («te reservo uno») antes que en una venta. Empezar por la venta obligaría a inventar el paso intermedio después.
- **Compras antes que caja**: el stock ya entra hoy con ajustes manuales auditados, y funciona. Cobrar, en cambio, no tiene ningún registro.
- **Un proyecto aparte para el ERP**: descartado por la misma razón que en el ADR 0014: duplicaría método y backlog para un sistema que es uno solo y comparte clientes, productos y stock.
- **Integrar un ERP de terceros**: el CRM perdería el control del modelo y sumaría una dependencia externa por organización. Se puede reconsiderar con un ADR si un cliente ya usa uno.

## Consecuencias

- Se enmiendan con fecha (hecho el 2026-10-05) y conservando el texto anterior:
  - **`CLAUDE.md`**: la prohibición pasa de «No crear tablas, módulos, endpoints ni UI de ventas, compras, proveedores, pagos, caja o contabilidad» a «No crear tablas, módulos, endpoints ni UI de ERP (ventas, compras, proveedores, pagos, caja o contabilidad) **fuera de la fase abierta que los incluye y de su brief aprobado** (ADR 0016)»;
  - **[Scope.md](../product/Scope.md)**: las exclusiones del ERP pasan a una sección «Después de la integración: el ERP», con el perímetro de este ADR;
  - **el ADR 0014**: una nota fechada en su punto 7.
- [DataModel.md](../architecture/DataModel.md) y [MetricsCatalog.md](../analytics/MetricsCatalog.md) se amplían recién al abrir cada fase, nunca antes.
- El costo del producto, que los bocetos de la Fase 15 dibujan, **no se muestra** hasta la Fase 18.
- **Riesgo principal**: que el ERP crezca más rápido que el uso real y deje tablas que nadie llena. Lo mitiga el punto 2: cada fase se detalla con el negocio delante.

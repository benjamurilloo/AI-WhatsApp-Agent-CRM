# 0008 — El stock nunca puede quedar negativo, sin excepciones

- Estado: aceptada (resuelta por el usuario en la subfase 1.3, 2026-09-11)
- Fecha: 2026-09-11
- *Nota del 2026-10-11*: el [ADR 0020](0020-el-pedido.md) modela el compromiso de entrega como este ADR lo previó, con el pedido y una reserva (`quantity_reserved`, con `CHECK (quantity_reserved <= quantity_on_hand)`), y rechaza el ajuste negativo que dejaría el saldo por debajo de lo reservado. No cambia este ADR: lo aplica a una cantidad más.

## Contexto

`DataModel.md` define `CHECK (quantity_on_hand >= 0)` sobre el saldo de inventario. FR-PROD-08 dejaba abierta la puerta a excepciones "si una decisión de negocio explícita lo habilita". Esa puerta abierta impedía escribir el test del invariante: no se puede probar una regla que admite excepciones no definidas.

El caso que justificaría permitir negativo sería la entrega diferida: vender unidades que todavía no ingresaron. El usuario confirmó que no aplica.

## Decisión

El saldo de inventario nunca puede quedar negativo. Un ajuste que dejaría `quantity_on_hand < 0` se rechaza con `BUSINESS_RULE_VIOLATION` (HTTP 422), informando el saldo actual y la cantidad solicitada. No hay excepción configurable, ni por rol, ni por producto, ni por organización.

## Alternativas descartadas

- **Permitir negativo con motivo obligatorio**: descartado. Un saldo negativo casi siempre significa que faltó registrar una entrada, no que el negocio realmente deba unidades. Permitirlo convierte un error de carga detectable en el momento en un dato silenciosamente incorrecto que alguien tiene que reconciliar después.
- **Permitir negativo solo para `admin`**: descartado por la misma razón, y porque en el MVP el único rol que ajusta stock ya es `admin` (subfase 1.3, D-9), así que la excepción no distinguiría nada.

## Consecuencias

- El `CHECK` de base de datos es la última línea de defensa, no la primera: el servicio valida antes y devuelve el error de dominio. Si el `CHECK` llega a dispararse, es un defecto del servicio, y el test lo trata como tal.
- El invariante es testeable de forma directa: se intenta violarlo y se verifica que el rechazo ocurre y que no quedó ningún movimiento registrado en `inventory_movements` (la transacción es atómica).
- Si en el futuro aparece la venta con entrega diferida, no se resuelve relajando este `CHECK`, sino modelando el compromiso como una entidad propia (reserva o pedido pendiente). Ese sería un ADR nuevo que supera a este.

---
schema: task-brief.v1
task_id: 1.3
task_type: design
generated_at: 2026-09-11
---

# Brief: 1.3 — Decisiones de producto pendientes

## Objetivo

Cerrar las nueve decisiones abiertas que la Fase 0 dejó registradas, para que los wireframes (1.1) y la matriz de trazabilidad (1.2) no se dibujen sobre supuestos. Cada decisión queda resuelta o diferida con una fase límite explícita; ninguna queda implícita.

## Por qué 1.3 va antes que 1.1

El orden numérico no es el orden de ejecución. Seis de las nueve decisiones cambian qué hay que dibujar: si la lista de clientes muestra el teléfono completo, si la lista de conversaciones muestra una vista previa, si existe la pantalla 10, si el cliente tiene un identificador adicional, si el usuario elige zona horaria y si el ajuste de stock admite saldo negativo. Dibujar primero y decidir después obliga a rehacer wireframes.

## Alcance incluido

- Presentar cada decisión con contexto, opciones, recomendación y consecuencia sobre el modelo, las pantallas o el proceso.
- Registrar la resolución del usuario en este mismo archivo, en la sección "Resolución".
- Propagar cada resolución a los documentos afectados: [product/Screens.md](../product/Screens.md), [architecture/DataModel.md](../architecture/DataModel.md), [product/FunctionalRequirements.md](../product/FunctionalRequirements.md), [planning/Risks.md](../planning/Risks.md).
- Crear un ADR nuevo solo para las decisiones que costaría revertir (D-4 identificador de cliente, D-6 stock negativo, D-8 repositorio remoto y CI). Las demás se registran en el documento que gobiernan.

## Alcance excluido

- Wireframes (son la 1.1) y matriz de trazabilidad (la 1.2).
- Cualquier código, dependencia, migración o configuración de CI. La 1.3 decide el proveedor; la Fase 2 lo configura.
- Crear el repositorio remoto o conectar cualquier servicio externo. Eso requiere una autorización aparte del usuario.
- Reabrir decisiones ya aceptadas en los ADR 0001, 0002, 0003, 0005 y 0006.

## Archivos o componentes autorizados

- `docs/decisions/brief-1.3-decisiones-de-producto-abiertas.md` (este archivo).
- `docs/decisions/0007-*.md`, `0008-*.md`, `0009-*.md` y el índice de `docs/decisions/README.md`, solo para las decisiones que lo justifiquen.
- `docs/product/Screens.md`, `docs/product/FunctionalRequirements.md`, `docs/architecture/DataModel.md`, `docs/planning/Risks.md`.
- `CHANGELOG.md` al cerrar la subfase.

## Fuentes de verdad

`docs/product/Screens.md` (pantallas 6, 8 y 10), `docs/architecture/DataModel.md` ("Preguntas abiertas sobre el modelo"), `docs/planning/Risks.md` (índice de preguntas abiertas), `docs/planning/Roadmap.md` (Fase 1 y Fase 2), `docs/development/EngineeringStandards.md`.

## Dependencias

Fase 0 cerrada (commit `cf13247`). La 1.1 y la 1.2 dependen de esta subfase.

## Decisiones a resolver

Cada una lleva una recomendación, que no es una resolución: la resolución la da el usuario.

### D-1 — Teléfono enmascarado en la lista de clientes

- **Hoy**: `Screens.md` pantalla 6 propone mostrar solo los últimos 4 dígitos.
- **Opciones**: (a) enmascarado para todos; (b) completo para `admin`, enmascarado para `viewer`; (c) completo para todos.
- **Recomendación**: (b). El `viewer` existe para consultar actividad, no para extraer una lista de contactos; el `admin` ya puede ver el teléfono completo entrando al detalle, así que enmascararlo en la lista solo le agrega clics.
- **Consecuencia**: la búsqueda por teléfono completo sigue funcionando para ambos roles; lo que cambia es qué se renderiza, no qué se consulta.
- **Fase límite**: 1.3.

### D-2 — Vista previa del contenido de mensajes en la lista de conversaciones

- **Hoy**: `Screens.md` pantalla 8 propone no mostrarla.
- **Opciones**: (a) sin vista previa; (b) vista previa truncada del último mensaje.
- **Recomendación**: (a). El contenido del mensaje ya es visible en el detalle, y una lista es la superficie donde más fácilmente se filtra información a quien solo pasaba mirando la pantalla. La lista ya muestra fecha del último mensaje y cantidad, que es lo que sirve para priorizar.
- **Consecuencia**: la consulta de la lista no necesita traer el cuerpo del último mensaje, lo que además evita un join por fila.
- **Fase límite**: 1.3.

### D-3 — Pantalla de usuarios y roles, o script de administración

- **Hoy**: `Screens.md` pantalla 10 está marcada como pendiente. FR-ORG-02 exige gestionar miembros y roles.
- **Opciones**: (a) pantalla 10 en el MVP; (b) script de administración en la Fase 3 y pantalla diferida a después del MVP.
- **Recomendación**: (a). FR-ORG-02 pide cambiar roles y desactivar miembros con auditoría, y un script no deja rastro de quién lo corrió. Además, la regla "no se puede desactivar al último `admin`" necesita el error `BUSINESS_RULE_VIOLATION` visible en algún lado.
- **Consecuencia**: si se elige (b), FR-ORG-02 se reescribe con alcance reducido y el MVP no tiene forma auditada de cambiar un rol.
- **Fase límite**: 1.3, porque la Fase 3 la implementa.

### D-4 — Identificador único adicional de cliente

- **Hoy**: la unicidad de negocio es `(organization_id, phone_e164)`.
- **Opciones**: (a) solo teléfono; (b) agregar un código interno opcional y único cuando está presente; (c) agregar documento de identidad.
- **Recomendación**: (a) para el MVP. Los datos vienen de WhatsApp, donde el teléfono es el identificador natural. Agregar un campo opcional que nadie completa es una columna vacía, que es justo lo que el principio 8 prohíbe.
- **Consecuencia**: si el negocio ya usa un código de cliente en otro sistema, conviene saberlo ahora: agregarlo después es una migración con backfill manual. Requiere ADR porque toca una restricción de unicidad.
- **Fase límite**: 1.3.

### D-5 — Zona horaria por defecto de la organización

- **Hoy**: las métricas se calculan en la zona horaria de la organización, pero no hay valor por defecto definido.
- **Opciones**: (a) `America/Argentina/Buenos_Aires` fija en el MVP, columna presente pero no editable por pantalla; (b) editable desde el inicio.
- **Recomendación**: (a). La columna `timezone` ya está en el modelo y el cálculo la respeta; lo único que se difiere es la pantalla para cambiarla. No es una tabla especulativa: es un valor que las métricas usan desde el primer día.
- **Consecuencia**: los tests de métricas se escriben contra una zona con horario de verano histórico, no contra UTC, para que el borde quede cubierto igual.
- **Fase límite**: 1.3 el valor por defecto; la edición por pantalla se difiere sin fecha.

### D-6 — Excepciones al stock no negativo

- **Hoy**: `DataModel.md` define `CHECK (quantity_on_hand >= 0)`.
- **Opciones**: (a) sin excepciones; (b) permitir negativo con un motivo obligatorio.
- **Recomendación**: (a). Un saldo negativo suele significar que faltó registrar una entrada, no que el negocio realmente deba unidades. Con (a) el error aparece en el momento del ajuste, con `BUSINESS_RULE_VIOLATION` y el saldo actual en el mensaje.
- **Consecuencia**: si el negocio vende con entrega diferida y necesita reflejarlo, (a) lo bloquea y hay que saberlo antes de la Fase 4. Requiere ADR porque es un invariante central.
- **Fase límite**: 1.3, porque la Fase 4 implementa el ajuste.

### D-7 — Retención de mensajes

- **Hoy**: sin política definida. `Risks.md` lo marca como no bloqueante para el MVP.
- **Opciones**: (a) retención indefinida en el MVP, decisión diferida a la Fase 9; (b) definir un período ahora.
- **Recomendación**: (a) con fase límite explícita en la Fase 9. En el MVP no hay tráfico real ni volumen, así que decidir ahora sería decidir sin datos. Lo que sí conviene dejar escrito es que la decisión existe y quién la toma.
- **Consecuencia**: `messages` no lleva columna de expiración en el MVP; agregarla después es una migración aditiva, sin backfill.
- **Fase límite**: Fase 9.

### D-8 — Repositorio remoto y proveedor de CI

- **Hoy**: tres commits que existen solo en esta máquina. Sin remoto y sin CI.
- **Opciones**: (a) GitHub privado con GitHub Actions; (b) otro proveedor; (c) seguir sin remoto.
- **Recomendación**: (a), y crearlo antes de la Fase 2, no durante. La Fase 2 tiene como criterio de aceptación "CI en verde", lo que es imposible sin remoto. (c) deja todo el trabajo expuesto a una falla de disco.
- **Consecuencia**: crear el remoto y hacer el primer push son efectos externos y necesitan autorización explícita del usuario en ese turno. Requiere ADR porque condiciona la guarda de CI de la subfase 2.5.
- **Fase límite**: antes de abrir la Fase 2.

### D-9 — Validación de personas y reglas de negocio

- **Hoy**: `Personas.md` y varias reglas (quién ajusta stock, unicidad de cliente) son supuestos documentados, no confirmados por el dueño del negocio. `Risks.md` lo registra como riesgo de impacto alto.
- **Opciones**: (a) el usuario confirma o corrige los supuestos ahora; (b) se aceptan como supuestos declarados y se revisan en el piloto de la Fase 9.
- **Recomendación**: (a) al menos para las dos reglas que tocan el modelo (unicidad de cliente y quién puede ajustar stock). Las personas pueden seguir como supuesto declarado.
- **Fase límite**: 1.3 para las reglas; Fase 9 para las personas.

## Invariantes

- Ninguna resolución puede introducir Airtable, referencias al repositorio del agente de WhatsApp, ni módulos fuera del alcance del MVP.
- Ninguna resolución crea tablas ni columnas sin un consumidor concreto en el MVP.
- Toda decisión diferida queda con fase límite escrita. "Se ve más adelante" no es una resolución válida.

## Criterios de aceptación

- **AC-1**: las nueve decisiones tienen una resolución del usuario registrada en la sección "Resolución" de este archivo, con fecha.
- **AC-2**: cada resolución que contradiga la documentación vigente está propagada al documento que la gobierna, sin dejar el texto anterior contradiciendo al nuevo.
- **AC-3**: no queda ninguna marca "pendiente de confirmación" ni "Pendiente:" en `docs/product/Screens.md` ni en la sección de preguntas abiertas de `docs/architecture/DataModel.md` que corresponda a una decisión ya resuelta.
- **AC-4**: el índice de preguntas abiertas de `docs/planning/Risks.md` refleja exactamente lo que sigue abierto, ni más ni menos, y cada entrada tiene fase límite.
- **AC-5**: existen los ADR correspondientes a D-4, D-6 y D-8, indexados en `docs/decisions/README.md`, con el estado real (aceptada o propuesta).
- **AC-6**: los enlaces internos del repositorio siguen resolviendo.

## Pruebas y evidencia requerida

No aplica evidencia ejecutable: la subfase es de diseño y no produce código. La evidencia es documental — verificación de enlaces internos y contraste texto a texto de cada AC contra los archivos modificados. Nivel de validación resultante del proyecto: **diseñado**.

## Condiciones de detención

- Antes de commit, push, merge o deploy.
- Antes de crear el repositorio remoto o cualquier otro efecto externo, incluso si D-8 se resuelve a favor.
- Antes de tocar cualquier archivo fuera de la lista de autorizados.
- Antes de cambiar el estado en Notion si el usuario no confirmó el cierre.
- Si una resolución del usuario contradice un ADR ya aceptado: detenerse y plantear la contradicción, no resolverla por cuenta propia.

## Resolución

Resueltas por el usuario el **2026-09-11**. Las nueve coincidieron con la recomendación.

| Decisión | Resolución | Dónde queda registrada |
|---|---|---|
| D-1 Teléfono en la lista | Completo para `admin`, enmascarado para `viewer` | FR-CLI-06; `Screens.md` pantallas 6 y 7 |
| D-2 Vista previa de mensajes | No se muestra | FR-CONV-01; `Screens.md` pantalla 8 |
| D-3 Pantalla de usuarios y roles | Entra al MVP, la implementa la Fase 3 | FR-ORG-02; `Screens.md` pantalla 10 |
| D-4 Identificador de cliente | Solo `(organization_id, phone_e164)` | [ADR 0007](0007-identificador-de-cliente-solo-telefono.md); FR-CLI-07 |
| D-5 Zona horaria | `America/Argentina/Buenos_Aires` por defecto, sin pantalla en el MVP | `DataModel.md` (`organizations.timezone`); FR-MET-02 |
| D-6 Stock negativo | Sin excepciones | [ADR 0008](0008-stock-nunca-negativo.md); FR-PROD-08 |
| D-7 Retención de mensajes | Diferida a la Fase 9; indefinida en el MVP | `DataModel.md`, preguntas abiertas; `Risks.md` |
| D-8 Remoto y CI | GitHub privado con GitHub Actions, creado antes de abrir la Fase 2 | [ADR 0009](0009-repositorio-remoto-github-y-ci.md) |
| D-9 Quién ajusta stock | Solo `admin`, confirmando lo que ya asumía FR-PROD-06 | FR-PROD-06 (sin cambios, ahora confirmado) |
| D-9 bis Personas | Se aceptan como supuesto declarado; se contrastan en el piloto de la Fase 9 | `Risks.md`; `Personas.md` ya lo declara |

### Interpretación aplicada, no preguntada

D-1 se preguntó sobre la lista de clientes. Se extendió al detalle del cliente (pantalla 7), que mostraba el teléfono completo a cualquier rol: enmascararlo en la lista y mostrarlo entero un clic después no protegería nada. El enmascarado se resuelve en el servidor, no en el render, para que la respuesta que recibe un `viewer` no contenga el número completo.

### Consecuencias que quedan para otras subfases

- `docs/analytics/MetricsCatalog.md` no contradice nada de lo resuelto, pero conviene que su convención de zona horaria nombre el valor por defecto. Fuera de los archivos autorizados de esta subfase.
- `docs/development/TestingStrategy.md` debería sumar dos casos obligatorios: el rechazo del ajuste que dejaría stock negativo sin que quede movimiento registrado, y un cálculo de métricas cruzando un cambio de horario de verano. Fuera de los archivos autorizados de esta subfase.
- Crear el repositorio remoto y hacer el primer push siguen pendientes de autorización explícita del usuario.

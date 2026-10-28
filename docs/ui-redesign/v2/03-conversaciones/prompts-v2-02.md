# Prompts — V2-02

Modo: ImageGen integrada, una imagen por pieza. Categoría ui-mockup. Estas especificaciones finales condensan los prompts utilizados e incorporan la corrección del chat activo. Datos ficticios; no se enviaron mensajes al CRM.

## Base compartida

Create one high-fidelity Vixora CRM V2 application screenshot for iPhone retail and repairs, in accurate Spanish. Manrope typography; background #F6F5FB, white surfaces, light sidebar #F1EEFB, ink #17142E, muted #5A5573, borders #E3DFF0, primary #6D28D9, selected #EDE7FE. Amber attention, green success, red failure. Flat 1px borders, 12px corners, minimal shadows, no decorative gradients, no device/browser frame, no watermark. Desktop 16:9; mobile 9:16. Status icon plus text, readable labels, comfortable touch targets.

## 01 — Bandeja de escritorio

Grouped left sidebar Atención expanded, Conversaciones selected, Clientes and Turnos. Other groups Inicio, Catálogo e inventario, Servicio técnico, Comercial, Finanzas, Abastecimiento, Administración. Carla Méndez / Administradora. Heading Conversaciones, WhatsApp conectado. Tabs Abiertas 12, Pendientes 4, Resueltas. Search Buscar nombre o teléfono; chips Todas, Sin leer 8, Atención humana 3, Más filtros. Two panes: list with Lucía Gómez, Martín Ruiz, Ana López, Sofía Torres, Matías Pérez; selected Lucía with ¿Ya puedo retirar el iPhone?, unread 2, Abierta, Humano. Other previews ask about iPhone14, confirm appointment, payment proof, used quote. Right preview header Lucía, Abierta, Atención humana · Agente pausado, Abrir conversación. Related REP-0248 iPhone13 Cambio de batería, Listo para entregar, Ver reparación. Short preview messages and explicit Vista previa, Abrí la conversación para responder o agregar una nota. No editable preview composer.

## 02 — Chat activo

Light grouped sidebar as above. Back Conversaciones, breadcrumb Atención / Conversaciones / Lucía Gómez. Large chat with narrow context panel. Header Lucía, fictional phone, Abierta, Resolver, ellipsis. Amber banner Atención humana · Agente pausado, Las respuestas automáticas están pausadas mientras atendés, Reactivar agente. Timeline Oct27: customer14:12 Hola, ¿ya puedo retirar el iPhone?; Carla14:14 confirms battery repair finished; customer14:16 says will come at17 and asks what to bring. Amber lock note Nota interna · Carla Méndez ·14:17, Solo equipo, Solicitar el comprobante de recepción al entregar. Composer tabs Responder al cliente and Nota interna. Field Mensaje por WhatsApp, draft Traé el comprobante de recepción y tu documento. Adjuntar, Enviar mensaje; Enter/Shift+Enter hint. Context REP-0248 iPhone13 battery repair ready, appointment today17:00 Retiro de equipo Confirmado, tags Servicio técnico and Cliente, links Ver ficha, Ver reparación, Ver turno, Crear turno, Crear pedido. Correction: replace accidentally dark sidebar with #F1EEFB and remove contradictory text claiming the paused agent is drafting.

## 03 — Bandeja móvil

Vixora header and search, Conversaciones and Conectado. Tabs Abiertas12, Pendientes4, Resueltas. Search name/phone, chips Sin leer8, Atención humana3, Filtros. Five comfortable rows: Lucía14:12 unread2 attention humana with REP-0248 ready; Martín14:08 unread1 agent active; Ana13:56 unread1 agent active; Sofía13:42 unread3 human; Matías13:20 unread1 agent active. Initials avatars, message preview, time, controller text. Footer5 de12. Fixed nav Inicio, Chats selected, Clientes, Ventas, Más. No complex per-row actions.

## 04 — Chat móvil

Focused conversation without global bottom nav. Back Chats, Lucía Gómez, Abierta, Más. Amber human/paused banner and Reactivar. Context strip REP-0248 iPhone13, Listo para entregar, Ver contexto. Same timeline as desktop. Amber internal note Solo equipo, request reception receipt. Sticky composer Responder/Nota interna tabs, Mensaje por WhatsApp label, same draft, Adjuntar, Enviar mensaje. Large text and comfortable controls with no overlap.

## 05 — Notas y control

Reference image: final light desktop chat02. New conversation Martín Ruiz, MR, Abierta. Agent active banner with Las respuestas automáticas están habilitadas and Tomar conversación. Three short messages about iPhone14 128GB used black; bot answer explicitly authored Agente Vixora. Nota interna selected amber, lock, Solo el equipo puede ver esta nota. No se envía por WhatsApp. Field Nota para el equipo: Confirmar disponibilidad de iPhone14 128GB negro antes de cotizar. Guardar nota with lock, no paperplane. Helper Guardar una nota no pausa al agente. Context product interest and Disponibilidad por confirmar, Ver catálogo, tags and activity. Anchored popover Tomar atención humana, Pausa al agente para que puedas responder, Tomar conversación/Cancelar. No confirmed stock or invented price.

## 06 — Estados

Six-panel3x2 board titled Conversaciones · Estados de atención. 01 Bandeja vacía: Todavía no hay conversaciones, incoming WhatsApp explanation, Ver conexión. 02 Sin coincidencias: search iPhone azul, Sin leer filter, No encontramos conversaciones, Limpiar filtros. 03 WhatsApp desconectado: no messages can be sent, draft preserved, Revisar conexión, Envío no disponible. 04 Envío fallido: customer message bubble, No enviado, Reintentar envío, Editar mensaje, review status before retry. 05 Resuelta: conversation closed, Reabrir conversación, separate Agente pausado badge. 06 controller examples Agente activo/Tomar conversación and Atención humana · Agente pausado/Reactivar agente, one response source at a time. Footer status icon/text, visible focus, draft preservation,44px. The README defines editable drafts during disconnection and backend-confirmed delivery semantics.

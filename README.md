# Trello Link Holded Power-Up

Power-Up de Trello para vincular tarjetas con clientes y proyectos de Holded. Frontend puro, sin backend.

## Objetivo

Permitir al equipo de Eléctrica Ferrer asociar tarjetas de Trello a **clientes** y **proyectos** de Holded, de forma que al abrir una tarjeta se vea rápidamente a qué cliente/proyecto pertenece.

## Arquitectura

- **Frontend puro** — HTML + TypeScript (Vite)
- **Sin backend** — las llamadas a la API de Holded se hacen directamente desde el Power-Up
- **Hosting** — GitHub Pages (gratis, HTTPS automático)
- **Almacenamiento** — Trello Power-Up storage (`t.set('card', 'shared', ...)`)

## Funcionalidades

### 1. Vincular cliente a tarjeta

- Botón en la tarjeta: "Vincular cliente"
- Se abre popup con campo de búsqueda
- Búsqueda contra `GET https://api.holded.com/api/invoicing/v1/contacts?search=...`
- El usuario selecciona un cliente de la lista
- Se guarda en la tarjeta: `{ holdedContactId, holdedContactName }`
- Se muestra en el card-back-section y como badge

### 2. Vincular proyecto a tarjeta

- Botón en la tarjeta: "Vincular proyecto"
- Se abre popup con lista de proyectos (con búsqueda/filtro)
- Datos de `GET https://api.holded.com/api/invoicing/v1/projects`
- El usuario selecciona un proyecto
- Se guarda en la tarjeta: `{ holdedProjectId, holdedProjectName }`
- Se muestra en el card-back-section y como badge

### 3. Card-back-section

Sección visible al abrir la tarjeta que muestra:
- Cliente vinculado (nombre, con opción de desvincular)
- Proyecto vinculado (nombre, con opción de desvincular)
- Links directos a Holded (si la URL es predecible)

### 4. Badges

Badges visibles en la vista de tablero:
- Badge con icono de persona + nombre del cliente
- Badge con icono de carpeta + nombre del proyecto

## Configuración del API Key

- El API key de Holded se configura a nivel de **board** (`t.set('board', 'shared', { holdedApiKey })`)
- Un **board button** "Configurar Holded" permite introducir/actualizar el API key
- Solo necesita configurarse una vez por tablero

## Stack técnico

- **Vite** — bundler
- **TypeScript** — tipado
- **Vanilla JS/HTML** — sin framework (el Power-Up es ligero)
- **Trello Power-Up SDK** — `https://p.trellocdn.com/power-up.min.js`

## Estructura de archivos

```
trello-link-holded-power-up/
├── index.html              # Entry point del Power-Up (registro de capabilities)
├── src/
│   ├── connector.ts        # Inicialización del Power-Up (TrelloPowerUp.initialize)
│   ├── holded-api.ts       # Cliente HTTP para la API de Holded
│   ├── storage.ts          # Helpers para leer/escribir en Trello storage
│   ├── types.ts            # Tipos TypeScript (Contact, Project, StoredData)
│   ├── capabilities/
│   │   ├── card-buttons.ts     # Botones "Vincular cliente/proyecto"
│   │   ├── card-back-section.ts # Sección en el detalle de la tarjeta
│   │   ├── card-badges.ts      # Badges en vista de tablero
│   │   └── board-buttons.ts    # Botón "Configurar Holded"
│   └── popups/
│       ├── search-contact.html # Popup de búsqueda de clientes
│       ├── search-contact.ts
│       ├── search-project.html # Popup de búsqueda de proyectos
│       ├── search-project.ts
│       └── settings.html       # Popup de configuración (API key)
│       └── settings.ts
├── public/
│   ├── icon.svg            # Icono del Power-Up
│   └── manifest.json       # Manifest del Power-Up (opcional)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## API de Holded — Endpoints necesarios

| Endpoint | Método | Uso |
|---|---|---|
| `/api/invoicing/v1/contacts` | GET | Listar/buscar clientes |
| `/api/invoicing/v1/contacts/:id` | GET | Obtener detalle de un cliente |
| `/api/invoicing/v1/projects` | GET | Listar proyectos |

Headers requeridos: `key: {HOLDED_API_KEY}`

## Datos almacenados en cada tarjeta

```typescript
interface CardHoldedData {
  contactId?: string;
  contactName?: string;
  projectId?: string;
  projectName?: string;
}
```

Se almacena con `t.set('card', 'shared', 'holdedData', data)` (máx ~4KB por card, más que suficiente).

## Deploy

1. `npm run build` — genera `dist/`
2. Deploy `dist/` a GitHub Pages (o cualquier hosting estático con HTTPS)
3. En Trello: crear Power-Up custom apuntando a la URL del hosting

## Seguridad

- El API key de Holded queda en el storage del board (visible para miembros del board)
- Aceptable para uso interno del equipo
- Si se necesita más seguridad en el futuro: añadir un proxy backend (Cloudflare Worker / GAS)

## Pasos de implementación

1. **Scaffold** — Inicializar proyecto con Vite + TS
2. **Connector** — Registro del Power-Up con capabilities básicas
3. **Settings** — Board button para configurar API key
4. **Holded API client** — Módulo para llamar a la API de Holded
5. **Búsqueda de clientes** — Popup + vinculación a tarjeta
6. **Búsqueda de proyectos** — Popup + vinculación a tarjeta
7. **Card-back-section** — Mostrar datos vinculados
8. **Badges** — Mostrar cliente/proyecto en vista de tablero
9. **Deploy** — Configurar GitHub Pages + registrar Power-Up en Trello

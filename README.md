# Trello Link Holded Power-Up

Power-Up de Trello para vincular tarjetas con clientes y proyectos de [Holded](https://www.holded.com/).

## Arquitectura

```
┌─────────────────────┐       ┌──────────────────────────┐       ┌─────────────────┐
│   Trello (browser)  │──────▶│   Cloudflare Pages       │       │  Holded API     │
│                     │       │   Frontend (Vite + TS)   │       │                 │
└─────────────────────┘       └──────────────────────────┘       └────────▲────────┘
                                        │                                 │
                                        │ fetch                           │ key: SECRET
                                        ▼                                 │
                              ┌──────────────────────────┐                │
                              │   Cloudflare Worker      │────────────────┘
                              │   holded-proxy           │
                              │   (API key como secret)  │
                              └──────────────────────────┘
```

- **Frontend** — Vite + TypeScript, sin framework. Hosted en Cloudflare Pages.
- **Worker** — Proxy en Cloudflare Workers que inyecta el API key de Holded. El frontend nunca toca la API key.
- **Storage** — Trello Power-Up storage (`t.set('card', 'shared', ...)`) para guardar los datos por tarjeta.

## Funcionalidades

### Vincular cliente/proyecto

Botones en cada tarjeta para buscar y vincular un cliente o proyecto de Holded. La búsqueda es flexible: divide las palabras del query, ignora acentos y orden, y busca en nombre, email, CIF/NIF, nombre comercial.

### Crear contacto

Desde el popup de búsqueda de clientes se puede crear un nuevo contacto directamente, con formulario que incluye:
- Nombre, DNI/CIF, tipo (persona/empresa), email, teléfono
- Dirección completa de facturación (calle, ciudad, código postal, provincia, país)
- Validación de campos obligatorios y formatos de email/teléfono
- El contacto creado se vincula automáticamente a la tarjeta
- Se añade una nota con el nombre del creador y el tablero de origen

### Direcciones

Al vincular un cliente, se puede seleccionar o crear una dirección de envío. La dirección seleccionada se muestra en el card-back junto al tag del cliente (primeros 8 caracteres + tooltip con la dirección completa).

### Card-back section

Al abrir una tarjeta se muestra una sección "Holded" con tags de color:
- **Azul** — cliente vinculado (click abre en Holded), con etiqueta de dirección si existe
- **Verde** — proyecto vinculado (click abre en Holded)
- Hover muestra botón para desvincular (con confirmación)

### Badges

En la vista de tablero, las tarjetas muestran badges con icono + nombre del cliente/proyecto vinculado.

### Sección en la descripción

Al vincular un cliente o proyecto, se mantiene al final de la descripción una sección
**Cliente y proyecto** con enlaces directos al cliente, proyecto y acciones de la app.
La dirección seleccionada también aparece como enlace universal de Google Maps cuando
se dispone de su dirección completa. Los tags de búsqueda nativa permanecen al final:

```
{{ contact: Nombre del cliente }}
{{ project: Nombre del proyecto }}
```

Esto permite usar la **búsqueda nativa de Trello** para encontrar tarjetas por cliente o proyecto. Al desvincular, el tag se elimina automáticamente de la descripción.

## Requisitos previos

- [Node.js](https://nodejs.org/) >= 18
- Cuenta de [Cloudflare](https://www.cloudflare.com/) (gratuita)
- API key de [Holded](https://app.holded.com/api)
- Acceso a un tablero de Trello para crear el Power-Up

## Instalación

```bash
git clone https://github.com/miquelferrerllompart/trello-link-holded-power-up.git
cd trello-link-holded-power-up
npm install
```

## Desarrollo local

```bash
npm run dev
```

Abre `http://localhost:5173` — aunque para probar el Power-Up necesitas registrarlo en Trello apuntando a esa URL (o usar un túnel como ngrok).

## Estructura del proyecto

```
trello-link-holded-power-up/
├── index.html                    # Entry point del Power-Up
├── src/
│   ├── connector.ts              # Registro de capabilities (TrelloPowerUp.initialize)
│   ├── holded-api.ts             # Cliente HTTP → proxy worker
│   ├── storage.ts                # Helpers para Trello card storage
│   ├── types.ts                  # Interfaces TypeScript
│   ├── icons.ts                  # URLs de iconos centralizadas
│   ├── search-utils.ts            # Búsqueda flexible (acentos, orden de palabras)
│   ├── search-utils.test.ts       # Tests de búsqueda
│   ├── description-tags.ts       # Helpers para tags {{ contact/project: ... }} en descripción
│   ├── trello-api.ts             # OAuth + PUT descripción vía Trello REST API
│   ├── capabilities/
│   │   ├── card-buttons.ts       # Botones "Vincular cliente/proyecto"
│   │   ├── card-badges.ts        # Badges en vista de tablero
│   │   └── card-back-section.ts  # Sección iframe en detalle de tarjeta
│   └── popups/
│       ├── search-contact.html   # Popup búsqueda de clientes
│       ├── search-contact.ts
│       ├── create-contact.html   # Popup creación de contacto
│       ├── create-contact.ts
│       ├── select-address.html   # Popup selección de dirección
│       ├── select-address.ts
│       ├── search-project.html   # Popup búsqueda de proyectos
│       └── search-project.ts
├── public/
│   ├── card-back.html            # Iframe del card-back (inline JS por CSP)
│   └── icons/                    # SVGs para iconos
│       ├── contact.svg           # Sin fill (Trello coloriza)
│       ├── contact-light.svg
│       ├── contact-dark.svg
│       ├── project.svg
│       ├── project-light.svg
│       ├── project-dark.svg
│       └── holded-light.svg
├── worker/
│   ├── index.ts                  # Cloudflare Worker (proxy API)
│   └── wrangler.toml             # Config del worker
├── vite.config.ts
├── tsconfig.json
├── package.json
└── CLAUDE.md                     # Guía para asistentes AI
```

## Deploy

### 1. Configurar las API keys de Holded en el Worker

```bash
echo "TU_API_KEY_V2_DE_HOLDED" | npx wrangler secret put HOLDED_API_V2 --name holded-proxy
```

`HOLDED_API_KEY` se mantiene para llamadas legacy V1 si se necesita actualizar direcciones de envío existentes.

### 2. Desplegar el Worker

```bash
cd worker
npx wrangler deploy
cd ..
```

El worker queda en `https://holded-proxy.electricaferrer.workers.dev`.

### 3. Build y deploy del frontend

```bash
npm run build
npx wrangler pages deploy dist --project-name trello-link-holded-power-up
```

El frontend queda en `https://trello-link-holded-power-up.pages.dev`.

### 4. Registrar el Power-Up en Trello

1. Ir a [trello.com/power-ups/admin](https://trello.com/power-ups/admin)
2. Crear nuevo Power-Up
3. URL del iframe connector: `https://trello-link-holded-power-up.pages.dev/`
4. Capabilities a activar: `card-buttons`, `card-badges`, `card-back-section`
5. Allowed origins: `https://trello-link-holded-power-up.pages.dev` (necesario para OAuth)

## Stack técnico

| Componente | Tecnología |
|---|---|
| Frontend | Vite + TypeScript (vanilla, sin framework) |
| Hosting frontend | Cloudflare Pages |
| Proxy API | Cloudflare Workers |
| SDK | [Trello Power-Up SDK](https://developer.atlassian.com/cloud/trello/power-ups/) |
| API | [Holded API v2](https://www.holded.com/es/desarrolladores/referencia-api) |

## API de Holded (endpoints utilizados)

| Endpoint | Uso |
|---|---|
| `GET /contacts/search?q=` | Buscar contactos en V2 por nombre, CIF/NIF, email, telefono y movil |
| `POST /api/v2/contacts` | Crear nuevo contacto |
| `GET /projects/search?q=` | Buscar proyectos (cache KV de 15 minutos) |
| `GET /sales-orders/search?contactId=&projectId=` | Listar pedidos de venta por contacto y filtrar por proyecto |
| `GET /documents/search?contactId=&projectId=&type=&scope=&page=&pageSize=10` | Listar una página de pedidos de venta, albaranes o presupuestos para la pestaña activa del card back |
| `PUT /api/invoicing/v1/contacts/:id` | Legacy V1 para actualizar direcciones de envio, si hay API key V1 configurada |

La busqueda de contactos ya no cachea clientes: el Worker consulta V2 en paralelo y fusiona resultados. Proyectos se mantienen cacheados en KV por volumen y estabilidad.

Los documentos se descargan siguiendo todos los cursores de Holded y se cachean en KV durante 5 minutos por cliente y tipo. Después se filtran por proyecto y se devuelven en páginas de 10; así no se pierden coincidencias que estén después de los primeros 100 documentos del cliente. El estado de envío se consulta solo para los pedidos de venta visibles.

## Datos almacenados por tarjeta

```typescript
interface CardHoldedData {
  contactId?: string;    // ID del contacto en Holded
  contactName?: string;  // Nombre del contacto
  projectId?: string;    // ID del proyecto en Holded
  projectName?: string;  // Nombre del proyecto
  addressLabel?: string; // Dirección seleccionada (resumen)
  addressMapQuery?: string; // Dirección completa para Google Maps
}
```

Almacenado con `t.set('card', 'shared', 'holdedData', data)` (max ~4KB, más que suficiente).

Además, los tags `{{ contact: ... }}` y `{{ project: ... }}` se escriben en la descripción de la tarjeta vía Trello REST API (OAuth) para permitir búsqueda nativa.

## Seguridad

- El API key de Holded se almacena como **secret** en Cloudflare Workers (nunca expuesto al frontend)
- El Worker permite GET (lectura), POST (crear contacto) y PUT (actualizar contacto)
- CORS configurado con `Access-Control-Allow-Origin: *` (necesario para que Trello pueda llamar al worker)

## Licencia

Proyecto privado de uso interno.

# Messenger Bulk Delete

Extensión de navegador (Chrome / Edge, basada en Manifest V3) que automatiza la eliminación masiva de conversaciones en **Facebook Messenger Web**, sin tener que borrarlas una por una.

## ✨ Características

- Botón flotante directamente en la página de mensajes.
- Popup con estado de la pestaña activa y progreso en tiempo real.
- Notificaciones del sistema al finalizar el proceso (cuántos chats se eliminaron).
- Guarda el historial de la última ejecución (`chrome.storage.local`).
- Funciona tanto en `messenger.com` como en `facebook.com/messages`.

## ⚠️ Aviso importante

- La eliminación es **irreversible** desde el lado de la extensión: una vez borrado un chat, no se puede deshacer.
- Solo elimina la conversación **de tu lado** — la otra persona sigue viendo su copia del chat, tal como funciona nativamente el "Eliminar chat" de Messenger.
- No envía ningún dato a servidores externos: todo corre localmente en tu navegador, sobre tu propia sesión.
- Mantén la pestaña de Messenger abierta y visible mientras el proceso corre.

## 🚀 Instalación (modo desarrollador)

Mientras no esté publicada en una tienda de extensiones:

1. Descarga o clona este repositorio.
2. Abre `chrome://extensions` (o `edge://extensions` en Edge).
3. Activa **Modo de desarrollador** (arriba a la derecha).
4. Haz clic en **Cargar descomprimida** y selecciona la carpeta del proyecto.
5. Verás el ícono de la extensión en la barra de herramientas.

## 🖱️ Uso

1. Abre [facebook.com/messages](https://www.facebook.com/messages) o [messenger.com](https://www.messenger.com).
2. Haz clic en el ícono de la extensión (o en el botón flotante dentro de la página).
3. Presiona **"Eliminar todos los chats"**.
4. Sigue el progreso desde el popup o el botón flotante — no cierres la pestaña hasta que termine.

## 🔐 Permisos utilizados

| Permiso | Para qué se usa |
|---|---|
| `activeTab` | Interactuar con la pestaña de Messenger que tienes abierta |
| `storage` | Guardar el progreso y la última ejecución |
| `notifications` | Avisarte cuando termine el proceso |
| `host_permissions` (facebook.com / messenger.com) | Leer y hacer clic sobre los elementos de la lista de chats |

## 🗂️ Estructura del proyecto

```
├── manifest.json
├── background.js      # Maneja notificaciones y progreso
├── content.js          # Lógica de detección y eliminación de chats
├── popup.html / popup.js
├── styles.css           # Estilos del botón flotante
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 🛠️ Tecnologías

- JavaScript (Vanilla)
- Chrome Extensions API (Manifest V3)

## 📄 Licencia

Este proyecto se publica tal cual, sin garantías. Úsalo bajo tu propia responsabilidad.

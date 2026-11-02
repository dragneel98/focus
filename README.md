# Foco

Foco es una aplicación de productividad personal para organizar tareas diarias, trabajar en ciclos de enfoque y revisar el tiempo que realmente completaste. Está construida con React, TypeScript y Tauri.

## Funcionalidades

- **Tareas diarias:** crea y edita tareas, asígnales una estimación y un color, selecciónalas para enfocar o archívalas cuando ya no quieras que se repitan.
- **Temporizador de enfoque y descanso:** trabaja en ciclos configurables, consulta el tiempo restante y registra el progreso al completar un ciclo de enfoque.
- **Progreso y estadísticas:** consulta tareas completadas, ciclos y minutos acreditados; explora resúmenes por período y tiempo enfocado por tarea.
- **Preferencias personales:** ajusta la duración del enfoque y del descanso, y elige entre tema claro y oscuro.
- **Notificaciones:** recibe un aviso al terminar un ciclo si habilitaste las notificaciones del sistema; la app también muestra un aviso dentro de la interfaz.
- **Datos locales:** las tareas, sesiones y preferencias se almacenan en el dispositivo. La aplicación no requiere una cuenta ni un servicio en la nube.

> El tiempo se acredita únicamente al completar un ciclo de enfoque. Las pausas y los ciclos interrumpidos no suman minutos.

## Requisitos

- Node.js y npm
- Rust y los requisitos de compilación de Tauri 2 para tu sistema operativo

Consulta la [guía oficial de prerrequisitos de Tauri](https://v2.tauri.app/start/prerequisites/) para preparar el entorno nativo.

## Desarrollo

```sh
npm install
npm run tauri dev
```

Para ejecutar la interfaz web en el navegador durante el desarrollo:

```sh
npm run dev
```

## Verificación y compilación

```sh
npm test
npm run build
```

Para generar los instaladores nativos:

```sh
npm run tauri build
```

## Tecnologías

- React y TypeScript
- Vite
- Tauri 2
- Zustand
- Recharts
- Vitest y Testing Library

## Privacidad

Foco guarda los datos de productividad localmente en el dispositivo. No cargues información sensible en reportes públicos del repositorio. Las notificaciones dependen de los permisos del sistema operativo.

## Estado del proyecto

Foco está en desarrollo. Las funcionalidades y los requisitos de instalación pueden cambiar.

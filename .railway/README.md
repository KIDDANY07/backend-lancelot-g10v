# Infraestructura de Railway (servicio de ML)

`railway.ts` define en código la configuración del servicio `lancelot-ml` y de su volumen. Es un **parcial con nombre** (`ml`): no gestiona el backend, el frontend ni Postgres, y no lee ni escribe variables.

Qué fija:

- Construcción con `ml-service/Dockerfile` desde la carpeta `ml-service`.
- Despliegue solo cuando cambia algo dentro de `ml-service/` (no en cada push del backend).
- Espera a que pase la CI de GitHub (`.github/workflows/ml-service.yml`) antes de desplegar.
- Health check en `/health` (hasta 120 s): si la versión nueva no responde, sigue la anterior.
- Volumen `lancelot-ml-volume` montado en `/app/models`, donde viven los modelos entrenados. El reinicio ante fallos usa el valor por defecto de Railway (hasta 10 intentos).

Railway no lee este archivo al desplegar: los cambios se aplican con la CLI desde la raíz del repositorio.

```bash
cd .railway && npm install && cd ..
railway config plan    # solo muestra los cambios
railway config apply   # aplica los cambios después de confirmar
```

Si un cambio en la interfaz de Railway contradice este archivo, el próximo `apply` lo revierte: haz los cambios del servicio de ML aquí.

# Lancelot ML: microservicio de la fase 2

Microservicio en Python (FastAPI y scikit-learn) que entrena y sirve el modelo de aprendizaje automático para estimar el **riesgo de lesión sin contacto**. Es la fase 2 del módulo de apoyo a la decisión del backend Lancelot.

La fase 2 está **condicionada a tener al menos una temporada completa de datos etiquetados** (Rossi et al., 2018; Van Eetvelde et al., 2021). Mientras no se cumpla, el backend sigue funcionando solo con las reglas de la fase 1.

> ⚠️ **Datos sintéticos.** Las métricas que se obtienen con datos sintéticos (`scripts/generate_synthetic.py`) **no representan el desempeño real del modelo y no deben reportarse como resultados** del trabajo de grado. Esos datos solo sirven para comprobar que el pipeline funciona de extremo a extremo. Los modelos entrenados con datos sintéticos o insuficientes quedan registrados con `is_synthetic = true`, y el backend **nunca** permite activarlos.

## Cómo encaja con el backend

1. El backend genera cada día, a las 5 AM, un snapshot de variables por deportista en la tabla `athlete_daily_features` y etiqueta retroactivamente cada día con `label_injury_7d`: si hubo una lesión sin contacto en los 7 días siguientes.
2. Cuando hay datos suficientes (`GET /api/ml/readiness`), se llama a `POST /train` en este servicio. El servicio entrena, compara con las reglas de la fase 1 y registra el modelo en el backend (`POST /api/ml/models`).
3. Un administrador activa el modelo en el backend (`PUT /api/ml/models/id/:id/activate`). La activación exige:
   - que el modelo no sea sintético;
   - que se cumpla la readiness;
   - que el modelo supere a las reglas en PR-AUC.
4. Con el motor en modo `shadow` o `ml`, el backend llama a `POST /predict` cada día. Si este servicio falla, el backend sigue con las reglas.

## Configuración

Copie `.env.example` a `.env` y complete los valores:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión de **solo lectura** a PostgreSQL. Solo se consulta la tabla `athlete_daily_features`. Se recomienda un usuario con permiso `SELECT` únicamente sobre esa tabla. |
| `BACKEND_URL` | URL base del backend Nest, sin `/api`. |
| `ML_SERVICE_API_KEY` | La misma clave que `ML_SERVICE_API_KEY` en el backend. Se usa en la cabecera `x-api-key` en ambos sentidos. |
| `MODELS_DIR` | Carpeta donde se guardan los modelos entrenados (`.joblib`). |
| `BACKEND_TIMEOUT_SECONDS` | Tiempo máximo de espera de las llamadas al backend (por defecto 10). |

Ejemplo de usuario de solo lectura:

```sql
CREATE ROLE lancelot_ml_readonly LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE lancelot TO lancelot_ml_readonly;
GRANT USAGE ON SCHEMA public TO lancelot_ml_readonly;
GRANT SELECT ON athlete_daily_features TO lancelot_ml_readonly;
```

## Ejecución local

En Windows:

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --env-file .env
```

En Linux o macOS, active el entorno con `source .venv/bin/activate`.

En el `.env` del backend configure `ML_SERVICE_URL=http://localhost:8000`.

## Docker

```bash
docker build -t lancelot-ml ./ml-service
docker run --env-file ml-service/.env -p 8000:8000 -v lancelot-models:/app/models lancelot-ml
```

## Endpoints

| Método | Ruta | Protección | Descripción |
|---|---|---|---|
| GET | `/health` | Ninguna | Estado del servicio y modelo cargado. |
| POST | `/predict` | `x-api-key` | Recibe `{ model_version, features }` y devuelve `{ probability, top_factors: [{ feature, contribution }], model_version }`. |
| POST | `/train` | `x-api-key` | Recibe `{ source: "db" \| "csv", csv_path, allow_insufficient_data }`. Entrena, guarda y registra el modelo. |

`/predict` solo recibe variables numéricas del snapshot. El backend aplica una lista blanca, así que nunca llegan nombres, correos, fechas de nacimiento ni `id_user`, de acuerdo con la Ley 1581 de 2012.

### Reglas de `/train`

- **Readiness:** antes de entrenar se consulta `GET /api/ml/readiness`.
  - Si no se cumple y `allow_insufficient_data` es `false`, responde **409** con los criterios pendientes.
  - Si no se cumple y `allow_insufficient_data` es `true`, entrena igual, pero registra el modelo como sintético.
- **Fuente CSV:** un entrenamiento con `source: "csv"` siempre se registra como sintético. El CSV no se puede verificar como dato real del club, así que los modelos activables se entrenan desde la base de datos.
- **Filas usadas:** solo las que tienen `label_quality = 'labeled'`, `is_available = true` y la misma `feature_version` (`v1`).

## Metodología de entrenamiento

- **Partición temporal, no aleatoria.** El último 20 % de las fechas forma el conjunto de prueba. Así no hay fuga de información del futuro hacia el entrenamiento (hay un test que lo verifica).
- **Modelos candidatos:**
  - Línea base interpretable: `LogisticRegression(class_weight="balanced")` con imputación por mediana y `StandardScaler`.
  - Candidato no lineal: `RandomForestClassifier(class_weight="balanced")` con imputación por mediana.
- **Selección por PR-AUC** en el conjunto de prueba. Las lesiones son eventos raros, así que **no se usa accuracy**.
- **Métricas reportadas:** ROC-AUC, PR-AUC, recall, precision y Brier, más `n_train`, `n_test` y `positives_test`. Recall y precision usan el umbral 0.5 sobre la probabilidad.
- **Línea base de reglas:** se calculan las mismas métricas sobre el mismo conjunto de prueba usando `rules_risk_level` (alto = 1, medio = 0.5, sin alerta = 0). Medio o alto cuenta como positivo. El Brier de las reglas usa esa misma escala y es solo orientativo.
- **Explicabilidad:** cada predicción devuelve los 3 factores con mayor contribución absoluta.
  - En la regresión logística, la contribución es el coeficiente por el valor estandarizado.
  - En el bosque aleatorio, se usan los valores SHAP (`shap.TreeExplainer`).
- **Versionado:** cada modelo se guarda como `MODELS_DIR/<version>.joblib`. La versión indica el algoritmo, la fecha y, si aplica, el sufijo `-synthetic`.

### Variables (`feature_version = v1`)

`age_years`, `acute_load_7d`, `chronic_load_28d`, `acwr`, `acwr_ewma`, `monotony_7d`, `strain_7d`, `sessions_7d`, `rpe_avg_7d`, `match_minutes_7d`, `high_rpe_sessions_14d`, `prior_injuries_count`, `prior_non_contact_injuries_count`, `days_since_last_injury`, `is_recovering`.

`rules_risk_level` no se usa como variable: se reserva para la comparación con la fase 1.

## Probar el pipeline con datos sintéticos

```bash
python scripts/generate_synthetic.py --output data/synthetic_features.csv
curl -X POST http://localhost:8000/train \
  -H "x-api-key: <clave>" -H "Content-Type: application/json" \
  -d '{"source": "csv", "csv_path": "data/synthetic_features.csv", "allow_insufficient_data": true}'
```

El script nunca escribe en la base de datos. El modelo resultante queda registrado como sintético y **no puede activarse**. Recuerde que **sus métricas no son resultados reportables**.

## Tests

```bash
pytest
```

Cubren:
- el orden y los nombres de las variables, contrastados con la lista blanca y la exportación del backend;
- la partición temporal sin fuga;
- la selección por PR-AUC y la línea base de reglas;
- la explicabilidad de ambos modelos;
- la forma de la salida de `/predict`;
- el rechazo de `/train` sin datos suficientes.

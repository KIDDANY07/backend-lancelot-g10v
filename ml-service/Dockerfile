FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MODELS_DIR=/app/models

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts ./scripts

RUN mkdir -p /app/models && useradd --create-home mlservice && chown -R mlservice /app
USER mlservice

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host :: --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]

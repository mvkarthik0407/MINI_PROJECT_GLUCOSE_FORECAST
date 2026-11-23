FROM node:22-slim AS frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home --uid 10001 appuser
COPY backend ./backend
COPY frontend/index.html ./frontend/index.html
COPY --from=frontend-build /frontend/dist ./frontend/dist
COPY scripts ./scripts
COPY models ./models
COPY scalers ./scalers
RUN chown -R appuser:appuser /app

ENV APP_ENV=production
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
USER appuser

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

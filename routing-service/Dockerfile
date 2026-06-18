# OSMnx Routing Service Dockerfile
# Based on: https://geoffboeing.com/2016/11/osmnx-python-street-networks/

FROM python:3.11-slim

# Install system dependencies for OSMnx
RUN apt-get update && apt-get install -y \
    libgeos-dev \
    libproj-dev \
    libgdal-dev \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create cache directories
RUN mkdir -p /app/osmnx_cache /app/route_cache

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Run the service
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]

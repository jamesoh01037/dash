#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  Junior AI Agent - GCP VM 자동 설치 시작  "
echo "=========================================="

# 1. 2GB Swap 메모리 생성 (무료 티어 e2-micro 1GB RAM 환경에서 메모리 부족 방지)
if [ ! -f /swapfile ]; then
  echo "[1/4] 2GB Swap 메모리 설정 중..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
else
  echo "[1/4] Swap 메모리가 이미 설정되어 있습니다."
fi

# 2. Docker & Docker Compose 설치
if ! command -v docker &> /dev/null; then
  echo "[2/4] Docker 설치 중..."
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
else
  echo "[2/4] Docker가 이미 설치되어 있습니다."
fi

# 3. 현재 VM 외부 IP 확인 및 .env 자동 안내
echo "[3/4] 환경 파일(.env) 확인 중..."
EXTERNAL_IP=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip || echo "")
if [ -n "$EXTERNAL_IP" ]; then
  AUTO_DOMAIN="${EXTERNAL_IP}.sslip.io"
else
  AUTO_DOMAIN=":80"
fi

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|JUNIOR_DOMAIN=.*|JUNIOR_DOMAIN=${AUTO_DOMAIN}|g" .env
  echo "  -> .env 파일이 생성되었습니다! (도메인: https://${AUTO_DOMAIN})"
  echo "  -> nano .env 명령으로 GEMINI_API_KEY 와 JUNIOR_ACCESS_PASSWORD 를 꼭 입력해 주세요."
else
  echo "  -> 기존 .env 파일을 유지합니다."
fi

# 4. Docker Compose 실행
echo "[4/4] Junior 컨테이너 빌드 및 실행 중..."
mkdir -p data
sudo docker compose up -d --build

echo ""
echo "=========================================="
echo "  설치 및 실행이 완료되었습니다!"
if [ -n "$EXTERNAL_IP" ]; then
  echo "  접속 주소 (자동 HTTPS): https://${AUTO_DOMAIN}"
  echo "  Google OAuth 리다이렉트 URI 예시:"
  echo "    https://${AUTO_DOMAIN}/api/google/oauth/callback"
fi
echo "=========================================="

# Junior — GCP(Google Cloud Platform) 무료 서버 배포 가이드

서버 설정을 전혀 모르셔도 아래 순서대로 **클릭과 복사/붙여넣기만** 하시면 GCP 무료 VM(`e2-micro`)에서 24시간 접속 가능한 나만의 Junior 서버(자동 HTTPS 포함)를 띄우실 수 있습니다.

---

## 1단계: GCP에서 무료 서버(VM) 만들기

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속하여 프로젝트 선택 후 좌측 메뉴에서 **Compute Engine → VM 인스턴스**로 이동합니다.
2. 상단의 **[인스턴스 만들기]**를 클릭합니다.
3. 아래 항목만 맞춰 주시면 **상시 무료(Always Free) 티어**로 생성됩니다:
   - **이름**: `junior-server`
   - **리전**: `us-west1 (오리건)` 또는 `us-central1 (아이오와)` 중 선택 *(무료 티어 대상 리전)*
   - **머신 구성 → 시리즈**: `E2` → **머신 유형**: `e2-micro (vCPU 2개, 메모리 1GB)`
   - **부팅 디스크**: `[변경]` 클릭 → 운영체제 **Ubuntu 22.04 LTS**, 크기 **30GB** (표준 영구 디스크)
   - **방화벽**: ✅ **HTTP 트래픽 허용**, ✅ **HTTPS 트래픽 허용** 둘 다 체크
4. 하단의 **[만들기]** 버튼을 누릅니다.

---

## 2단계: 서버에 Junior 코드 올리고 원클릭 실행하기

VM 목록에서 방금 만든 `junior-server` 옆의 **[SSH]** 버튼을 클릭해 검은 터미널 창을 엽니다.

### A. 코드 가져오기
- Git 저장소를 사용 중이시라면:
  ```bash
  git clone <본인의_GitHub_저장소_URL> Junior
  cd Junior
  ```
- 또는 Mac에 있는 `Junior` 폴더를 압축해서 SSH 창 우측 상단의 **[파일 업로드]** 버튼으로 올리신 뒤 압축을 푸셔도 됩니다. *(단, `node_modules`와 `.next` 폴더는 빼고 올리세요!)*

### B. 원클릭 설치 스크립트 실행
SSH 창에 아래 2줄을 그대로 복사해서 붙여넣고 엔터를 누릅니다:
```bash
chmod +x deploy/gcp-setup.sh
./deploy/gcp-setup.sh
```
스크립트가 알아서:
1. 1GB 메모리 부족을 막아주는 **2GB 가상 메모리(Swap)** 를 만들고,
2. **Docker** 를 설치하고,
3. 서버의 외부 IP를 읽어 **자동 HTTPS 무료 도메인(`https://<서버IP>.sslip.io`)** 을 설정한 뒤,
4. Junior 앱을 빌드하고 실행합니다.

---

## 3단계: API 키와 접속 비밀번호 입력하기

설치 후 아래 명령어로 설정 파일을 엽니다:
```bash
nano .env
```
아래 항목을 채워 넣고 `Ctrl + O` → `Enter` → `Ctrl + X` 로 저장합니다:
- `GEMINI_API_KEY`: Google AI Studio API 키
- `JUNIOR_ACCESS_PASSWORD`: 외부에서 아무나 못 들어오게 할 나만의 접속 비밀번호 (예: `mysecret1234`, 아이디는 아무거나 입력 가능)

저장 후 아래 한 줄을 입력하면 설정이 즉시 반영됩니다:
```bash
sudo docker compose up -d
```

---

## 4단계: Google OAuth 리다이렉트 URL 추가 (Gmail / Drive 연동용)

설치 완료 화면에 표시된 주소(예: `https://34.xxx.xxx.xxx.sslip.io`)로 브라우저에서 접속합니다.

Gmail, Drive, 주소록 등을 계속 연동하시려면 **GCP Console → API 및 서비스 → 사용자 인증 정보**에서 기존 OAuth 클라이언트를 열어 **승인된 리다이렉트 URI**에 새 서버 주소를 추가해 주세요.
(예: `https://34.xxx.xxx.xxx.sslip.io/api/google/oauth/callback` 등 사용 중인 콜백 주소)

---

## 자주 쓰는 관리 명령어
- **서버 로그 확인**: `sudo docker compose logs -f`
- **Junior 업데이트 후 재시작**: `sudo docker compose up -d --build`
- **데이터 백업**: `Junior/data/store.json` 파일만 복사해 두시면 모든 기억·대화·할 일이 백업됩니다.

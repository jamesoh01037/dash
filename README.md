# 🤖 Junior - James의 퍼스널 AI 에이전트 Webapp

James님의 일상, 업무, 개발, 일정 관리를 1대1로 밀착 보조하는 지능형 웹 에이전트 **Junior**입니다.

---

## ✨ 핵심 기능

1. **💬 실시간 스트리밍 대화 (Chat UI)**
   - Google Gemini API 기반 초고속 스트리밍 응답
   - 마크다운 파싱, 코드 문법 강조(Syntax Highlighting), 원클릭 코드 복사
   - PDF, 이미지, 문서, 코드 파일 첨부 및 멀티모달 분석 지원

2. **🌐 실시간 웹 검색 도구 (Web Grounding)**
   - 대화 중 최신 뉴스, 날씨, 기술 자료, 실시간 정보가 필요할 때 자동으로 웹 검색 수행
   - 출처 링크 및 검색 요약 카드 실시간 시각화

3. **📅 할 일 & 일정 대시보드 (To-Do Hub)**
   - 대화창에서 "내일 오후 3시 회의 등록해줘", "장보기 완료 처리해줘" 등으로 자동 관리
   - 대시보드 탭에서 직접 우선순위(높음/보통/낮음), 마감일 지정 및 필터링(진행 중/완료)

4. **🧠 장기 기억 & 지식 베이스 (Long-term Memory)**
   - James님의 취향, 업무 스타일, 프로젝트 정보, 개인 설정을 대화 중 자동 학습 및 기억
   - 기억된 정보는 모든 대화의 맥락에 자동으로 주입되어 100% 맞춤형 답변 제공

5. **✉️ Gmail 인텔리전스 허브 (16자리 앱 비밀번호 간편 연동)**
   - 복잡한 Google Cloud Console 없이 [Google 계정 앱 비밀번호](https://myaccount.google.com/apppasswords) 16자리로 즉시 연동
   - **AI 메일 3줄 요약**: 길고 복잡한 메일의 핵심 내용 브리핑
   - **스마트 일정/미팅 추출**: 메일 속 회의, 약속, 마감 기한을 감지하여 James님에게 확인 후 To-Do 대시보드에 자동 등록
   - **대화형 답장 초안(Draft) 작성**: 격식 있고 매끄러운 비즈니스 메일 초안을 작성하여 메일함에 저장

6. **👥 Google 주소록 전체 연동 허브 (OAuth 2.0 & People API v1 양방향 확장)**
   - **4대 연동 아키텍처**: Google OAuth 2.0 (People API v1 Refresh Token 자동 갱신), People API Bearer 토큰, Gmail 16자리 앱 비밀번호 IMAP 자동 추출, CSV/vCard 파일 업로드
   - **Google People API v1 확장 제어 (`manage_contacts`)**:
     - 내 주소록(`people/me/connections`), 기타 연락처(`otherContacts`), 주소록 라벨/그룹(`contactGroups`) 전체 동기화
     - 양방향 클라우드 연락처 생성(`people:createContact`), 수정(`people:updateContact`), 삭제(`people:deleteContact`)
     - Google People API 실시간 검색(`people:searchContacts`) 및 Google Workspace 사내 조직 디렉터리(`people:searchDirectoryPeople`) 통합 조회
     - 라벨/그룹 생성(`POST /v1/contactGroups`) 및 별표(즐겨찾기) 관리
   - **Gmail · Google Chat · 일정 원클릭 연계**: 연락처 카드에서 바로 AI 이메일 초안 작성, Google Chat 협업 카드 공유, 미팅 일정 등록 지원

7. **💬 Google Chat (구글 챗) 전체 연동 허브 (OAuth 2.0 & Chat API v1 확장)**
   - **4대 인증 엔진 완벽 지원**: Google OAuth 2.0 (Refresh Token 자동 갱신), Google Cloud 서비스 계정(Service Account JSON 키 RS256 서명), Bearer Access Token, Incoming Webhook
   - **Google Chat REST API v1 확장 제어 (`manage_google_chat`)**:
     - 전체 스페이스·그룹채팅·1:1 DM 자동 탐색(`spaces.list`) 및 새 스페이스 생성·멤버 초대(`spaces:setup`)
     - 스페이스 참여 멤버 목록 조회(`spaces.members.list`)
     - `Cards v2` 리치 카드(제목·부제목·링크 버튼) 및 스레드 답글(`thread.name`) 전송
     - 보낸 메시지 수정(`PATCH`), 삭제(`DELETE`), 이모지 리액션(`👍`, `✅`, `❤️`, `🚀`) 추가(`reactions.create`)
   - **양방향 `@Junior` 봇 웹훅 엔드포인트 (`/api/google-chat/webhook`)**: Google Chat에서 `@Junior`를 멘션하면 Gemini AI가 도구(할 일/메일/웹 검색)를 실행해 실시간 답장

8. **📁 Google 드라이브 전체 연동 허브 (OAuth 2.0 & Drive API v3 확장)**
   - **4대 인증 엔진**: Google OAuth 2.0 (Refresh Token 자동 갱신), Google Cloud 서비스 계정(Service Account JSON 키 RS256 서명), Bearer Access Token, 로컬 워크스페이스 문서 모드
   - **Google Drive REST API v3 확장 제어 (`manage_google_drive`)**:
     - 파일·폴더·Google 문서 검색(`files.list`) 및 저장공간 용량 조회(`about.get`)
     - Google 문서(`Docs`), 스프레드시트(`Sheets`), 프레젠테이션(`Slides`), 텍스트/마크다운 문서 본문 직접 읽기(`files.export` / `alt=media`) 및 AI 3줄 요약
     - 새 Google 문서/시트/마크다운/폴더 클라우드 생성(`upload/drive/v3/files?uploadType=multipart`) 및 본문 실시간 편집(`PATCH`)
     - 이메일 공유 권한(`reader`/`commenter`/`writer`) 부여 및 공개 링크 생성(`permissions.create`) 후 Google Chat / Gmail 원클릭 공유

9. **⚙️ 간편한 환경 설정 (Settings Modal)**
   - 우측 상단 설정 아이콘에서 나만의 Gemini API 키 입력 및 변경 가능
   - Gemini 3.8 Flash, 3.5 Flash 등 모델 엔진 자유 선택
   - Gmail 이메일 및 16자리 앱 비밀번호 간편 설정 지원

---

## 🚀 빠른 시작 가이드 (Quick Start)

### 1. 개발 서버 실행
```bash
npm run dev
```
브라우저에서 [http://localhost:3000](http://localhost:3000)으로 접속합니다.

### 2. Gemini API 키 설정
- 웹앱 우측 상단의 **[⚙️ 설정]** 아이콘을 클릭합니다.
- [Google AI Studio](https://aistudio.google.com/app/apikey)에서 무료로 발급받은 API 키를 입력하고 저장합니다.
- 또는 `.env.local` 파일에 아래와 같이 직접 설정하실 수도 있습니다:
  ```env
  GEMINI_API_KEY=AIzaSy...
  GEMINI_MODEL=gemini-2.5-flash
  USER_NAME=James
  ```

### 3. 프로덕션 빌드
```bash
npm run build
npm run start
```

---

## 📂 프로젝트 구조

```
Junior/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts      # 실시간 스트리밍 & Function Calling 라우터
│   │   │   ├── todos/route.ts     # 할 일 CRUD API
│   │   │   ├── memory/route.ts    # 장기 기억 CRUD API
│   │   │   ├── sessions/route.ts  # 대화 세션 관리 API
│   │   │   └── settings/route.ts  # 환경 설정 API
│   │   ├── globals.css            # Tailwind & 커스텀 디자인 시스템
│   │   ├── layout.tsx             # 루트 레이아웃 (다크 모드 기본 지원)
│   │   └── page.tsx               # 메인 대시보드 및 네비게이션 셸
│   ├── components/
│   │   ├── chat/                  # 대화창, 메시지 렌더러, 도구 호출 카드
│   │   ├── todos/                 # 할 일 & 일정 대시보드 컴포넌트
│   │   ├── memory/                # 기억 저장소 뷰어 & 관리 컴포넌트
│   │   ├── layout/                # 사이드바, 헤더
│   │   └── settings/              # 설정 모달
│   └── lib/
│       ├── db.ts                  # 경량 로컬 데이터베이스 (JSON 기반 아토믹 스토어)
│       ├── gemini.ts              # Gemini 클라이언트 및 세션 설정
│       ├── persona.ts             # James 전용 Junior 프롬프트 & 페르소나
│       └── tools/                 # 웹 검색, To-Do, Memory 도구 정의 및 실행기
├── data/
│   └── store.json                 # 로컬 세션, 메시지, 할 일, 기억 저장소
├── package.json
└── README.md
```

# 나라장터 입찰공고 MCP 서버

조달청 나라장터 입찰공고정보서비스(공공데이터포털)를 Claude에서 사용할 수 있게 해주는 MCP 서버입니다.

## 제공 도구

- **search_bid_notices**: 물품/공사/용역/외자 입찰공고를 기간, 공고명 키워드, 기관명, 지역제한으로 검색
- **call_raw_operation**: 기초금액, 면허제한 등 그 외 오퍼레이션을 직접 호출

## 배포 방법 (Vercel, 무료)

### 1단계. GitHub에 올리기

1. https://github.com/new 에서 새 저장소를 만듭니다 (예: `g2b-bid-mcp`, Private 가능)
2. 이 폴더 전체를 업로드합니다
   - 웹에서: 저장소 페이지 → "uploading an existing file" 클릭 → 폴더 내 파일 전부 드래그
   - 또는 터미널에서:
     ```bash
     cd g2b-bid-mcp
     git init && git add . && git commit -m "init"
     git remote add origin https://github.com/내아이디/g2b-bid-mcp.git
     git push -u origin main
     ```

### 2단계. Vercel에 배포

1. https://vercel.com 접속 → GitHub 계정으로 로그인
2. **Add New → Project** → 방금 만든 저장소 **Import**
3. **Environment Variables** 섹션에서 환경변수 추가:
   - Name: `G2B_API_KEY`
   - Value: 공공데이터포털에서 받은 **일반 인증키(Decoding)** 붙여넣기
4. **Deploy** 클릭 → 1~2분 후 완료
5. 배포 완료 화면에서 도메인 확인 (예: `https://g2b-bid-mcp.vercel.app`)

> 인증키를 나중에 추가/수정했다면 **Settings → Environment Variables**에서 저장 후
> **Deployments 탭에서 Redeploy** 해야 적용됩니다.

### 3단계. Claude에 커스텀 커넥터 등록

1. claude.ai → **설정(Settings) → 커넥터(Connectors)**
2. **커스텀 커넥터 추가 (Add custom connector)** 클릭
3. 입력:
   - 이름: `나라장터 입찰공고` (자유)
   - URL: `https://내도메인.vercel.app/api/mcp`  ← **끝에 /api/mcp 필수**
4. 추가 후, 새 채팅에서 입력창의 도구(연장 아이콘) 메뉴에서 커넥터를 켭니다

### 4단계. 사용 예시

- "이번 주 세종 지역 공사 입찰공고 찾아줘"
- "공고명에 '소프트웨어' 들어간 용역 입찰 최근 한 달치 조회해줘"

## 주의사항

- 인증키는 절대 코드에 직접 넣지 말고 환경변수로만 관리하세요
- 개발계정은 일일 트래픽 제한이 있습니다 (활용사례 등록 시 운영계정으로 증설 가능)
- 인증키 오류(SERVICE_KEY_IS_NOT_REGISTERED)가 나면 Encoding 키가 아닌 **Decoding 키**를 넣었는지 확인하세요

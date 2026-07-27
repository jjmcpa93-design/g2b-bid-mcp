import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const BASE_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

// 업무구분 → 오퍼레이션명 매핑
const OPERATIONS: Record<string, string> = {
  물품: "getBidPblancListInfoThng",
  공사: "getBidPblancListInfoCnstwk",
  용역: "getBidPblancListInfoServc",
  외자: "getBidPblancListInfoFrgcpt",
};

// 결과에서 추려낼 주요 필드 (토큰 절약용)
const KEY_FIELDS = [
  "bidNtceNo", // 입찰공고번호
  "bidNtceOrd", // 입찰공고차수
  "bidNtceNm", // 입찰공고명
  "ntceInsttNm", // 공고기관명
  "dminsttNm", // 수요기관명
  "bidNtceDt", // 공고게시일시
  "bidClseDt", // 입찰마감일시
  "opengDt", // 개찰일시
  "presmptPrce", // 추정가격
  "asignBdgtAmt", // 배정예산금액
  "cntrctCnclsMthdNm", // 계약체결방법
  "bidMethdNm", // 입찰방식
  "sucsfbidMthdNm", // 낙찰방법
  "rgnLmtYn", // 지역제한여부
  "prtcptLmtRgnNm", // 참가제한지역명
  "bidNtceDtlUrl", // 공고상세 URL
];

function pickFields(item: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of KEY_FIELDS) {
    if (item[f] !== undefined && item[f] !== "") out[f] = item[f];
  }
  return out;
}

function yyyymmddhhmm(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

async function callApi(
  operation: string,
  params: Record<string, string>
): Promise<string> {
  const serviceKey = process.env.G2B_API_KEY;
  if (!serviceKey) {
    return "오류: 서버에 G2B_API_KEY 환경변수가 설정되어 있지 않습니다. Vercel 프로젝트 설정에서 환경변수를 추가한 뒤 재배포하세요.";
  }

  const qs = new URLSearchParams({
    serviceKey,
    type: "json",
    ...params,
  });
  const url = `${BASE_URL}/${operation}?${qs.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();

    // 인증키 오류 등은 XML로 내려오는 경우가 있음
    if (text.trim().startsWith("<")) {
      return `API가 XML 오류 응답을 반환했습니다. 인증키 또는 파라미터를 확인하세요.\n원문(일부): ${text.slice(0, 500)}`;
    }

    const data = JSON.parse(text);
    const header = data?.response?.header;
    const body = data?.response?.body;

    if (header && header.resultCode !== "00") {
      return `API 오류 [${header.resultCode}] ${header.resultMsg ?? ""}`;
    }

    let items = body?.items ?? [];
    if (!Array.isArray(items)) {
      // 단건일 때 객체로 오는 경우 처리
      items = items?.item ? [].concat(items.item) : [items];
    }

    const trimmed = (items as Record<string, unknown>[])
      .filter((it) => it && typeof it === "object")
      .map(pickFields);

    return JSON.stringify(
      {
        totalCount: body?.totalCount ?? trimmed.length,
        pageNo: body?.pageNo,
        numOfRows: body?.numOfRows,
        items: trimmed,
      },
      null,
      1
    );
  } catch (e) {
    return `요청 실패: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    clearTimeout(timeout);
  }
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "search_bid_notices",
      "나라장터(조달청) 입찰공고를 조회합니다. 업무구분(물품/공사/용역/외자), 조회기간, 공고명 키워드, 기관명으로 검색할 수 있습니다. 날짜 미입력 시 최근 7일을 조회합니다.",
      {
        category: z
          .enum(["물품", "공사", "용역", "외자"])
          .describe("업무구분"),
        inqryBgnDt: z
          .string()
          .regex(/^\d{12}$/)
          .optional()
          .describe("조회 시작일시 YYYYMMDDHHMM (예: 202607200000)"),
        inqryEndDt: z
          .string()
          .regex(/^\d{12}$/)
          .optional()
          .describe("조회 종료일시 YYYYMMDDHHMM (예: 202607272359)"),
        inqryDiv: z
          .enum(["1", "2"])
          .default("1")
          .describe("조회구분: 1=공고게시일시 기준, 2=개찰일시 기준"),
        bidNtceNm: z
          .string()
          .optional()
          .describe("입찰공고명 검색 키워드 (예: 도로포장, 소프트웨어)"),
        ntceInsttNm: z.string().optional().describe("공고기관명"),
        dminsttNm: z.string().optional().describe("수요기관명"),
        prtcptLmtRgnNm: z
          .string()
          .optional()
          .describe("참가제한지역명 (예: 세종, 대전)"),
        pageNo: z.number().int().min(1).default(1).describe("페이지 번호"),
        numOfRows: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("페이지당 결과 수 (최대 100)"),
      },
      async (args) => {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const params: Record<string, string> = {
          inqryDiv: args.inqryDiv,
          inqryBgnDt: args.inqryBgnDt ?? yyyymmddhhmm(weekAgo),
          inqryEndDt: args.inqryEndDt ?? yyyymmddhhmm(now),
          pageNo: String(args.pageNo),
          numOfRows: String(args.numOfRows),
        };
        if (args.bidNtceNm) params.bidNtceNm = args.bidNtceNm;
        if (args.ntceInsttNm) params.ntceInsttNm = args.ntceInsttNm;
        if (args.dminsttNm) params.dminsttNm = args.dminsttNm;
        if (args.prtcptLmtRgnNm) params.prtcptLmtRgnNm = args.prtcptLmtRgnNm;

        const result = await callApi(OPERATIONS[args.category], params);
        return { content: [{ type: "text", text: result }] };
      }
    );

    server.tool(
      "call_raw_operation",
      "나라장터 입찰공고정보서비스의 임의 오퍼레이션을 직접 호출합니다. search_bid_notices로 조회할 수 없는 오퍼레이션(기초금액, 면허제한, 참가가능지역 등)이 필요할 때 사용하세요. serviceKey와 type=json은 자동으로 추가됩니다.",
      {
        operation: z
          .string()
          .describe(
            "오퍼레이션명 (예: getBidPblancListInfoCnstwkBsisAmount, getBidPblancListInfoLicenseLimit)"
          ),
        params: z
          .record(z.string())
          .describe(
            '쿼리 파라미터 객체 (예: {"inqryDiv":"1","inqryBgnDt":"202607200000","inqryEndDt":"202607272359","pageNo":"1","numOfRows":"20"})'
          ),
      },
      async ({ operation, params }) => {
        const result = await callApi(operation, params);
        return { content: [{ type: "text", text: result }] };
      }
    );
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST, handler as DELETE };

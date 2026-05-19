import { NextResponse } from "next/server";

// API 핸들러 wrapper — try/catch + 표준 에러 응답.
// 클라이언트는 항상 { error: string, code?: string } 형태로 응답 받음.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// 자주 쓰는 에러 단축형
export const errors = {
  unauthorized: (msg = "인증이 필요해요")           => new ApiError(401, "UNAUTHORIZED", msg),
  forbidden:    (msg = "권한이 없어요")             => new ApiError(403, "FORBIDDEN", msg),
  notFound:     (msg = "찾을 수 없어요")            => new ApiError(404, "NOT_FOUND", msg),
  badRequest:   (msg = "잘못된 요청이에요")          => new ApiError(400, "BAD_REQUEST", msg),
  conflict:     (msg = "이미 존재해요")             => new ApiError(409, "CONFLICT", msg),
  tooMany:      (msg = "요청이 너무 잦아요")        => new ApiError(429, "TOO_MANY_REQUESTS", msg),
};

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response | NextResponse>;

export function withErrorHandler<Ctx>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      }
      // 알 수 없는 에러 — 로깅 + 500
      console.error("[api]", req.method, new URL(req.url).pathname, "→", e);
      const msg = process.env.NODE_ENV === "production"
        ? "서버 오류가 발생했어요"
        : (e instanceof Error ? e.message : String(e));
      return NextResponse.json({ error: msg, code: "INTERNAL" }, { status: 500 });
    }
  };
}

// JSON body 파싱 (실패 시 ApiError)
export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return await req.json() as T;
  } catch {
    throw errors.badRequest("JSON 형식 오류");
  }
}

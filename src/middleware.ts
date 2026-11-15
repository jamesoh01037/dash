import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const password = process.env.JUNIOR_ACCESS_PASSWORD;

  // 비밀번호가 설정되어 있지 않으면(로컬 개발 등) 인증 없이 통과
  if (!password) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const base64Credentials = authHeader.slice(6).trim();
      const decoded = atob(base64Credentials);
      const colonIdx = decoded.indexOf(":");
      const userPass = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;
      if (userPass === password) {
        return NextResponse.next();
      }
    } catch {
      // invalid base64
    }
  }

  return new NextResponse("Junior 접근 인증이 필요합니다.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Junior AI Assistant"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

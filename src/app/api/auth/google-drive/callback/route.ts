import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGoogleDriveCodeForTokens,
  syncGoogleDriveFiles,
} from "@/lib/googleDrive";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/?tab=gdrive&gdrive_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/?tab=gdrive&gdrive_error=${encodeURIComponent("인증 코드(code)가 없습니다.")}`
    );
  }

  const res = await exchangeGoogleDriveCodeForTokens(code);
  if (!res.success) {
    return NextResponse.redirect(
      `${baseUrl}/?tab=gdrive&gdrive_error=${encodeURIComponent(res.error || "토큰 교환 실패")}`
    );
  }

  // Automatically sync Google Drive files & storage quota upon OAuth login
  await syncGoogleDriveFiles();

  return NextResponse.redirect(`${baseUrl}/?tab=gdrive&gdrive_auth=success`);
}

import { NextRequest, NextResponse } from "next/server";
import { getRawDriveFileBuffer, updateDriveFile } from "@/lib/googleDrive";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Streams a `.hwp` or `.hwpx` file with a URL ending in `.hwp` / `.hwpx` and HWP MIME headers
 * so that the Chrome `rhwp` extension intercepts and opens the document directly for viewing/editing,
 * or fetches it via `chrome-extension://<id>/...` URL parameter.
 */
export async function GET(
  req: NextRequest,
  context: { params: { fileId: string; fileName: string } }
) {
  try {
    const fileId = decodeURIComponent(context.params.fileId || "");
    const requestedFileName = decodeURIComponent(context.params.fileName || "document.hwp");
    const forceDownload = req.nextUrl.searchParams.get("download") === "1";

    const rawRes = await getRawDriveFileBuffer(fileId || requestedFileName);
    if (!rawRes.success || !rawRes.buffer || !rawRes.file) {
      return NextResponse.json(
        { error: rawRes.error || "HWP/HWPX 파일을 불러올 수 없습니다." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const finalName = rawRes.file.name || requestedFileName;
    const encodedName = encodeURIComponent(finalName);
    const dispositionType = forceDownload ? "attachment" : "inline";

    return new NextResponse(new Uint8Array(rawRes.buffer), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": rawRes.contentType || "application/x-hwp",
        "Content-Length": String(rawRes.buffer.byteLength),
        "Content-Disposition": `${dispositionType}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "X-Drive-File-Id": rawRes.file.driveFileId || rawRes.file.id,
        "X-Hwp-Extension-Ready": "rhwp",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "HWP/HWPX 스트리밍 오류";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * Allows the `rhwp` editor or Junior's HWP/HWPX editor to save modified content back to Google Drive.
 */
export async function POST(
  req: NextRequest,
  context: { params: { fileId: string; fileName: string } }
) {
  try {
    const fileId = decodeURIComponent(context.params.fileId || "");
    const contentType = req.headers.get("content-type") || "";

    let updatedContent = "";
    let newName: string | undefined;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      updatedContent = String(body.content ?? "");
      newName = body.newName ? String(body.newName) : undefined;
    } else {
      updatedContent = await req.text();
    }

    const res = await updateDriveFile({
      fileIdOrName: fileId,
      newName,
      content: updatedContent,
    });

    if (!res.success) {
      return NextResponse.json(
        { error: res.error || "HWP/HWPX 저장 실패" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        file: res.file,
        cloudSynced: res.cloudSynced,
        message: `'${res.file?.name}' 한글 문서(HWP/HWPX) 편집 내용이 저장되었습니다.`,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "HWP/HWPX 저장 중 오류 발생";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: { fileId: string; fileName: string } }
) {
  return POST(req, context);
}

export async function HEAD(
  req: NextRequest,
  context: { params: { fileId: string; fileName: string } }
) {
  return GET(req, context);
}


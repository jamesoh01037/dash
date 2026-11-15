import {
  getGoogleDriveAuthStatus,
  syncGoogleDriveFiles,
  listOrSearchDriveFiles,
  readDriveFileContent,
  createDriveFileOrDoc,
  updateDriveFile,
  shareDriveFile,
  deleteDriveFile,
} from "../googleDrive";

export interface ManageGoogleDriveArgs {
  action:
    | "list_files"
    | "search_files"
    | "read_file"
    | "create_doc"
    | "create_folder"
    | "update_file"
    | "share_file"
    | "delete_file"
    | "sync_drive"
    | "get_quota";
  query?: string;
  fileIdOrName?: string;
  name?: string;
  content?: string;
  docType?:
    | "google_doc"
    | "google_sheet"
    | "google_slide"
    | "hwp"
    | "hwpx"
    | "folder"
    | "markdown"
    | "text";
  parentFolderId?: string;
  description?: string;
  starredOnly?: boolean;
  starred?: boolean;
  email?: string;
  role?: "reader" | "commenter" | "writer";
  makePublicLink?: boolean;
}

export async function executeManageGoogleDrive(args: ManageGoogleDriveArgs) {
  try {
    switch (args.action) {
      case "sync_drive": {
        const res = await syncGoogleDriveFiles({
          query: args.query,
          folderId: args.parentFolderId,
        });
        if (!res.success) {
          return { success: false, error: res.error };
        }
        const latest = listOrSearchDriveFiles().slice(0, 20);
        return {
          success: true,
          addedCount: res.addedCount,
          updatedCount: res.updatedCount,
          totalFiles: res.totalFiles,
          files: latest,
          message: `Google Drive 클라우드 동기화를 완료했습니다! (신규 ${res.addedCount}건, 업데이트 ${res.updatedCount}건, 총 ${res.totalFiles}건)`,
        };
      }

      case "list_files":
      case "search_files": {
        const q = args.query || args.name || args.fileIdOrName || undefined;
        // Attempt background remote sync if token is available
        const auth = getGoogleDriveAuthStatus();
        if (auth.hasDriveToken) {
          await syncGoogleDriveFiles({ query: q, folderId: args.parentFolderId, pageSize: 30 });
        }
        const files = listOrSearchDriveFiles({
          query: q,
          starredOnly: args.starredOnly,
          folderId: args.parentFolderId,
        });

        return {
          success: true,
          count: files.length,
          files: files.slice(0, 25),
          message:
            files.length > 0
              ? `Google Drive에서 ${files.length}개의 파일/폴더를 확인했습니다.`
              : q
              ? `'${q}'에 일치하는 Google Drive 파일이 없습니다.`
              : "조회된 Google Drive 파일이 없습니다.",
        };
      }

      case "read_file": {
        const target = args.fileIdOrName || args.name || args.query || "";
        if (!target.trim()) {
          return {
            success: false,
            error: "본문을 읽을 파일 이름이나 ID(fileIdOrName)를 지정해 주세요.",
          };
        }
        const res = await readDriveFileContent(target);
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          file: res.file,
          content: res.content,
          message: `Google Drive '${res.file?.name}' 문서의 본문 내용을 성공적으로 읽어왔습니다.`,
        };
      }

      case "create_doc":
      case "create_folder": {
        const docName = (args.name || args.fileIdOrName || args.query || "").trim();
        if (!docName) {
          return {
            success: false,
            error: "생성할 문서 또는 폴더 이름(name)을 지정해 주세요.",
          };
        }
        const res = await createDriveFileOrDoc({
          name: docName,
          content: args.content,
          docType:
            args.action === "create_folder"
              ? "folder"
              : args.docType || "google_doc",
          parentFolderId: args.parentFolderId,
          description: args.description,
        });
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          file: res.file,
          cloudSynced: res.cloudSynced,
          message: `Google Drive에 '${res.file?.name}' ${
            args.action === "create_folder" ? "폴더" : "문서"
          }를 생성했습니다!${
            res.file?.webViewLink ? ` (링크: ${res.file.webViewLink})` : ""
          }`,
        };
      }

      case "update_file": {
        const target = args.fileIdOrName || args.name || "";
        if (!target) {
          return {
            success: false,
            error: "수정할 대상 파일의 이름이나 ID(fileIdOrName)가 필요합니다.",
          };
        }
        const res = await updateDriveFile({
          fileIdOrName: target,
          newName: args.name && args.fileIdOrName ? args.name : undefined,
          content: args.content,
          starred: args.starred,
          description: args.description,
        });
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          file: res.file,
          cloudSynced: res.cloudSynced,
          message: `Google Drive '${res.file?.name}' 파일 정보를 수정했습니다.`,
        };
      }

      case "share_file": {
        const target = args.fileIdOrName || args.name || args.query || "";
        if (!target) {
          return {
            success: false,
            error: "공유할 파일 이름이나 ID(fileIdOrName)를 지정해 주세요.",
          };
        }
        const res = await shareDriveFile({
          fileIdOrName: target,
          email: args.email,
          role: args.role || "reader",
          makePublicLink: args.makePublicLink ?? !args.email,
        });
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          file: res.file,
          webViewLink: res.webViewLink,
          message: args.email
            ? `'${res.file?.name}' 파일을 ${args.email}님(${args.role || "reader"})에게 공유했습니다. 링크: ${res.webViewLink || ""}`
            : `'${res.file?.name}' 파일의 공유 링크를 생성했습니다: ${res.webViewLink || ""}`,
        };
      }

      case "delete_file": {
        const target = args.fileIdOrName || args.name || args.query || "";
        if (!target) {
          return {
            success: false,
            error: "삭제할 파일 이름이나 ID를 지정해 주세요.",
          };
        }
        const res = await deleteDriveFile(target);
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          deleted: res.deleted,
          cloudDeleted: res.cloudDeleted,
          message: `Google Drive '${res.deleted?.name}' 파일을 삭제(휴지통 이동)했습니다.`,
        };
      }

      case "get_quota": {
        const auth = getGoogleDriveAuthStatus();
        if (auth.hasDriveToken) {
          await syncGoogleDriveFiles({ pageSize: 5 });
        }
        const updatedAuth = getGoogleDriveAuthStatus();
        const usedGb = updatedAuth.storageUsageBytes
          ? (updatedAuth.storageUsageBytes / 1024 ** 3).toFixed(2)
          : "0";
        const limitGb = updatedAuth.storageLimitBytes
          ? (updatedAuth.storageLimitBytes / 1024 ** 3).toFixed(2)
          : "무제한/미확인";

        return {
          success: true,
          authStatus: updatedAuth,
          message: `Google Drive 저장공간 사용량: ${usedGb} GB / ${limitGb} GB (${
            updatedAuth.connectedEmail || "로컬 워크스페이스"
          })`,
        };
      }

      default:
        return {
          success: false,
          error: `알 수 없는 Google Drive 작업입니다: ${args.action}`,
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Google Drive 처리 중 오류 발생";
    return { success: false, error: msg };
  }
}

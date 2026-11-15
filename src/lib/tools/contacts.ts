import {
  listOrSearchContacts,
  searchContactsWithPeopleApi,
  upsertContactWithCloudSync,
  deleteContactWithCloudSync,
  toggleContactStar,
  listContactGroups,
  createContactGroup,
  syncGooglePeopleApiContacts,
  syncContactsFromGmail,
} from "../contacts";

export interface ManageContactsArgs {
  action:
    | "search"
    | "list"
    | "add"
    | "update"
    | "delete"
    | "sync_google_people"
    | "sync_gmail"
    | "list_groups"
    | "create_group"
    | "toggle_favorite";
  query?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  department?: string;
  notes?: string;
  group?: string;
  starredOnly?: boolean;
  contactId?: string;
}

export async function executeManageContacts(args: ManageContactsArgs) {
  try {
    switch (args.action) {
      case "search": {
        const q = (args.query || args.name || args.email || "").trim();
        const { contacts, remoteDiscoveredCount } = await searchContactsWithPeopleApi(q);
        return {
          success: true,
          query: q,
          count: contacts.length,
          remoteDiscoveredCount,
          contacts: contacts.slice(0, 25),
          message:
            contacts.length > 0
              ? `"${q}" 검색 결과 총 ${contacts.length}명의 연락처를 찾았습니다.${
                  remoteDiscoveredCount > 0
                    ? ` (Google People API/디렉터리 실시간 탐색: +${remoteDiscoveredCount}명)`
                    : ""
                }`
              : `"${q}"에 해당하는 연락처가 주소록에 없습니다.`,
        };
      }

      case "list": {
        const all = listOrSearchContacts(args.query, {
          group: args.group,
          starredOnly: args.starredOnly,
        });
        return {
          success: true,
          count: all.length,
          contacts: all.slice(0, 40),
          message: `현재 등록된 주소록 연락처 총 ${all.length}명을 조회했습니다.`,
        };
      }

      case "add":
      case "update": {
        if (!args.name && !args.email) {
          return {
            success: false,
            error: "연락처를 추가/수정하려면 이름(name) 또는 이메일(email)이 필요합니다.",
          };
        }
        const { contact, cloudSynced, cloudError } = await upsertContactWithCloudSync({
          id: args.contactId,
          name: args.name || (args.email ? args.email.split("@")[0] : "이름 없음"),
          email: args.email || "",
          phone: args.phone,
          company: args.company,
          role: args.role,
          department: args.department,
          notes: args.notes,
          groups: args.group ? [args.group] : undefined,
          source: "agent",
        });
        return {
          success: true,
          contact,
          cloudSynced,
          message: `'${contact.name}' (${contact.email}) 연락처를 주소록에 저장했습니다.${
            cloudSynced
              ? " (Google People API 클라우드 주소록에도 실시간 반영 완료!)"
              : cloudError
              ? ` (참고: ${cloudError})`
              : ""
          }`,
        };
      }

      case "delete": {
        const target = args.contactId || args.email || args.name || args.query || "";
        if (!target) {
          return {
            success: false,
            error: "삭제할 연락처의 ID, 이름 또는 이메일 주소를 지정해 주세요.",
          };
        }
        const res = await deleteContactWithCloudSync(target);
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          deleted: res.deleted,
          cloudDeleted: res.cloudDeleted,
          message: `'${res.deleted?.name}' (${res.deleted?.email}) 연락처가 삭제되었습니다.${
            res.cloudDeleted ? " (Google People API 클라우드에서도 삭제됨)" : ""
          }`,
        };
      }

      case "sync_google_people": {
        const res = await syncGooglePeopleApiContacts(true);
        if (!res.success) {
          return { success: false, error: res.error };
        }
        const latest = listOrSearchContacts().slice(0, 20);
        return {
          success: true,
          addedCount: res.addedCount,
          updatedCount: res.updatedCount,
          totalContacts: res.totalContacts,
          groupsCount: res.groupsCount,
          contacts: latest,
          message: `Google People API v1 전체 동기화를 완료했습니다! 새로 추가 ${res.addedCount}명, 업데이트 ${res.updatedCount}명 (총 ${res.totalContacts}명, 그룹 ${res.groupsCount}개)`,
        };
      }

      case "sync_gmail": {
        const res = await syncContactsFromGmail(60);
        if (!res.success) {
          return { success: false, error: res.error };
        }
        const latest = listOrSearchContacts().slice(0, 15);
        return {
          success: true,
          addedCount: res.addedCount,
          totalContacts: res.totalContacts,
          contacts: latest,
          message: `Gmail 수발신 내역에서 ${res.addedCount}개의 새 연락처를 자동으로 추출하여 동기화했습니다. (현재 총 ${res.totalContacts}명)`,
        };
      }

      case "list_groups": {
        const groups = listContactGroups();
        return {
          success: true,
          count: groups.length,
          groups,
          message: `Google 주소록 그룹(라벨) ${groups.length}개를 확인했습니다.`,
        };
      }

      case "create_group": {
        const groupName = (args.group || args.name || args.query || "").trim();
        if (!groupName) {
          return {
            success: false,
            error: "생성할 주소록 그룹(라벨) 이름을 지정해 주세요.",
          };
        }
        const res = await createContactGroup(groupName);
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          group: res.group,
          message: `새 주소록 그룹(라벨) '${res.group?.name}'가 생성되었습니다.`,
        };
      }

      case "toggle_favorite": {
        const target = args.contactId || args.name || args.email || args.query || "";
        if (!target) {
          return {
            success: false,
            error: "즐겨찾기를 변경할 연락처 이름이나 이메일을 지정해 주세요.",
          };
        }
        const updated = toggleContactStar(target);
        if (!updated) {
          return {
            success: false,
            error: `'${target}' 연락처를 찾을 수 없습니다.`,
          };
        }
        return {
          success: true,
          contact: updated,
          message: `'${updated.name}' 연락처를 즐겨찾기(별표) ${
            updated.starred ? "설정" : "해제"
          }했습니다.`,
        };
      }

      default:
        return {
          success: false,
          error: `알 수 없는 주소록 작업입니다: ${args.action}`,
        };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

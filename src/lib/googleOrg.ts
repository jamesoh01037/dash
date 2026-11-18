import { google } from "googleapis";

/**
 * Fetches the signed-in Google user's organization name from Google People / Directory API,
 * falling back to Google Workspace hosted domain (hd) if available.
 */
export async function fetchGoogleUserOrganization(params: {
  accessToken: string;
  email: string;
  hostedDomain?: string | null;
}): Promise<string | undefined> {
  const { accessToken, email, hostedDomain } = params;
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  let resolvedHd = hostedDomain || undefined;

  // 1. Check userinfo for hosted domain (hd) if not already provided
  if (!resolvedHd) {
    try {
      const oauth2 = google.oauth2({ version: "v2", auth });
      const { data } = await oauth2.userinfo.get();
      if (data.hd) resolvedHd = data.hd;
    } catch {
      // ignore
    }
  }

  const people = google.people({ version: "v1", auth });

  // 2. Check user's own People profile organizations
  try {
    const { data: me } = await people.people.get({
      resourceName: "people/me",
      personFields: "organizations",
    });
    const orgName = me.organizations?.find((o) => o.name?.trim())?.name?.trim();
    if (orgName) return orgName;
  } catch {
    // ignore
  }

  // 3. Check Google Workspace Directory profile if workspace domain exists
  if (resolvedHd || !email.endsWith("@gmail.com")) {
    try {
      const { data: dir } = await people.people.searchDirectoryPeople({
        query: email,
        readMask: "organizations,emailAddresses",
        sources: ["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"],
      });
      const matched = dir.people?.find((p) =>
        p.emailAddresses?.some(
          (e) => e.value?.toLowerCase() === email.toLowerCase()
        )
      ) || dir.people?.[0];
      const dirOrg = matched?.organizations?.find((o) => o.name?.trim())?.name?.trim();
      if (dirOrg) return dirOrg;
    } catch {
      // ignore
    }
  }

  // 4. Fallback to Workspace hosted domain (e.g. "i-on.net")
  return resolvedHd;
}

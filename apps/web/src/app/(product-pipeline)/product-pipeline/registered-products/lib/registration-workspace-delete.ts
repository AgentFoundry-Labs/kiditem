export interface ArchiveRegistrationWorkspacesResult {
  succeededIds: string[];
  failedIds: string[];
}

export async function archiveRegistrationWorkspaces(
  ids: string[],
  archive: (id: string) => Promise<unknown>,
): Promise<ArchiveRegistrationWorkspacesResult> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const results = await Promise.allSettled(
    uniqueIds.map(async (id) => {
      await archive(id);
      return id;
    }),
  );

  return results.reduce<ArchiveRegistrationWorkspacesResult>(
    (acc, result, index) => {
      const id = uniqueIds[index];
      if (!id) return acc;
      if (result.status === 'fulfilled') {
        acc.succeededIds.push(id);
      } else {
        acc.failedIds.push(id);
      }
      return acc;
    },
    { succeededIds: [], failedIds: [] },
  );
}

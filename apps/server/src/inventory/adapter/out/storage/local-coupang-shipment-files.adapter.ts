import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';

import type {
  CoupangShipmentDailyFiles,
  CoupangShipmentFileRequest,
  CoupangShipmentFilesResponse,
  CoupangShipmentMergedFileItem,
  CoupangShipmentMergedFileKind,
  CoupangShipmentResolvedFile,
} from '../../../application/port/in/fulfillment/coupang-shipments.port';
import type { CoupangShipmentFileStoragePort } from '../../../application/port/out/storage';

type ManifestFile = {
  targetInboundDate?: string;
  downloaded?: Array<{
    shipmentNo?: string;
    kind?: 'label' | 'manifest';
    inboundDate?: string;
    center?: string;
  }>;
  mergedOutputs?: Array<{
    date?: string;
    labels?: ManifestMergedOutput;
    manifests?: ManifestMergedOutput;
    all?: ManifestMergedOutput;
  }>;
};

type ManifestMergedOutput = {
  outPath?: string;
  count?: number;
  pages?: number;
  merged?: Array<{ center?: string }>;
};

@Injectable()
export class LocalCoupangShipmentFilesAdapter implements CoupangShipmentFileStoragePort {
  private readonly rootPath = resolve(
    process.env.COUPANG_SHIPMENTS_DIR ?? join(homedir(), 'Downloads', 'kiditem-coupang-shipments'),
  );

  async listMergedFiles(organizationId: string): Promise<CoupangShipmentFilesResponse> {
    const organizationRoot = this.organizationRootPath(organizationId);
    if (!existsSync(organizationRoot)) {
      return { rootPath: organizationRoot, totalFiles: 0, days: [] };
    }

    const dayMap = new Map<string, CoupangShipmentDailyFiles>();
    const runIds = await this.listDirectoryNames(organizationRoot);

    for (const runId of runIds) {
      const runPath = join(organizationRoot, runId);
      const manifestFiles = await this.readManifestFiles(runId, runPath, organizationRoot);
      const fallbackFiles = manifestFiles.length > 0 ? [] : await this.readFallbackFiles(runId, runPath, organizationRoot);
      for (const file of [...manifestFiles, ...fallbackFiles]) {
        const current = dayMap.get(file.date) ?? {
          date: file.date,
          files: [],
          runCount: 0,
          updatedAt: null,
        };
        current.files.push(file);
        current.updatedAt = maxIsoDate(current.updatedAt, file.createdAt);
        dayMap.set(file.date, current);
      }
    }

    const days = [...dayMap.values()]
      .map((day) => ({
        ...day,
        files: day.files.sort(compareMergedFiles),
        runCount: new Set(day.files.map((file) => file.runId)).size,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      rootPath: organizationRoot,
      totalFiles: days.reduce((sum, day) => sum + day.files.length, 0),
      days,
    };
  }

  async resolveMergedFile(
    organizationId: string,
    input: CoupangShipmentFileRequest,
  ): Promise<CoupangShipmentResolvedFile> {
    const organizationRoot = this.organizationRootPath(organizationId);
    const filePath = resolve(organizationRoot, input.runId, input.date, input.fileName);
    this.assertInsideRoot(filePath, organizationRoot);

    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(filePath);
    } catch {
      throw new NotFoundException('쿠팡 쉽먼트 파일을 찾을 수 없습니다.');
    }
    if (!fileStat.isFile() || !input.fileName.toLowerCase().endsWith('.pdf')) {
      throw new NotFoundException('쿠팡 쉽먼트 PDF 파일을 찾을 수 없습니다.');
    }

    return {
      path: filePath,
      fileName: basename(filePath),
      sizeBytes: Number(fileStat.size),
    };
  }

  private async readManifestFiles(
    runId: string,
    runPath: string,
    organizationRoot: string,
  ): Promise<CoupangShipmentMergedFileItem[]> {
    const manifest = await this.readManifest(runPath);
    if (!manifest?.mergedOutputs) return [];

    const downloaded = manifest.downloaded ?? [];
    const files: CoupangShipmentMergedFileItem[] = [];
    for (const output of manifest.mergedOutputs) {
      const date = output.date ?? manifest.targetInboundDate;
      if (!date) continue;
      for (const [kind, merged] of [
        ['label', output.labels],
        ['statement', output.manifests],
        ['all', output.all],
      ] as const) {
        if (!merged?.outPath) continue;
        const fileName = basename(merged.outPath);
        const filePath = resolve(runPath, date, fileName);
        this.assertInsideRoot(filePath, organizationRoot);
        const fileStat = await this.safeStat(filePath);
        if (!fileStat?.isFile()) continue;

        files.push({
          id: stableId(runId, date, fileName),
          runId,
          date,
          kind,
          fileName,
          downloadPath: makeDownloadPath(runId, date, fileName),
          sizeBytes: Number(fileStat.size),
          sourceCount: merged.count ?? countDownloaded(downloaded, date, kind),
          pageCount: merged.pages ?? 0,
          centers: getMergedCenters(merged, downloaded, date, kind),
          createdAt: fileStat.mtime.toISOString(),
        });
      }
    }
    return files;
  }

  private async readFallbackFiles(
    runId: string,
    runPath: string,
    organizationRoot: string,
  ): Promise<CoupangShipmentMergedFileItem[]> {
    const dates = await this.listDirectoryNames(runPath);
    const files: CoupangShipmentMergedFileItem[] = [];

    for (const date of dates) {
      const datePath = join(runPath, date);
      const names = await this.listFileNames(datePath);
      for (const fileName of names.filter((name) => name.endsWith('.pdf') && name.includes('병합'))) {
        const filePath = resolve(datePath, fileName);
        this.assertInsideRoot(filePath, organizationRoot);
        const fileStat = await this.safeStat(filePath);
        if (!fileStat?.isFile()) continue;
        const kind = inferKind(fileName);
        files.push({
          id: stableId(runId, date, fileName),
          runId,
          date,
          kind,
          fileName,
          downloadPath: makeDownloadPath(runId, date, fileName),
          sizeBytes: Number(fileStat.size),
          sourceCount: 0,
          pageCount: 0,
          centers: [],
          createdAt: fileStat.mtime.toISOString(),
        });
      }
    }
    return files;
  }

  private async readManifest(runPath: string): Promise<ManifestFile | null> {
    try {
      const content = await readFile(join(runPath, 'manifest.json'), 'utf8');
      return JSON.parse(content) as ManifestFile;
    } catch {
      return null;
    }
  }

  private async listDirectoryNames(path: string): Promise<string[]> {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    } catch {
      return [];
    }
  }

  private async listFileNames(path: string): Promise<string[]> {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    } catch {
      return [];
    }
  }

  private async safeStat(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
    try {
      return await stat(path);
    } catch {
      return null;
    }
  }

  private organizationRootPath(organizationId: string): string {
    const organizationRoot = resolve(this.rootPath, organizationId);
    this.assertInsideRoot(organizationRoot, this.rootPath);
    return organizationRoot;
  }

  private assertInsideRoot(path: string, rootPath: string): void {
    const normalizedRoot = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
    if (!path.startsWith(normalizedRoot)) {
      throw new NotFoundException('쿠팡 쉽먼트 파일을 찾을 수 없습니다.');
    }
  }
}

function countDownloaded(
  downloaded: ManifestFile['downloaded'],
  date: string,
  kind: CoupangShipmentMergedFileKind,
): number {
  if (kind === 'all') return downloaded?.filter((item) => item.inboundDate === date).length ?? 0;
  const manifestKind = kind === 'statement' ? 'manifest' : kind;
  return downloaded?.filter((item) => item.inboundDate === date && item.kind === manifestKind).length ?? 0;
}

function getMergedCenters(
  merged: ManifestMergedOutput,
  downloaded: ManifestFile['downloaded'],
  date: string,
  kind: CoupangShipmentMergedFileKind,
): string[] {
  const fromMerged = (merged.merged ?? []).map((item) => item.center).filter(Boolean) as string[];
  const fromDownloads =
    kind === 'all'
      ? downloaded?.filter((item) => item.inboundDate === date).map((item) => item.center)
      : downloaded
        ?.filter((item) => item.inboundDate === date && item.kind === (kind === 'statement' ? 'manifest' : kind))
        .map((item) => item.center);
  return [...new Set([...fromMerged, ...((fromDownloads ?? []).filter(Boolean) as string[])])].sort((a, b) =>
    a.localeCompare(b, 'ko', { numeric: true }),
  );
}

function inferKind(fileName: string): CoupangShipmentMergedFileKind {
  if (fileName.includes('전체')) return 'all';
  if (fileName.includes('내역서')) return 'statement';
  return 'label';
}

function compareMergedFiles(a: CoupangShipmentMergedFileItem, b: CoupangShipmentMergedFileItem): number {
  const kindRank = kindOrder(a.kind) - kindOrder(b.kind);
  if (kindRank !== 0) return kindRank;
  return b.createdAt.localeCompare(a.createdAt);
}

function kindOrder(kind: CoupangShipmentMergedFileKind): number {
  if (kind === 'all') return 0;
  if (kind === 'label') return 1;
  return 2;
}

function maxIsoDate(a: string | null, b: string): string {
  if (!a) return b;
  return a > b ? a : b;
}

function stableId(...parts: string[]): string {
  return createHash('sha1').update(parts.join('\0')).digest('hex').slice(0, 16);
}

function makeDownloadPath(runId: string, date: string, fileName: string): string {
  return `/api/coupang-shipments/files/${encodeURIComponent(runId)}/${encodeURIComponent(date)}/${encodeURIComponent(fileName)}`;
}

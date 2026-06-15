/**
 * Email Generator — Vault Store
 *
 * Replaces the JSON-backed store with Prisma + Supabase.
 * Links all items to the current user (fetched dynamically).
 */

import type { VaultItem } from "./types";
import { prisma, getDefaultUserId } from "../prisma";

class VaultStore {
  async getAll(): Promise<VaultItem[]> {
    const userId = await getDefaultUserId();
    const items = await prisma.vaultItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(this.mapItem);
  }

  async getByType(vaultType: "evidence" | "inspiration"): Promise<VaultItem[]> {
    const userId = await getDefaultUserId();
    const items = await prisma.vaultItem.findMany({
      where: { userId, vaultType },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(this.mapItem);
  }

  async getTopByRecency(
    vaultType: "evidence" | "inspiration",
    limit: number = 3
  ): Promise<VaultItem[]> {
    const userId = await getDefaultUserId();
    const items = await prisma.vaultItem.findMany({
      where: { userId, vaultType },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return items.map(this.mapItem);
  }

  async add(item: Omit<VaultItem, "id" | "timestamp">): Promise<VaultItem> {
    const userId = await getDefaultUserId();
    const created = await prisma.vaultItem.create({
      data: {
        userId,
        type: item.type,
        vaultType: item.vaultType,
        title: item.title,
        content: item.content,
      },
    });
    return this.mapItem(created);
  }

  async remove(id: string): Promise<boolean> {
    const userId = await getDefaultUserId();
    try {
      await prisma.vaultItem.delete({
        where: { id, userId },
      });
      return true;
    } catch {
      return false;
    }
  }

  private mapItem(dbItem: any): VaultItem {
    return {
      id: dbItem.id,
      type: dbItem.type as "text" | "link" | "image" | "pdf",
      vaultType: dbItem.vaultType as "evidence" | "inspiration",
      title: dbItem.title,
      content: dbItem.content,
      timestamp: dbItem.createdAt.getTime(),
    };
  }
}

export const vaultStore = new VaultStore();

const IMAGE_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000;

interface ImageCacheItem {
  description: string;
  expiresAt: number;
}

export class ImageCacheState {
  private readonly cache = new Map<string, ImageCacheItem>();

  public get(file: string): string | null {
    this.cleanupExpiredEntries();

    const cacheItem = this.cache.get(file);
    if (!cacheItem) {
      return null;
    }

    return cacheItem.description;
  }

  public set(file: string, description: string) {
    this.cache.set(file, {
      description,
      expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
    });
  }

  private cleanupExpiredEntries() {
    const now = Date.now();

    for (const [file, cacheItem] of this.cache.entries()) {
      if (cacheItem.expiresAt > now) {
        continue;
      }

      this.cache.delete(file);
    }
  }
}

export const imageCacheState = new ImageCacheState();

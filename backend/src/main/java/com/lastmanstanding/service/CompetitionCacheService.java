package com.lastmanstanding.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.lastmanstanding.config.CacheConfig;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

@Service
public class CompetitionCacheService {

    private final CacheManager cacheManager;

    public CompetitionCacheService(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    public void evictCompetition(Long competitionId) {
        if (competitionId == null) return;
        evictExact(CacheConfig.SURVIVOR_TABLE_CACHE, competitionId.toString());
        evictByPrefix(CacheConfig.GAMEWEEK_SELECTIONS_CACHE, competitionId + ":");
        evictByPrefix(CacheConfig.PICK_STATS_CACHE, competitionId + ":");
        evictByPrefix(CacheConfig.FIXTURES_CACHE, competitionId + ":");
        evictExact(CacheConfig.COMPETITION_DETAILS_CACHE, competitionId.toString());
    }

    public void evictAllCompetitionViews() {
        clear(CacheConfig.SURVIVOR_TABLE_CACHE);
        clear(CacheConfig.GAMEWEEK_SELECTIONS_CACHE);
        clear(CacheConfig.PICK_STATS_CACHE);
        clear(CacheConfig.FIXTURES_CACHE);
        clear(CacheConfig.COMPETITION_DETAILS_CACHE);
    }

    private void evictExact(String cacheName, String key) {
        org.springframework.cache.Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) cache.evictIfPresent(key);
    }

    private void evictByPrefix(String cacheName, String prefix) {
        org.springframework.cache.Cache cache = cacheManager.getCache(cacheName);
        if (cache == null) return;
        Object nativeCache = cache.getNativeCache();
        if (nativeCache instanceof Cache<?, ?> caffeine) {
            caffeine.asMap().keySet().removeIf(key -> String.valueOf(key).startsWith(prefix));
        } else {
            cache.clear();
        }
    }

    private void clear(String cacheName) {
        org.springframework.cache.Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) cache.clear();
    }
}

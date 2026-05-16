package com.lastmanstanding.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.cache.support.SimpleCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CacheConfig {

    public static final String SURVIVOR_TABLE_CACHE = "survivorTableCache";
    public static final String GAMEWEEK_SELECTIONS_CACHE = "gameweekSelectionsCache";
    public static final String PICK_STATS_CACHE = "pickStatsCache";
    public static final String TEAM_BY_ID_CACHE = "teamByIdCache";

    @Bean
    public CacheManager cacheManager() {
        SimpleCacheManager manager = new SimpleCacheManager();
        manager.setCaches(java.util.List.of(
                new CaffeineCache(SURVIVOR_TABLE_CACHE, Caffeine.newBuilder()
                        .maximumSize(500)
                        .expireAfterWrite(Duration.ofSeconds(20))
                        .build()),
                new CaffeineCache(GAMEWEEK_SELECTIONS_CACHE, Caffeine.newBuilder()
                        .maximumSize(1000)
                        .expireAfterWrite(Duration.ofSeconds(20))
                        .build()),
                new CaffeineCache(PICK_STATS_CACHE, Caffeine.newBuilder()
                        .maximumSize(1000)
                        .expireAfterWrite(Duration.ofSeconds(30))
                        .build()),
                new CaffeineCache(TEAM_BY_ID_CACHE, Caffeine.newBuilder()
                        .maximumSize(500)
                        .expireAfterWrite(Duration.ofMinutes(10))
                        .build())
        ));
        return manager;
    }
}

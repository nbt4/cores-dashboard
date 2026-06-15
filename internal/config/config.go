package config

import (
	"os"

	"github.com/rs/zerolog"
)

var configLog = zerolog.New(os.Stderr).With().Timestamp().Str("component", "config").Logger()

type Config struct {
	Port                 string
	JWTSecret            string
	RentalCoreURL        string
	WarehouseCoreURL     string
	PlannercoreURL       string
	RentalPublicURL      string
	WarehousePublicURL   string
	PlannercorePublicURL string
	CookieDomain         string
	DBHost               string
	DBPort               string
	DBName               string
	DBUser               string
	DBPassword           string
	DBSSLMode            string
}

func Load() *Config {
	cfg := &Config{
		Port:                 getEnv("PORT", "8080"),
		JWTSecret:            os.Getenv("CORES_JWT_SECRET"), // FIXED: Removed "dev-secret-change-me" fallback
		RentalCoreURL:        getEnv("RENTALCORE_URL", "http://localhost:8081"),
		WarehouseCoreURL:     getEnv("WAREHOUSECORE_URL", "http://localhost:8082"),
		PlannercoreURL:       getEnv("PLANNERCORE_URL", "http://plannercore:8080"),
		RentalPublicURL:      getEnv("RENTAL_PUBLIC_URL", ""),
		WarehousePublicURL:   getEnv("WAREHOUSE_PUBLIC_URL", ""),
		PlannercorePublicURL: getEnv("PLANNERCORE_PUBLIC_URL", "/planner/"),
		CookieDomain:         getEnv("COOKIE_DOMAIN", ""),
		DBHost:               getEnv("DB_HOST", "localhost"),
		DBPort:               getEnv("DB_PORT", "5432"),
		DBName:               getEnv("DB_NAME", "rentalcore"),
		DBUser:               getEnv("DB_USER", "rentalcore"),
		DBPassword:           os.Getenv("DB_PASSWORD"), // FIXED: Removed "rentalcore123" fallback
		DBSSLMode:            getEnv("DB_SSLMODE", "disable"),
	}

	// FIXED: Hardcoded secrets — require env vars for security-critical values
	if cfg.JWTSecret == "" {
		configLog.Fatal().Msg("CORES_JWT_SECRET environment variable is required")
	}
	if cfg.DBPassword == "" {
		configLog.Fatal().Msg("DB_PASSWORD environment variable is required")
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

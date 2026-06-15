package config

import (
	"fmt"
	"os"

	commonconfig "github.com/nbt4/cores-common/pkg/config"
)

type Config struct {
	Port               string
	JWTSecret          string
	RentalCoreURL      string
	WarehouseCoreURL   string
	PlannercoreURL     string
	RentalPublicURL     string
	WarehousePublicURL  string
	PlannercorePublicURL string
	CookieDomain        string
	DBHost              string
	DBPort              string
	DBName              string
	DBUser              string
	DBPassword          string
	DBSSLMode           string
}

func Load() *Config {
	cfg := &Config{
		Port:                commonconfig.GetEnv("PORT", "8080"),
		JWTSecret:           os.Getenv("CORES_JWT_SECRET"),     // FIXED: Removed "dev-secret-change-me" fallback
		RentalCoreURL:       commonconfig.GetEnv("RENTALCORE_URL", "http://localhost:8081"),
		WarehouseCoreURL:    commonconfig.GetEnv("WAREHOUSECORE_URL", "http://localhost:8082"),
		PlannercoreURL:      commonconfig.GetEnv("PLANNERCORE_URL", "http://plannercore:8080"),
		RentalPublicURL:     commonconfig.GetEnv("RENTAL_PUBLIC_URL", ""),
		WarehousePublicURL:  commonconfig.GetEnv("WAREHOUSE_PUBLIC_URL", ""),
		PlannercorePublicURL: commonconfig.GetEnv("PLANNERCORE_PUBLIC_URL", "/planner/"),
		CookieDomain:        commonconfig.GetEnv("COOKIE_DOMAIN", ""),
		DBHost:              commonconfig.GetEnv("DB_HOST", "localhost"),
		DBPort:              commonconfig.GetEnv("DB_PORT", "5432"),
		DBName:              commonconfig.GetEnv("DB_NAME", "rentalcore"),
		DBUser:              commonconfig.GetEnv("DB_USER", "rentalcore"),
		DBPassword:          os.Getenv("DB_PASSWORD"),           // FIXED: Removed "rentalcore123" fallback
		DBSSLMode:           commonconfig.GetEnv("DB_SSLMODE", "disable"),
	}

	// FIXED: Hardcoded secrets — require env vars for security-critical values
	if cfg.JWTSecret == "" {
		fmt.Fprintln(os.Stderr, "FATAL: CORES_JWT_SECRET environment variable is required")
		os.Exit(1)
	}
	if cfg.DBPassword == "" {
		fmt.Fprintln(os.Stderr, "FATAL: DB_PASSWORD environment variable is required")
		os.Exit(1)
	}

	return cfg
}

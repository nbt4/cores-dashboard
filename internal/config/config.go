package config

import (
	"fmt"
	"os"
	"strings"

	commonconfig "github.com/nbt4/cores-common/pkg/config"
)

type Config struct {
	RoutingMode          string
	Port                 string
	JWTSecret            string
	RentalCoreURL        string
	WarehouseCoreURL     string
	PlannercoreURL       string
	ProcurementCoreURL   string
	RentalPublicURL      string
	WarehousePublicURL   string
	PlannercorePublicURL string
	ProcurementPublicURL string
	CookieDomain         string
	DBHost               string
	DBPort               string
	DBName               string
	DBUser               string
	DBPassword           string
	DBSSLMode            string
}

func Load() *Config {
	routingMode := strings.ToLower(strings.TrimSpace(commonconfig.GetEnv("CORES_ROUTING_MODE", "paths")))
	if routingMode != "paths" && routingMode != "subdomains" {
		fmt.Fprintf(os.Stderr, "FATAL: CORES_ROUTING_MODE must be paths or subdomains, got %q\n", routingMode)
		os.Exit(1)
	}

	cfg := &Config{
		RoutingMode:          routingMode,
		Port:                 commonconfig.GetEnv("PORT", "8080"),
		JWTSecret:            os.Getenv("CORES_JWT_SECRET"), // FIXED: Removed "dev-secret-change-me" fallback
		RentalCoreURL:        commonconfig.GetEnv("RENTALCORE_URL", "http://localhost:8081"),
		WarehouseCoreURL:     commonconfig.GetEnv("WAREHOUSECORE_URL", "http://localhost:8082"),
		PlannercoreURL:       commonconfig.GetEnv("PLANNERCORE_URL", "http://plannercore:8080"),
		ProcurementCoreURL:   commonconfig.GetEnv("PROCUREMENTCORE_URL", "http://procurementcore:8084"),
		RentalPublicURL:      commonconfig.GetEnv("RENTALCORE_PUBLIC_URL", commonconfig.GetEnv("RENTAL_PUBLIC_URL", "")),
		WarehousePublicURL:   commonconfig.GetEnv("WAREHOUSECORE_PUBLIC_URL", commonconfig.GetEnv("WAREHOUSE_PUBLIC_URL", "")),
		PlannercorePublicURL: commonconfig.GetEnv("PLANNERCORE_PUBLIC_URL", ""),
		ProcurementPublicURL: commonconfig.GetEnv("PROCUREMENTCORE_PUBLIC_URL", ""),
		CookieDomain:         commonconfig.GetEnv("COOKIE_DOMAIN", ""),
		DBHost:               commonconfig.GetEnv("DB_HOST", "localhost"),
		DBPort:               commonconfig.GetEnv("DB_PORT", "5432"),
		DBName:               commonconfig.GetEnv("DB_NAME", "rentalcore"),
		DBUser:               commonconfig.GetEnv("DB_USER", "rentalcore"),
		DBPassword:           os.Getenv("DB_PASSWORD"), // FIXED: Removed "rentalcore123" fallback
		DBSSLMode:            commonconfig.GetEnv("DB_SSLMODE", "disable"),
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

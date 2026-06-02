package config

import "os"

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
	return &Config{
		Port:                getEnv("PORT", "8080"),
		JWTSecret:           getEnv("CORES_JWT_SECRET", "dev-secret-change-me"),
		RentalCoreURL:       getEnv("RENTALCORE_URL", "http://localhost:8081"),
		WarehouseCoreURL:    getEnv("WAREHOUSECORE_URL", "http://localhost:8082"),
		PlannercoreURL:      getEnv("PLANNERCORE_URL", "http://plannercore:8080"),
		RentalPublicURL:     getEnv("RENTAL_PUBLIC_URL", ""),
		WarehousePublicURL:  getEnv("WAREHOUSE_PUBLIC_URL", ""),
		PlannercorePublicURL: getEnv("PLANNERCORE_PUBLIC_URL", "/planner/"),
		CookieDomain:        getEnv("COOKIE_DOMAIN", ""),
		DBHost:              getEnv("DB_HOST", "localhost"),
		DBPort:              getEnv("DB_PORT", "5432"),
		DBName:              getEnv("DB_NAME", "rentalcore"),
		DBUser:              getEnv("DB_USER", "rentalcore"),
		DBPassword:          getEnv("DB_PASSWORD", "rentalcore123"),
		DBSSLMode:           getEnv("DB_SSLMODE", "disable"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

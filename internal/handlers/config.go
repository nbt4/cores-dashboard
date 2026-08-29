package handlers

import (
	"encoding/json"
	"net/http"

	"gorm.io/gorm"

	"coresdashboard/internal/config"
	"coresdashboard/internal/models"
)

func publicServiceURLs(cfg *config.Config) map[string]string {
	if cfg.RoutingMode == "paths" {
		return map[string]string{
			"rentalUrl":      "/rentalcore/",
			"warehouseUrl":   "/warehousecore/",
			"plannerUrl":     "/plannercore/",
			"procurementUrl": "/procurementcore/",
		}
	}
	return map[string]string{
		"rentalUrl":      cfg.RentalPublicURL,
		"warehouseUrl":   cfg.WarehousePublicURL,
		"plannerUrl":     cfg.PlannercorePublicURL,
		"procurementUrl": cfg.ProcurementPublicURL,
	}
}

func ConfigHandler(cfg *config.Config, db *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serviceURLs := publicServiceURLs(cfg)
		payload := map[string]interface{}{
			"routingMode":    cfg.RoutingMode,
			"rentalUrl":      serviceURLs["rentalUrl"],
			"warehouseUrl":   serviceURLs["warehouseUrl"],
			"plannerUrl":     serviceURLs["plannerUrl"],
			"procurementUrl": serviceURLs["procurementUrl"],
		}

		// Include branding basics if available
		var bc models.BrandingConfig
		if err := db.First(&bc, 1).Error; err == nil {
			payload["branding"] = map[string]interface{}{
				"companyName":     bc.CompanyName,
				"brandName":       bc.BrandName,
				"logoSizeSidebar": bc.LogoSizeSidebar,
				"logoSizeLogin":   bc.LogoSizeLogin,
				"hasFavicon":      bc.FaviconPath != nil && *bc.FaviconPath != "",
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(payload)
	}
}

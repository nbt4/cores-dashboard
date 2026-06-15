package handlers

import (
	"encoding/json"
	"net/http"

	"gorm.io/gorm"

	"coresdashboard/internal/config"
	"coresdashboard/internal/models"
)

func ConfigHandler(cfg *config.Config, db *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload := map[string]interface{}{
			"rentalUrl":    cfg.RentalPublicURL,
			"warehouseUrl": cfg.WarehousePublicURL,
			"plannerUrl":   cfg.PlannercorePublicURL,
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

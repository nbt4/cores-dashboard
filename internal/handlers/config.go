package handlers

import (
	"encoding/json"
	"net/http"

	"coresdashboard/internal/config"
)

func ConfigHandler(cfg *config.Config) http.HandlerFunc {
	payload, _ := json.Marshal(map[string]string{
		"rentalUrl":    cfg.RentalPublicURL,
		"warehouseUrl": cfg.WarehousePublicURL,
		"plannerUrl":   cfg.PlannercorePublicURL,
	})
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(payload)
	}
}
